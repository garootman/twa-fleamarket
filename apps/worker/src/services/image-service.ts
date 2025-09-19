export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  size: number;
  contentType: string;
  uploadedAt: string;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export class ImageService {
  private r2Bucket: R2Bucket;
  private baseUrl: string;

  constructor(r2Bucket: R2Bucket, baseUrl: string = '') {
    this.r2Bucket = r2Bucket;
    this.baseUrl = baseUrl;
  }

  /**
   * Upload image to R2 storage
   */
  async uploadImage(
    file: File | ArrayBuffer,
    filename: string,
    contentType: string,
    userId: number
  ): Promise<UploadResult> {
    try {
      // Generate unique filename with user prefix
      const timestamp = Date.now();
      const fileExtension = filename.split('.').pop() || '';
      const uniqueFilename = `images/user_${userId}/${timestamp}_${filename}`;

      // Convert File to ArrayBuffer if needed
      const buffer = file instanceof File ? await file.arrayBuffer() : file;

      // Upload to R2
      const uploadResult = await this.r2Bucket.put(uniqueFilename, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=31536000', // 1 year cache
        },
        customMetadata: {
          userId: userId.toString(),
          originalFilename: filename,
          uploadedAt: new Date().toISOString(),
        },
      });

      if (!uploadResult) {
        throw new Error('Failed to upload to R2');
      }

      const publicUrl = this.baseUrl
        ? `${this.baseUrl}/${uniqueFilename}`
        : `https://your-r2-domain.com/${uniqueFilename}`;

      return {
        id: uniqueFilename,
        url: publicUrl,
        filename: filename,
        size: buffer.byteLength,
        contentType,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error uploading image:', error);
      throw new Error('Failed to upload image');
    }
  }

  /**
   * Delete image from R2 storage
   */
  async deleteImage(imageId: string): Promise<boolean> {
    try {
      await this.r2Bucket.delete(imageId);
      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }

  /**
   * Get image metadata from R2
   */
  async getImageMetadata(imageId: string): Promise<R2Object | null> {
    try {
      return await this.r2Bucket.head(imageId);
    } catch (error) {
      console.error('Error getting image metadata:', error);
      return null;
    }
  }

  /**
   * Validate image file
   */
  validateImage(file: File, maxSizeBytes: number = 5 * 1024 * 1024): string | null {
    // Check file size (default 5MB)
    if (file.size > maxSizeBytes) {
      return `File size too large. Maximum size is ${maxSizeBytes / 1024 / 1024}MB`;
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed';
    }

    // Check filename
    if (!file.name || file.name.length > 255) {
      return 'Invalid filename';
    }

    return null; // No errors
  }

  /**
   * Generate thumbnail URL (if you have image processing setup)
   */
  generateThumbnailUrl(imageUrl: string, width: number = 150, height: number = 150): string {
    // This would depend on your image processing setup
    // For now, return the original URL
    return imageUrl;
  }

  /**
   * Get public URL for an image
   */
  getPublicUrl(imageId: string): string {
    return this.baseUrl
      ? `${this.baseUrl}/${imageId}`
      : `https://your-r2-domain.com/${imageId}`;
  }

  /**
   * Clean up old images for a user (maintenance function)
   */
  async cleanupUserImages(userId: number, keepCount: number = 50): Promise<number> {
    try {
      // List all objects for user
      const prefix = `images/user_${userId}/`;
      const listResult = await this.r2Bucket.list({ prefix });

      if (listResult.objects.length <= keepCount) {
        return 0; // Nothing to clean up
      }

      // Sort by uploaded date (oldest first)
      const sortedObjects = listResult.objects.sort((a, b) =>
        new Date(a.uploaded).getTime() - new Date(b.uploaded).getTime()
      );

      // Delete oldest images beyond keepCount
      const toDelete = sortedObjects.slice(0, sortedObjects.length - keepCount);
      let deletedCount = 0;

      for (const obj of toDelete) {
        try {
          await this.r2Bucket.delete(obj.key);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete image ${obj.key}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up user images:', error);
      return 0;
    }
  }

  /**
   * Process multiple image uploads
   */
  async uploadMultipleImages(
    files: File[],
    userId: number,
    maxImages: number = 5
  ): Promise<UploadResult[]> {
    if (files.length > maxImages) {
      throw new Error(`Too many images. Maximum ${maxImages} images allowed`);
    }

    const results: UploadResult[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const validationError = this.validateImage(file);
        if (validationError) {
          errors.push(`${file.name}: ${validationError}`);
          continue;
        }

        const result = await this.uploadImage(
          file,
          file.name,
          file.type,
          userId
        );
        results.push(result);
      } catch (error) {
        errors.push(`${file.name}: Failed to upload`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      throw new Error(`All uploads failed: ${errors.join(', ')}`);
    }

    return results;
  }
}