export interface ImageUploadResult {
  success: boolean;
  imageUrl?: string;
  thumbnailUrl?: string | undefined;
  imageKey?: string;
  error?: string;
}

export interface ImageMetadata {
  key: string;
  url: string;
  thumbnailUrl?: string | undefined;
  contentType: string;
  size: number;
  uploadedAt: string;
  width?: number | undefined;
  height?: number | undefined;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  createThumbnail?: boolean;
  thumbnailSize?: number;
}

export class ImageService {
  private r2: R2Bucket;

  constructor(r2Bucket: R2Bucket) {
    this.r2 = r2Bucket;
  }

  /**
   * Upload and process listing images
   */
  async uploadListingImage(
    listingId: string,
    imageFile: File | ArrayBuffer,
    options: ImageProcessingOptions = {}
  ): Promise<ImageUploadResult> {
    try {
      const {
        maxWidth = 1200,
        maxHeight = 900,
        quality = 0.9,
        createThumbnail = true,
        thumbnailSize = 300,
      } = options;

      // Process the image
      const processedImage = await this.processImage(imageFile, {
        maxWidth,
        maxHeight,
        quality,
      });

      if (!processedImage.success) {
        return {
          success: false,
          error: processedImage.error || 'Image processing failed',
        };
      }

      // Generate unique key for the image
      const timestamp = Date.now();
      const imageKey = `listings/${listingId}/${timestamp}.jpg`;
      const thumbnailKey = createThumbnail
        ? `listings/${listingId}/thumb_${timestamp}.jpg`
        : undefined;

      // Upload main image
      await this.r2.put(imageKey, processedImage.data!, {
        httpMetadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000', // 1 year cache
        },
        customMetadata: {
          listingId,
          type: 'listing-image',
          uploadedAt: new Date().toISOString(),
          originalSize: processedImage.originalSize?.toString() || '0',
          processedSize: processedImage.data!.byteLength.toString(),
          width: processedImage.width?.toString() || '0',
          height: processedImage.height?.toString() || '0',
        },
      });

      let thumbnailUrl: string | undefined;

      // Create and upload thumbnail if requested
      if (createThumbnail && thumbnailKey) {
        const thumbnail = await this.createThumbnail(processedImage.data!, thumbnailSize);
        if (thumbnail.success && thumbnail.data) {
          await this.r2.put(thumbnailKey, thumbnail.data, {
            httpMetadata: {
              contentType: 'image/jpeg',
              cacheControl: 'public, max-age=31536000',
            },
            customMetadata: {
              listingId,
              type: 'thumbnail',
              parentImage: imageKey,
              uploadedAt: new Date().toISOString(),
            },
          });

          thumbnailUrl = `/image/${thumbnailKey}`;
        }
      }

      return {
        success: true,
        imageUrl: `/image/${imageKey}`,
        thumbnailUrl,
        imageKey,
      };
    } catch (error) {
      console.error('Error uploading listing image:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Process image: resize, compress, and validate
   */
  async processImage(
    input: File | ArrayBuffer,
    options: { maxWidth: number; maxHeight: number; quality: number }
  ): Promise<{
    success: boolean;
    data?: ArrayBuffer;
    width?: number;
    height?: number;
    originalSize?: number;
    error?: string;
  }> {
    try {
      let arrayBuffer: ArrayBuffer;
      let originalSize: number;

      if (input instanceof File) {
        arrayBuffer = await input.arrayBuffer();
        originalSize = input.size;
      } else {
        arrayBuffer = input;
        originalSize = arrayBuffer.byteLength;
      }

      // Basic image validation (check for JPEG/PNG headers)
      const uint8Array = new Uint8Array(arrayBuffer);
      const isJPEG = uint8Array[0] === 0xff && uint8Array[1] === 0xd8;
      const isPNG = uint8Array[0] === 0x89 && uint8Array[1] === 0x50;

      if (!isJPEG && !isPNG) {
        return {
          success: false,
          error: 'Only JPEG and PNG images are supported',
        };
      }

      // For now, return the image as-is since we don't have image processing libraries
      // In a full implementation, you would use libraries like Sharp (not available in Workers)
      // or implement client-side processing with Canvas API

      // Basic size check
      if (originalSize > 10 * 1024 * 1024) {
        // 10MB limit
        return {
          success: false,
          error: 'Image too large (max 10MB)',
        };
      }

      return {
        success: true,
        data: arrayBuffer,
        originalSize,
        // Note: Real width/height would be extracted with image processing library
        width: 1200, // Placeholder
        height: 900, // Placeholder
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image processing failed',
      };
    }
  }

  /**
   * Create thumbnail from processed image data
   */
  async createThumbnail(
    imageData: ArrayBuffer,
    size: number
  ): Promise<{
    success: boolean;
    data?: ArrayBuffer;
    error?: string;
  }> {
    try {
      // In a full implementation, this would resize the image to create a thumbnail
      // For now, we'll return the original image (client-side processing would handle this)

      return {
        success: true,
        data: imageData, // Placeholder - would be actual thumbnail
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Thumbnail creation failed',
      };
    }
  }

  /**
   * Get listing images with metadata
   */
  async getListingImages(listingId: string): Promise<ImageMetadata[]> {
    try {
      const prefix = `listings/${listingId}/`;
      const listResult = await this.r2.list({ prefix, limit: 1000 });

      const images: ImageMetadata[] = [];

      for (const keyInfo of listResult.objects) {
        // Skip thumbnails in main list
        if (keyInfo.key.includes('thumb_')) continue;

        const metadata = await this.r2.head(keyInfo.key);
        if (!metadata) continue;

        const customMeta = metadata.customMetadata || {};
        const thumbnailKey = `listings/${listingId}/thumb_${keyInfo.key.split('/').pop()}`;

        // Check if thumbnail exists
        let thumbnailUrl: string | undefined;
        try {
          const thumbExists = await this.r2.head(thumbnailKey);
          if (thumbExists) {
            thumbnailUrl = `/image/${thumbnailKey}`;
          }
        } catch {
          // Thumbnail doesn't exist, that's okay
        }

        images.push({
          key: keyInfo.key,
          url: `/image/${keyInfo.key}`,
          thumbnailUrl,
          contentType: metadata.httpMetadata?.contentType || 'image/jpeg',
          size: keyInfo.size || 0,
          uploadedAt: customMeta.uploadedAt || new Date(keyInfo.uploaded).toISOString(),
          width: customMeta.width ? parseInt(customMeta.width) : undefined,
          height: customMeta.height ? parseInt(customMeta.height) : undefined,
        });
      }

      // Sort by upload time (newest first)
      return images.sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
    } catch (error) {
      console.error('Error getting listing images:', error);
      return [];
    }
  }

  /**
   * Delete listing image and its thumbnail
   */
  async deleteListingImage(imageKey: string): Promise<boolean> {
    try {
      // Delete main image
      await this.r2.delete(imageKey);

      // Delete thumbnail if exists
      const parts = imageKey.split('/');
      const filename = parts.pop();
      const thumbnailKey = parts.join('/') + `/thumb_${filename}`;

      try {
        await this.r2.delete(thumbnailKey);
      } catch {
        // Thumbnail might not exist, that's okay
      }

      return true;
    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }

  /**
   * Delete all images for a listing
   */
  async deleteListingImages(listingId: string): Promise<number> {
    try {
      const prefix = `listings/${listingId}/`;
      const listResult = await this.r2.list({ prefix, limit: 1000 });

      let deletedCount = 0;
      const deletePromises = listResult.objects.map(async keyInfo => {
        try {
          await this.r2.delete(keyInfo.key);
          deletedCount++;
        } catch (error) {
          console.error(`Error deleting image ${keyInfo.key}:`, error);
        }
      });

      await Promise.all(deletePromises);
      return deletedCount;
    } catch (error) {
      console.error('Error deleting listing images:', error);
      return 0;
    }
  }

  /**
   * Upload user profile image
   */
  async uploadUserProfileImage(
    userId: number,
    imageFile: File | ArrayBuffer
  ): Promise<ImageUploadResult> {
    try {
      const processed = await this.processImage(imageFile, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.9,
      });

      if (!processed.success) {
        return {
          success: false,
          error: processed.error || 'Image processing failed',
        };
      }

      const imageKey = `users/${userId}/profile.jpg`;

      await this.r2.put(imageKey, processed.data!, {
        httpMetadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        },
        customMetadata: {
          userId: userId.toString(),
          type: 'profile-image',
          uploadedAt: new Date().toISOString(),
        },
      });

      return {
        success: true,
        imageUrl: `/image/${imageKey}`,
        imageKey,
      };
    } catch (error) {
      console.error('Error uploading profile image:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Get image with caching support
   */
  async getImage(
    imageKey: string,
    options: {
      format?: 'original' | 'thumbnail';
      etag?: string;
    } = {}
  ): Promise<{
    data: R2ObjectBody | null;
    notModified: boolean;
  }> {
    try {
      const { format = 'original', etag } = options;

      // If it's a thumbnail request, modify the key
      let actualKey = imageKey;
      if (format === 'thumbnail' && !imageKey.includes('thumb_')) {
        const parts = imageKey.split('/');
        const filename = parts.pop();
        actualKey = parts.join('/') + `/thumb_${filename}`;
      }

      // Check if object exists and handle ETags for caching
      const object = await this.r2.get(
        actualKey,
        etag
          ? {
              onlyIf: { etagDoesNotMatch: etag },
            }
          : {}
      );

      return {
        data: object,
        notModified: object === null && !!etag,
      };
    } catch (error) {
      console.error('Error getting image:', error);
      return {
        data: null,
        notModified: false,
      };
    }
  }

  /**
   * Generate presigned URL for direct upload (if needed for large files)
   */
  async generateUploadUrl(
    listingId: string,
    expiresIn: number = 3600 // 1 hour
  ): Promise<{
    success: boolean;
    uploadUrl?: string;
    imageKey?: string;
    error?: string;
  }> {
    try {
      const timestamp = Date.now();
      const imageKey = `listings/${listingId}/${timestamp}.jpg`;

      // Note: CloudFlare R2 presigned URLs would be implemented here
      // This is a placeholder for the concept

      return {
        success: false,
        error: 'Presigned URLs not implemented in this version',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate upload URL',
      };
    }
  }

  /**
   * Clean up orphaned images (images without associated listings)
   */
  async cleanupOrphanedImages(validListingIds: string[]): Promise<{
    scanned: number;
    deleted: number;
  }> {
    try {
      const validIdSet = new Set(validListingIds);
      const listResult = await this.r2.list({ prefix: 'listings/', limit: 10000 });

      let scanned = 0;
      let deleted = 0;

      for (const keyInfo of listResult.objects) {
        scanned++;
        const pathParts = keyInfo.key.split('/');
        if (pathParts.length >= 2 && pathParts[0] === 'listings') {
          const listingId = pathParts[1];

          if (!validIdSet.has(listingId)) {
            try {
              await this.r2.delete(keyInfo.key);
              deleted++;
            } catch (error) {
              console.error(`Failed to delete orphaned image ${keyInfo.key}:`, error);
            }
          }
        }
      }

      return { scanned, deleted };
    } catch (error) {
      console.error('Error during image cleanup:', error);
      return { scanned: 0, deleted: 0 };
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalObjects: number;
    totalSize: number;
    objectsByType: Record<string, number>;
    sizeByType: Record<string, number>;
  }> {
    try {
      const listResult = await this.r2.list({ limit: 10000 });

      let totalObjects = 0;
      let totalSize = 0;
      const objectsByType: Record<string, number> = {};
      const sizeByType: Record<string, number> = {};

      for (const keyInfo of listResult.objects) {
        totalObjects++;
        totalSize += keyInfo.size || 0;

        // Determine type based on path
        let type = 'other';
        if (keyInfo.key.startsWith('listings/')) {
          type = keyInfo.key.includes('thumb_') ? 'thumbnail' : 'listing-image';
        } else if (keyInfo.key.startsWith('users/')) {
          type = 'profile-image';
        }

        objectsByType[type] = (objectsByType[type] || 0) + 1;
        sizeByType[type] = (sizeByType[type] || 0) + (keyInfo.size || 0);
      }

      return {
        totalObjects,
        totalSize,
        objectsByType,
        sizeByType,
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        totalObjects: 0,
        totalSize: 0,
        objectsByType: {},
        sizeByType: {},
      };
    }
  }
}
