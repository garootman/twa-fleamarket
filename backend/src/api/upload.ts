import { Context } from 'hono';
import { ImageService } from '../services/image-service';
import { AuthService } from '../services/auth-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Upload API Endpoints - T075
 *
 * Handles file uploads with R2 storage integration:
 * - POST /api/upload - Upload images with processing and validation
 * - POST /api/upload/multiple - Upload multiple images in batch
 * - DELETE /api/upload/{id} - Delete uploaded image
 * - GET /api/upload/presigned - Get presigned upload URLs for direct R2 upload
 */

export interface UploadResponse {
  success: boolean;
  file?: {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl?: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    uploadedAt: string;
  };
  files?: Array<{
    id: string;
    filename: string;
    url: string;
    thumbnailUrl?: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    uploadedAt: string;
  }>;
  error?: string;
  details?: string[];
}

export interface PresignedUploadResponse {
  success: boolean;
  uploadUrl?: string;
  fields?: Record<string, string>;
  maxSize?: number;
  allowedTypes?: string[];
  expiresIn?: number;
  error?: string;
}

export class UploadAPI {
  private imageService: ImageService;
  private authService: AuthService;

  constructor(db: DrizzleD1Database, r2: any, botToken: string) {
    this.imageService = new ImageService(db, r2);
    this.authService = new AuthService(db, botToken);
  }

  /**
   * POST /api/upload - Upload single image with processing
   */
  async uploadImage(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      // Get form data
      const formData = await c.req.formData();
      const file = formData.get('file') as File;
      const options = {
        generateThumbnail: formData.get('generateThumbnail') === 'true',
        optimizeSize: formData.get('optimizeSize') !== 'false', // Default true
        maxWidth: formData.get('maxWidth') ? parseInt(formData.get('maxWidth') as string) : undefined,
        maxHeight: formData.get('maxHeight') ? parseInt(formData.get('maxHeight') as string) : undefined,
        quality: formData.get('quality') ? parseInt(formData.get('quality') as string) : 85,
      };

      if (!file) {
        return c.json({
          success: false,
          error: 'No file provided'
        }, 400);
      }

      // Validate file
      const validationError = this.validateFile(file);
      if (validationError) {
        return c.json({
          success: false,
          error: validationError
        }, 400);
      }

      // Convert File to ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Upload file
      const uploadResult = await this.imageService.uploadImage(
        arrayBuffer,
        file.name,
        options
      );

      if (!uploadResult.success) {
        return c.json({
          success: false,
          error: uploadResult.error || 'Upload failed'
        }, 500);
      }

      const response: UploadResponse = {
        success: true,
        file: {
          id: uploadResult.id || '',
          filename: uploadResult.filename || file.name,
          url: uploadResult.url || '',
          thumbnailUrl: uploadResult.thumbnailUrl,
          size: file.size,
          mimeType: file.type,
          width: uploadResult.metadata?.width,
          height: uploadResult.metadata?.height,
          uploadedAt: new Date().toISOString(),
        }
      };

      return c.json(response);

    } catch (error) {
      console.error('Upload image error:', error);
      return c.json({
        success: false,
        error: 'Internal server error during upload'
      }, 500);
    }
  }

  /**
   * POST /api/upload/multiple - Upload multiple images in batch
   */
  async uploadMultipleImages(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      // Get form data
      const formData = await c.req.formData();
      const files = formData.getAll('files') as File[];
      const options = {
        generateThumbnail: formData.get('generateThumbnail') === 'true',
        optimizeSize: formData.get('optimizeSize') !== 'false',
        maxWidth: formData.get('maxWidth') ? parseInt(formData.get('maxWidth') as string) : undefined,
        maxHeight: formData.get('maxHeight') ? parseInt(formData.get('maxHeight') as string) : undefined,
        quality: formData.get('quality') ? parseInt(formData.get('quality') as string) : 85,
      };

      if (!files || files.length === 0) {
        return c.json({
          success: false,
          error: 'No files provided'
        }, 400);
      }

      if (files.length > 10) {
        return c.json({
          success: false,
          error: 'Maximum 10 files allowed per upload'
        }, 400);
      }

      // Validate all files first
      const validationErrors: string[] = [];
      files.forEach((file, index) => {
        const error = this.validateFile(file);
        if (error) {
          validationErrors.push(`File ${index + 1}: ${error}`);
        }
      });

      if (validationErrors.length > 0) {
        return c.json({
          success: false,
          error: 'File validation failed',
          details: validationErrors
        }, 400);
      }

      // Convert files to upload format
      const uploadFiles = await Promise.all(
        files.map(async (file) => ({
          file: await file.arrayBuffer(),
          filename: file.name,
        }))
      );

      // Upload multiple files
      const uploadResult = await this.imageService.uploadMultipleImages(
        uploadFiles,
        options
      );

      const successfulUploads = uploadResult.results.filter(result => result.success);
      const failedUploads = uploadResult.results.filter(result => !result.success);

      const response: UploadResponse = {
        success: successfulUploads.length > 0,
        files: successfulUploads.map((result, index) => ({
          id: result.id || '',
          filename: result.filename || files[index].name,
          url: result.url || '',
          thumbnailUrl: result.thumbnailUrl,
          size: files[index].size,
          mimeType: files[index].type,
          width: result.metadata?.width,
          height: result.metadata?.height,
          uploadedAt: new Date().toISOString(),
        })),
      };

      // Add error information if some uploads failed
      if (failedUploads.length > 0) {
        response.details = failedUploads.map((result, index) =>
          `File ${index + 1}: ${result.error || 'Upload failed'}`
        );
      }

      return c.json(response, successfulUploads.length > 0 ? 200 : 500);

    } catch (error) {
      console.error('Upload multiple images error:', error);
      return c.json({
        success: false,
        error: 'Internal server error during upload'
      }, 500);
    }
  }

  /**
   * DELETE /api/upload/{id} - Delete uploaded image
   */
  async deleteImage(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      const fileId = c.req.param('id');

      if (!fileId) {
        return c.json({
          success: false,
          error: 'File ID is required'
        }, 400);
      }

      // Delete image
      const deleteResult = await this.imageService.deleteImage(fileId, parseInt(user.telegramId));

      if (!deleteResult.success) {
        return c.json({
          success: false,
          error: deleteResult.error || 'Failed to delete image'
        }, deleteResult.error?.includes('not found') ? 404 : 400);
      }

      return c.json({
        success: true,
        message: 'Image deleted successfully'
      });

    } catch (error) {
      console.error('Delete image error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * GET /api/upload/presigned - Get presigned upload URLs for direct R2 upload
   */
  async getPresignedUpload(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      const filename = c.req.query('filename');
      const contentType = c.req.query('contentType') || 'image/jpeg';
      const maxSize = Math.min(
        parseInt(c.req.query('maxSize') || '10485760'), // Default 10MB
        52428800 // Max 50MB
      );

      if (!filename) {
        return c.json({
          success: false,
          error: 'Filename is required'
        }, 400);
      }

      // Validate content type
      if (!this.isValidImageType(contentType)) {
        return c.json({
          success: false,
          error: 'Invalid content type. Only images are allowed.'
        }, 400);
      }

      // Generate presigned upload URL
      const presignedResult = await this.imageService.generatePresignedUpload(
        filename,
        contentType,
        maxSize,
        parseInt(user.telegramId)
      );

      if (!presignedResult.success) {
        return c.json({
          success: false,
          error: presignedResult.error || 'Failed to generate presigned URL'
        }, 500);
      }

      const response: PresignedUploadResponse = {
        success: true,
        uploadUrl: presignedResult.url,
        fields: presignedResult.fields,
        maxSize,
        allowedTypes: [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/svg+xml'
        ],
        expiresIn: 3600, // 1 hour
      };

      return c.json(response);

    } catch (error) {
      console.error('Get presigned upload error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * GET /api/upload/user - Get user's uploaded files
   */
  async getUserUploads(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20')));

      // Get user's uploads
      const uploadsResult = await this.imageService.getUserUploads(
        parseInt(user.telegramId),
        page,
        limit
      );

      if (!uploadsResult.success) {
        return c.json({
          success: false,
          error: uploadsResult.error || 'Failed to fetch uploads'
        }, 500);
      }

      return c.json({
        success: true,
        files: uploadsResult.files || [],
        pagination: {
          page,
          limit,
          totalPages: Math.ceil((uploadsResult.totalCount || 0) / limit),
          totalCount: uploadsResult.totalCount || 0,
          hasNext: page * limit < (uploadsResult.totalCount || 0),
          hasPrev: page > 1,
        },
        usage: {
          totalFiles: uploadsResult.totalCount || 0,
          totalSize: uploadsResult.totalSize || 0,
          storageLimit: 1073741824, // 1GB limit
          storageUsed: uploadsResult.totalSize || 0,
        }
      });

    } catch (error) {
      console.error('Get user uploads error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * Private helper methods
   */
  private async getCurrentUser(c: Context): Promise<{ telegramId: string } | null> {
    const authHeader = c.req.header('Authorization');
    const cookieToken = c.req.cookie('auth-token');

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) return null;

    const validation = await this.authService.validateSession(token);
    return validation.success ? validation.user : null;
  }

  private validateFile(file: File): string | null {
    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return 'File size must be less than 10MB';
    }

    // Check file type
    if (!this.isValidImageType(file.type)) {
      return 'Invalid file type. Only images are allowed (JPEG, PNG, GIF, WebP, SVG)';
    }

    // Check filename
    if (!file.name || file.name.length > 255) {
      return 'Invalid filename';
    }

    return null;
  }

  private isValidImageType(mimeType: string): boolean {
    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];
    return validTypes.includes(mimeType.toLowerCase());
  }
}

/**
 * Setup upload routes with Hono
 */
export function setupUploadRoutes(app: any, db: DrizzleD1Database, r2: any, botToken: string) {
  const uploadAPI = new UploadAPI(db, r2, botToken);

  app.post('/api/upload', (c: Context) => uploadAPI.uploadImage(c));
  app.post('/api/upload/multiple', (c: Context) => uploadAPI.uploadMultipleImages(c));
  app.delete('/api/upload/:id', (c: Context) => uploadAPI.deleteImage(c));
  app.get('/api/upload/presigned', (c: Context) => uploadAPI.getPresignedUpload(c));
  app.get('/api/upload/user', (c: Context) => uploadAPI.getUserUploads(c));
}