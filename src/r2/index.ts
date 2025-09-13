import { ImageService } from './images';

// Re-export for easier imports
export { ImageService } from './images';
export type { ImageUploadResult, ImageMetadata, ImageProcessingOptions } from './images';

export class R2ImageStorage {
  private r2: R2Bucket;
  public images: ImageService; // Enhanced image processing service

  constructor(r2Bucket: R2Bucket) {
    this.r2 = r2Bucket;
    this.images = new ImageService(r2Bucket);
  }

  async uploadUserImage(telegramId: number, imageUrl: string): Promise<string | null> {
    if (!imageUrl) {
      return null;
    }

    try {
      // Fetch the image from Telegram
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.error('Failed to fetch image from Telegram:', response.status);
        return null;
      }

      const imageBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // Generate a unique key for the user's image
      const imageKey = `users/${telegramId}/profile.jpg`;

      // Upload to R2
      await this.r2.put(imageKey, imageBuffer, {
        httpMetadata: {
          contentType: contentType,
          cacheControl: 'public, max-age=31536000', // Cache for 1 year
        },
        customMetadata: {
          telegramId: telegramId.toString(),
          uploadedAt: new Date().toISOString(),
        },
      });

      return imageKey;
    } catch (error) {
      console.error('Error uploading image to R2:', error);
      return null;
    }
  }

  async getUserImageUrl(telegramId: number, baseUrl: string): Promise<string | null> {
    const imageKey = `users/${telegramId}/profile.jpg`;

    try {
      // Check if the image exists in R2
      const object = await this.r2.head(imageKey);
      if (object) {
        return `${baseUrl}/image/${imageKey}`;
      }
    } catch (error) {
      console.error('Error checking R2 image:', error);
    }

    return null;
  }

  async getImageStream(imageKey: string): Promise<ReadableStream | null> {
    try {
      const object = await this.r2.get(imageKey);
      if (object) {
        return object.body;
      }
    } catch (error) {
      console.error('Error getting image from R2:', error);
    }

    return null;
  }

  async getImageMetadata(imageKey: string): Promise<R2ObjectBody | null> {
    try {
      const object = await this.r2.get(imageKey);
      return object;
    } catch (error) {
      console.error('Error getting image metadata from R2:', error);
      return null;
    }
  }

  // Health check method
  async healthCheck(): Promise<{
    status: 'ok' | 'error';
    message: string;
    timestamp: string;
    imageUrl?: string;
  }> {
    const testKey = 'health-check/test-image.jpg';

    try {
      // Create a simple 1x1 pixel JPEG for testing
      const testImageData = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00,
        0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
        0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b,
        0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
        0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31,
        0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff,
        0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01,
        0x03, 0x11, 0x01, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14, 0x10,
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f,
        0x00, 0x9f, 0xff, 0xd9,
      ]);

      // Upload test image
      await this.r2.put(testKey, testImageData, {
        httpMetadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=60', // Short cache for health check
        },
        customMetadata: {
          type: 'health-check',
          uploadedAt: new Date().toISOString(),
        },
      });

      // Verify the image was uploaded
      const object = await this.r2.head(testKey);
      if (!object) {
        throw new Error('Failed to verify uploaded test image');
      }

      // Clean up test image (optional - could keep for consistent health checks)
      await this.r2.delete(testKey);

      return {
        status: 'ok',
        message: 'R2 storage upload/retrieve successful',
        timestamp: new Date().toISOString(),
        imageUrl: `health-check image uploaded and verified`,
      };
    } catch (error) {
      // Try to clean up on error
      try {
        await this.r2.delete(testKey);
      } catch {}

      return {
        status: 'error',
        message: `R2 storage error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
