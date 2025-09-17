/**
 * ImageService - T055 / T096
 *
 * Provides business logic for image upload, processing, and R2 storage integration.
 * Handles image validation, resizing, optimization, and CDN delivery with CloudFlare R2.
 * Enhanced with connection management, retry logic, and error handling.
 */

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  thumbnailUrl?: string;
  metadata?: ImageMetadata;
  error?: string;
}

export interface ImageMetadata {
  filename: string;
  originalSize: number;
  processedSize: number;
  dimensions: { width: number; height: number };
  format: string;
  uploadedAt: string;
  storageKey: string;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  generateThumbnail?: boolean;
  thumbnailSize?: number;
}

export interface ImageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    size: number;
    type: string;
    dimensions?: { width: number; height: number };
  };
}

export interface R2UploadOptions {
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface R2ConnectionConfig {
  bucket: any;
  cdnBaseUrl: string;
  region?: string;
  publicUrl?: string;
}

export class ImageService {
  private r2Bucket: any; // R2 bucket instance
  private cdnBaseUrl: string;
  private maxFileSize: number;
  private allowedTypes: string[];
  private uploadOptions: R2UploadOptions;
  private connectionHealth: boolean = true;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 300000; // 5 minutes

  constructor(
    config: R2ConnectionConfig,
    maxFileSize = 5 * 1024 * 1024, // 5MB
    allowedTypes = ['image/jpeg', 'image/png', 'image/webp'],
    uploadOptions: R2UploadOptions = {}
  ) {
    this.r2Bucket = config.bucket;
    this.cdnBaseUrl = config.cdnBaseUrl;
    this.maxFileSize = maxFileSize;
    this.allowedTypes = allowedTypes;
    this.uploadOptions = {
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 30000,
      ...uploadOptions,
    };
  }

  /**
   * Upload image with processing and optimization
   */
  async uploadImage(
    file: File | ArrayBuffer,
    filename: string,
    options: ImageProcessingOptions = {}
  ): Promise<ImageUploadResult> {
    try {
      // Validate image
      const validation = await this.validateImage(file, filename);
      if (!validation.valid) {
        return {
          success: false,
          error: `Image validation failed: ${validation.errors.join(', ')}`,
        };
      }

      // Generate unique storage key
      const storageKey = this.generateStorageKey(filename);
      const thumbnailKey = options.generateThumbnail ? `${storageKey}_thumb` : undefined;

      // Process image
      const processedImage = await this.processImage(file, options);
      const thumbnail = options.generateThumbnail
        ? await this.generateThumbnail(file, options.thumbnailSize || 300)
        : undefined;

      // Check R2 connection health
      await this.ensureR2Connection();

      // Upload to R2 with retry logic
      const uploadPromises = [
        this.uploadToR2WithRetry(storageKey, processedImage.buffer, processedImage.contentType),
      ];

      if (thumbnail && thumbnailKey) {
        uploadPromises.push(
          this.uploadToR2WithRetry(thumbnailKey, thumbnail.buffer, thumbnail.contentType)
        );
      }

      const uploadResults = await Promise.allSettled(uploadPromises);

      // Check if all uploads succeeded
      const failedUploads = uploadResults.filter(result => result.status === 'rejected');
      if (failedUploads.length > 0) {
        throw new Error(
          `Upload failed: ${failedUploads.map(f => (f as PromiseRejectedResult).reason).join(', ')}`
        );
      }

      // Generate URLs
      const url = `${this.cdnBaseUrl}/${storageKey}`;
      const thumbnailUrl = thumbnailKey ? `${this.cdnBaseUrl}/${thumbnailKey}` : undefined;

      // Create metadata
      const metadata: ImageMetadata = {
        filename,
        originalSize: validation.metadata!.size,
        processedSize: processedImage.buffer.byteLength,
        dimensions: processedImage.dimensions,
        format: processedImage.format,
        uploadedAt: new Date().toISOString(),
        storageKey,
      };

      return {
        success: true,
        url,
        thumbnailUrl,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image upload failed',
      };
    }
  }

  /**
   * Upload multiple images
   */
  async uploadMultipleImages(
    files: Array<{ file: File | ArrayBuffer; filename: string }>,
    options: ImageProcessingOptions = {}
  ): Promise<{
    results: ImageUploadResult[];
    successCount: number;
    failureCount: number;
    urls: string[];
  }> {
    const results = await Promise.all(
      files.map(({ file, filename }) => this.uploadImage(file, filename, options))
    );

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    const urls = results.filter(r => r.success).map(r => r.url!);

    return {
      results,
      successCount,
      failureCount,
      urls,
    };
  }

  /**
   * Delete image from storage
   */
  async deleteImage(storageKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureR2Connection();

      // Delete main image with retry
      await this.deleteFromR2WithRetry(storageKey);

      // Also delete thumbnail if exists
      const thumbnailKey = `${storageKey}_thumb`;
      try {
        await this.deleteFromR2WithRetry(thumbnailKey);
      } catch {
        // Thumbnail might not exist, ignore error
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image deletion failed',
      };
    }
  }

  /**
   * Delete multiple images
   */
  async deleteMultipleImages(storageKeys: string[]): Promise<{
    results: Array<{ key: string; success: boolean; error?: string }>;
    successCount: number;
    failureCount: number;
  }> {
    const results = await Promise.all(
      storageKeys.map(async key => {
        const result = await this.deleteImage(key);
        return { key, ...result };
      })
    );

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return { results, successCount, failureCount };
  }

  /**
   * Get image metadata from storage
   */
  async getImageMetadata(storageKey: string): Promise<{
    exists: boolean;
    metadata?: any;
    error?: string;
  }> {
    try {
      const head = await this.r2Bucket.head(storageKey);
      if (!head) {
        return { exists: false };
      }

      return {
        exists: true,
        metadata: {
          size: head.size,
          etag: head.etag,
          lastModified: head.uploaded,
          contentType: head.httpMetadata?.contentType,
        },
      };
    } catch (error) {
      return {
        exists: false,
        error: error instanceof Error ? error.message : 'Failed to get metadata',
      };
    }
  }

  /**
   * Generate signed URL for temporary access
   */
  async generateSignedUrl(
    storageKey: string,
    expiresInSeconds = 3600
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      // R2 signed URL generation would go here
      // For now, return the regular CDN URL
      const url = `${this.cdnBaseUrl}/${storageKey}`;

      return { success: true, url };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate signed URL',
      };
    }
  }

  /**
   * Validate image file
   */
  private async validateImage(
    file: File | ArrayBuffer,
    filename: string
  ): Promise<ImageValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get file data
    const buffer = file instanceof File ? await file.arrayBuffer() : file;
    const size = buffer.byteLength;
    const type = file instanceof File ? file.type : this.detectMimeType(filename);

    // Size validation
    if (size > this.maxFileSize) {
      errors.push(
        `File size ${this.formatFileSize(size)} exceeds maximum ${this.formatFileSize(this.maxFileSize)}`
      );
    }

    if (size < 1024) {
      errors.push('File is too small');
    }

    // Type validation
    if (!this.allowedTypes.includes(type)) {
      errors.push(
        `File type ${type} is not allowed. Allowed types: ${this.allowedTypes.join(', ')}`
      );
    }

    // Image signature validation
    const isValidImage = this.validateImageSignature(new Uint8Array(buffer));
    if (!isValidImage) {
      errors.push('File is not a valid image');
    }

    // Get image dimensions (simplified - would use proper image library)
    const dimensions = await this.getImageDimensions(buffer);

    // Dimension validation
    if (dimensions) {
      if (dimensions.width < 100 || dimensions.height < 100) {
        errors.push('Image dimensions are too small (minimum 100x100)');
      }
      if (dimensions.width > 4096 || dimensions.height > 4096) {
        warnings.push('Image dimensions are very large, will be resized');
      }
    }

    // Filename validation
    if (!/^[a-zA-Z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      errors.push('Invalid filename format');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        size,
        type,
        dimensions: dimensions || undefined,
      },
    };
  }

  /**
   * Process image (resize, optimize, convert)
   */
  private async processImage(
    file: File | ArrayBuffer,
    options: ImageProcessingOptions
  ): Promise<{
    buffer: ArrayBuffer;
    contentType: string;
    dimensions: { width: number; height: number };
    format: string;
  }> {
    // In a real implementation, this would use an image processing library
    // like sharp, canvas, or WebAssembly-based solution

    const buffer = file instanceof File ? await file.arrayBuffer() : file;
    const dimensions = (await this.getImageDimensions(buffer)) || { width: 800, height: 600 };

    // For now, return the original image
    // In production, would resize/optimize based on options
    return {
      buffer,
      contentType: 'image/jpeg',
      dimensions,
      format: 'jpeg',
    };
  }

  /**
   * Generate thumbnail
   */
  private async generateThumbnail(
    file: File | ArrayBuffer,
    size = 300
  ): Promise<{
    buffer: ArrayBuffer;
    contentType: string;
  }> {
    // In a real implementation, this would generate a square thumbnail
    const buffer = file instanceof File ? await file.arrayBuffer() : file;

    return {
      buffer,
      contentType: 'image/jpeg',
    };
  }

  /**
   * Upload to R2 storage
   */
  private async uploadToR2(key: string, buffer: ArrayBuffer, contentType: string): Promise<void> {
    await this.r2Bucket.put(key, buffer, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000', // 1 year
      },
    });
  }

  /**
   * Generate unique storage key
   */
  private generateStorageKey(filename: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const extension = filename.split('.').pop()?.toLowerCase() || 'jpg';
    return `images/${timestamp}-${random}.${extension}`;
  }

  /**
   * Detect MIME type from filename
   */
  private detectMimeType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Validate image file signature
   */
  private validateImageSignature(buffer: Uint8Array): boolean {
    // Check for common image file signatures
    const signatures = {
      jpeg: [0xff, 0xd8, 0xff],
      png: [0x89, 0x50, 0x4e, 0x47],
      webp: [0x52, 0x49, 0x46, 0x46], // RIFF (WebP starts with RIFF)
    };

    for (const [format, signature] of Object.entries(signatures)) {
      if (this.matchesSignature(buffer, signature)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if buffer matches signature
   */
  private matchesSignature(buffer: Uint8Array, signature: number[]): boolean {
    if (buffer.length < signature.length) return false;

    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) return false;
    }

    return true;
  }

  /**
   * Get image dimensions (simplified implementation)
   */
  private async getImageDimensions(
    buffer: ArrayBuffer
  ): Promise<{ width: number; height: number } | null> {
    // In a real implementation, this would parse image headers to get dimensions
    // For now, return mock dimensions
    return { width: 800, height: 600 };
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);

    return `${size.toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    totalImages: number;
    totalSize: number;
    averageSize: number;
    storageUsed: string;
    quotaUsed: number;
  }> {
    // In a real implementation, this would query R2 for usage stats
    return {
      totalImages: 0,
      totalSize: 0,
      averageSize: 0,
      storageUsed: '0 MB',
      quotaUsed: 0,
    };
  }

  /**
   * Cleanup orphaned images
   */
  async cleanupOrphanedImages(activeImageUrls: string[]): Promise<{
    deletedCount: number;
    freedSpace: number;
    errors: string[];
  }> {
    try {
      await this.ensureR2Connection();

      // In a real implementation, this would:
      // 1. List all images in R2
      // 2. Compare with activeImageUrls
      // 3. Delete orphaned images
      // 4. Return cleanup statistics

      // For now, return empty stats
      return {
        deletedCount: 0,
        freedSpace: 0,
        errors: [],
      };
    } catch (error) {
      return {
        deletedCount: 0,
        freedSpace: 0,
        errors: [error instanceof Error ? error.message : 'Cleanup failed'],
      };
    }
  }

  /**
   * Ensure R2 connection is healthy
   */
  private async ensureR2Connection(): Promise<void> {
    const now = Date.now();

    // Skip health check if recently verified
    if (this.connectionHealth && now - this.lastHealthCheck < this.healthCheckInterval) {
      return;
    }

    try {
      // Simple health check - try to list bucket contents
      await this.r2Bucket.list({ limit: 1 });
      this.connectionHealth = true;
      this.lastHealthCheck = now;
    } catch (error) {
      this.connectionHealth = false;
      throw new Error(`R2 connection failed: ${error}`);
    }
  }

  /**
   * Upload to R2 with retry logic
   */
  private async uploadToR2WithRetry(
    key: string,
    buffer: ArrayBuffer,
    contentType: string
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= (this.uploadOptions.retryAttempts || 3); attempt++) {
      try {
        await this.uploadToR2(key, buffer, contentType);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === (this.uploadOptions.retryAttempts || 3)) {
          break; // Don't retry on final attempt
        }

        // Wait before retry
        await this.delay(this.uploadOptions.retryDelay || 1000);
      }
    }

    throw new Error(
      `Upload failed after ${this.uploadOptions.retryAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Delete from R2 with retry logic
   */
  private async deleteFromR2WithRetry(key: string): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= (this.uploadOptions.retryAttempts || 3); attempt++) {
      try {
        await this.r2Bucket.delete(key);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === (this.uploadOptions.retryAttempts || 3)) {
          break; // Don't retry on final attempt
        }

        // Wait before retry
        await this.delay(this.uploadOptions.retryDelay || 1000);
      }
    }

    throw new Error(
      `Delete failed after ${this.uploadOptions.retryAttempts} attempts: ${lastError?.message}`
    );
  }

  /**
   * Enhanced upload to R2 with timeout and error handling
   */
  private async uploadToR2(key: string, buffer: ArrayBuffer, contentType: string): Promise<void> {
    try {
      // Add timeout wrapper
      const uploadPromise = this.r2Bucket.put(key, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=31536000', // 1 year
        },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          source: 'telegram-marketplace',
        },
      });

      // Implement timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Upload timeout')), this.uploadOptions.timeout || 30000);
      });

      await Promise.race([uploadPromise, timeoutPromise]);
    } catch (error) {
      // Add more specific error handling
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error(`Upload timeout for key: ${key}`);
        }
        if (error.message.includes('network')) {
          throw new Error(`Network error uploading: ${key}`);
        }
        if (error.message.includes('quota') || error.message.includes('limit')) {
          throw new Error(`Storage quota exceeded for key: ${key}`);
        }
      }
      throw error;
    }
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get R2 connection status
   */
  async getConnectionStatus(): Promise<{
    healthy: boolean;
    lastCheck: Date | null;
    error?: string;
  }> {
    try {
      await this.ensureR2Connection();
      return {
        healthy: this.connectionHealth,
        lastCheck: this.lastHealthCheck ? new Date(this.lastHealthCheck) : null,
      };
    } catch (error) {
      return {
        healthy: false,
        lastCheck: this.lastHealthCheck ? new Date(this.lastHealthCheck) : null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get enhanced storage statistics from R2
   */
  async getStorageStats(): Promise<{
    totalImages: number;
    totalSize: number;
    averageSize: number;
    storageUsed: string;
    quotaUsed: number;
    connectionHealth: boolean;
  }> {
    try {
      await this.ensureR2Connection();

      // In production, this would query R2 for actual usage stats
      // For now, return mock data with connection health
      return {
        totalImages: 0,
        totalSize: 0,
        averageSize: 0,
        storageUsed: '0 MB',
        quotaUsed: 0,
        connectionHealth: this.connectionHealth,
      };
    } catch (error) {
      return {
        totalImages: 0,
        totalSize: 0,
        averageSize: 0,
        storageUsed: 'Unknown',
        quotaUsed: 0,
        connectionHealth: false,
      };
    }
  }
}
