import { Context } from 'hono';
import { CategoryService } from '../services/category-service';
import { KVCacheService } from '../services/kv-cache-service';
import { AuthService } from '../services/auth-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Categories API Endpoints - T066
 *
 * Handles category management and hierarchy endpoints:
 * - GET /api/categories - Get category hierarchy with caching
 * - GET /api/categories/{id} - Get specific category with listings
 * - GET /api/categories/search - Search categories by name
 * - POST /api/categories - Create new category (admin only)
 * - PUT /api/categories/{id} - Update category (admin only)
 */

export interface CategoriesResponse {
  success: boolean;
  categories?: Array<{
    id: number;
    name: string;
    description?: string;
    icon?: string;
    slug: string;
    parentId?: number;
    depth: number;
    listingCount: number;
    isActive: boolean;
    sortOrder: number;
    children?: Array<{
      id: number;
      name: string;
      description?: string;
      icon?: string;
      slug: string;
      listingCount: number;
      isActive: boolean;
      sortOrder: number;
    }>;
  }>;
  totalCount?: number;
  lastModified?: string;
  error?: string;
}

export interface CategoryDetailsResponse {
  success: boolean;
  category?: {
    id: number;
    name: string;
    description?: string;
    icon?: string;
    slug: string;
    parentId?: number;
    depth: number;
    listingCount: number;
    isActive: boolean;
    sortOrder: number;
    parent?: {
      id: number;
      name: string;
      slug: string;
    };
    children?: Array<{
      id: number;
      name: string;
      description?: string;
      slug: string;
      listingCount: number;
    }>;
    recentListings?: Array<{
      id: string;
      title: string;
      priceUsd: number;
      images: string[];
      createdAt: string;
    }>;
    stats?: {
      totalListings: number;
      activeListings: number;
      averagePrice: number;
      popularSubcategories: string[];
    };
  };
  error?: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
  icon?: string;
  parentId?: number;
  slug?: string;
  sortOrder?: number;
}

export class CategoriesAPI {
  private categoryService: CategoryService;
  private cacheService: KVCacheService;
  private authService: AuthService;

  constructor(db: DrizzleD1Database, kv: any, botToken: string) {
    this.categoryService = new CategoryService(db);
    this.cacheService = new KVCacheService(kv);
    this.authService = new AuthService(db, botToken);
  }

  /**
   * GET /api/categories - Get category hierarchy with caching
   */
  async getCategories(c: Context): Promise<Response> {
    try {
      const includeStats = c.req.query('includeStats') === 'true';
      const includeInactive = c.req.query('includeInactive') === 'true';
      const flat = c.req.query('flat') === 'true';

      // Create cache key
      const cacheKey = `categories:${includeStats}:${includeInactive}:${flat}`;

      // Try to get from cache first
      const cachedResult = await this.cacheService.get<CategoriesResponse>(
        cacheKey,
        async () => {
          // Fetch from database
          const hierarchy = await this.categoryService.getHierarchy(includeStats);

          let categories = hierarchy.categories;

          // Filter inactive categories if not requested
          if (!includeInactive) {
            categories = categories.filter(cat => cat.isActive);
            categories.forEach(cat => {
              if (cat.children) {
                cat.children = cat.children.filter(child => child.isActive);
              }
            });
          }

          // Flatten hierarchy if requested
          if (flat) {
            const flatCategories: any[] = [];
            categories.forEach(cat => {
              flatCategories.push({
                ...cat,
                children: undefined, // Remove children for flat structure
              });
              if (cat.children) {
                cat.children.forEach(child => {
                  flatCategories.push({
                    ...child,
                    parentId: cat.id,
                    depth: 1,
                  });
                });
              }
            });
            categories = flatCategories;
          }

          return {
            success: true,
            categories,
            totalCount: categories.length,
            lastModified: new Date().toISOString(),
          };
        },
        { ttl: 300 } // Cache for 5 minutes
      );

      return c.json(cachedResult);
    } catch (error) {
      console.error('Get categories error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error',
        },
        500
      );
    }
  }

  /**
   * GET /api/categories/{id} - Get specific category with detailed info
   */
  async getCategoryDetails(c: Context): Promise<Response> {
    try {
      const categoryId = parseInt(c.req.param('id'));

      if (isNaN(categoryId)) {
        return c.json(
          {
            success: false,
            error: 'Invalid category ID',
          },
          400
        );
      }

      const includeListings = c.req.query('includeListings') === 'true';
      const listingsLimit = Math.min(parseInt(c.req.query('listingsLimit') || '10'), 50);

      // Create cache key
      const cacheKey = `category:${categoryId}:${includeListings}:${listingsLimit}`;

      const cachedResult = await this.cacheService.get<CategoryDetailsResponse>(
        cacheKey,
        async () => {
          const categoryDetails = await this.categoryService.getCategoryWithStats(categoryId);

          if (!categoryDetails) {
            return {
              success: false,
              error: 'Category not found',
            };
          }

          let recentListings;
          if (includeListings) {
            recentListings = await this.categoryService.getRecentListings(
              categoryId,
              listingsLimit
            );
          }

          return {
            success: true,
            category: {
              ...categoryDetails,
              recentListings,
            },
          };
        },
        { ttl: 300 } // Cache for 5 minutes
      );

      if (!cachedResult.success) {
        return c.json(cachedResult, 404);
      }

      return c.json(cachedResult);
    } catch (error) {
      console.error('Get category details error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error',
        },
        500
      );
    }
  }

  /**
   * GET /api/categories/search - Search categories by name
   */
  async searchCategories(c: Context): Promise<Response> {
    try {
      const query = c.req.query('q') || '';
      const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
      const includeStats = c.req.query('includeStats') === 'true';

      if (!query.trim()) {
        return c.json(
          {
            success: false,
            error: 'Search query is required',
          },
          400
        );
      }

      if (query.length < 2) {
        return c.json(
          {
            success: false,
            error: 'Search query must be at least 2 characters',
          },
          400
        );
      }

      const searchResult = await this.categoryService.searchCategories(query, {
        limit,
        includeStats,
        includeInactive: false,
      });

      return c.json({
        success: true,
        categories: searchResult.categories,
        totalCount: searchResult.totalCount,
        suggestions: searchResult.suggestions,
      });
    } catch (error) {
      console.error('Search categories error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error',
        },
        500
      );
    }
  }

  /**
   * POST /api/categories - Create new category (admin only)
   */
  async createCategory(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json(
          {
            success: false,
            error: 'Authentication required',
          },
          401
        );
      }

      // Check admin permissions
      if (!(await this.isAdmin(user.telegramId))) {
        return c.json(
          {
            success: false,
            error: 'Admin privileges required',
          },
          403
        );
      }

      const body = (await c.req.json()) as CreateCategoryRequest;

      // Validate input
      const validationErrors: string[] = [];

      if (!body.name || !body.name.trim()) {
        validationErrors.push('Category name is required');
      } else if (body.name.length > 100) {
        validationErrors.push('Category name must be 100 characters or less');
      }

      if (body.description && body.description.length > 500) {
        validationErrors.push('Description must be 500 characters or less');
      }

      if (body.parentId && body.parentId <= 0) {
        validationErrors.push('Invalid parent category ID');
      }

      if (body.slug && !/^[a-z0-9-]+$/.test(body.slug)) {
        validationErrors.push('Slug must contain only lowercase letters, numbers, and hyphens');
      }

      if (validationErrors.length > 0) {
        return c.json(
          {
            success: false,
            error: 'Validation failed',
            details: validationErrors,
          },
          400
        );
      }

      // Create category
      const createResult = await this.categoryService.createCategory(body);

      if (!createResult.success) {
        return c.json(
          {
            success: false,
            error: createResult.error || 'Failed to create category',
          },
          400
        );
      }

      // Invalidate cache
      await this.invalidateCategoriesCache();

      return c.json(
        {
          success: true,
          category: createResult.category,
        },
        201
      );
    } catch (error) {
      console.error('Create category error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error',
        },
        500
      );
    }
  }

  /**
   * PUT /api/categories/{id} - Update category (admin only)
   */
  async updateCategory(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json(
          {
            success: false,
            error: 'Authentication required',
          },
          401
        );
      }

      // Check admin permissions
      if (!(await this.isAdmin(user.telegramId))) {
        return c.json(
          {
            success: false,
            error: 'Admin privileges required',
          },
          403
        );
      }

      const categoryId = parseInt(c.req.param('id'));

      if (isNaN(categoryId)) {
        return c.json(
          {
            success: false,
            error: 'Invalid category ID',
          },
          400
        );
      }

      const body = (await c.req.json()) as Partial<CreateCategoryRequest>;

      // Validate input
      const validationErrors: string[] = [];

      if (body.name !== undefined) {
        if (!body.name.trim()) {
          validationErrors.push('Category name cannot be empty');
        } else if (body.name.length > 100) {
          validationErrors.push('Category name must be 100 characters or less');
        }
      }

      if (body.description !== undefined && body.description && body.description.length > 500) {
        validationErrors.push('Description must be 500 characters or less');
      }

      if (body.slug !== undefined && body.slug && !/^[a-z0-9-]+$/.test(body.slug)) {
        validationErrors.push('Slug must contain only lowercase letters, numbers, and hyphens');
      }

      if (validationErrors.length > 0) {
        return c.json(
          {
            success: false,
            error: 'Validation failed',
            details: validationErrors,
          },
          400
        );
      }

      // Update category
      const updateResult = await this.categoryService.updateCategory(categoryId, body);

      if (!updateResult.success) {
        return c.json(
          {
            success: false,
            error: updateResult.error || 'Failed to update category',
          },
          400
        );
      }

      // Invalidate cache
      await this.invalidateCategoriesCache();

      return c.json({
        success: true,
        category: updateResult.category,
      });
    } catch (error) {
      console.error('Update category error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error',
        },
        500
      );
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

  private async isAdmin(telegramId: string): Promise<boolean> {
    // This should check admin status from database/service
    // For now, simplified check
    return false; // Would be implemented with actual admin check
  }

  private async invalidateCategoriesCache(): Promise<void> {
    try {
      // Invalidate all categories cache keys
      const cachePatterns = ['categories:*', 'category:*'];

      for (const pattern of cachePatterns) {
        await this.cacheService.invalidatePattern(pattern);
      }
    } catch (error) {
      console.error('Error invalidating categories cache:', error);
    }
  }
}

/**
 * Setup categories routes with Hono
 */
export function setupCategoriesRoutes(app: any, db: DrizzleD1Database, kv: any, botToken: string) {
  const categoriesAPI = new CategoriesAPI(db, kv, botToken);

  app.get('/api/categories', (c: Context) => categoriesAPI.getCategories(c));
  app.get('/api/categories/search', (c: Context) => categoriesAPI.searchCategories(c));
  app.get('/api/categories/:id', (c: Context) => categoriesAPI.getCategoryDetails(c));
  app.post('/api/categories', (c: Context) => categoriesAPI.createCategory(c));
  app.put('/api/categories/:id', (c: Context) => categoriesAPI.updateCategory(c));
}
