import { Context } from 'hono';
import { ListingService } from '../services/listing-service';
import { ModerationService } from '../services/moderation-service';
import { AuthService } from '../services/auth-service';
import { KVCacheService } from '../services/kv-cache-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Listings API Endpoints - T067-T073, T076-T077
 *
 * Comprehensive listings management API:
 * - GET /api/listings - Search and filter listings
 * - POST /api/listings - Create new listing
 * - GET /api/listings/{id} - Get specific listing with view tracking
 * - PUT /api/listings/{id} - Update listing with ownership check
 * - DELETE /api/listings/{id} - Archive listing
 * - POST /api/listings/{id}/bump - Bump listing for visibility
 * - POST /api/listings/{id}/flag - Flag inappropriate listing
 * - POST /api/listings/{id}/preview - Preview listing before publishing
 * - POST /api/listings/{id}/publish - Publish draft listing
 */

export interface ListingSearchResponse {
  success: boolean;
  listings?: Array<{
    id: string;
    title: string;
    description: string;
    priceUsd: number;
    categoryId: number;
    categoryName: string;
    images: string[];
    status: string;
    viewCount: number;
    messageCount: number;
    isFeatured: boolean;
    isPremium: boolean;
    createdAt: string;
    updatedAt: string;
    bumpedAt?: string;
    user: {
      id: string;
      firstName: string;
      username?: string;
      isVerified: boolean;
      rating: number;
    };
  }>;
  pagination?: {
    page: number;
    limit: number;
    totalPages: number;
    totalCount: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters?: {
    appliedFilters: Record<string, any>;
    availableFilters: {
      categories: Array<{ id: number; name: string; count: number }>;
      priceRanges: Array<{ min: number; max: number; count: number }>;
      locations: Array<{ name: string; count: number }>;
    };
  };
  error?: string;
}

export interface CreateListingRequest {
  title: string;
  description: string;
  priceUsd: number;
  categoryId: number;
  images: string[];
  tags?: string[];
  contactMethod?: string;
  isDraft?: boolean;
}

export interface ListingDetailsResponse {
  success: boolean;
  listing?: {
    id: string;
    title: string;
    description: string;
    priceUsd: number;
    categoryId: number;
    category: {
      id: number;
      name: string;
      slug: string;
      parent?: { id: number; name: string };
    };
    images: string[];
    tags: string[];
    status: string;
    viewCount: number;
    messageCount: number;
    flagCount: number;
    isFeatured: boolean;
    isPremium: boolean;
    createdAt: string;
    updatedAt: string;
    bumpedAt?: string;
    featuredUntil?: string;
    user: {
      id: string;
      firstName: string;
      lastName?: string;
      username?: string;
      profilePhotoUrl?: string;
      isVerified: boolean;
      rating: number;
      totalListings: number;
      memberSince: string;
    };
    relatedListings?: Array<{
      id: string;
      title: string;
      priceUsd: number;
      images: string[];
    }>;
    canEdit?: boolean;
    canDelete?: boolean;
    canFlag?: boolean;
  };
  error?: string;
}

export interface FlagListingRequest {
  reason: 'SPAM' | 'INAPPROPRIATE' | 'SCAM' | 'DUPLICATE' | 'WRONG_CATEGORY' | 'OTHER';
  description?: string;
}

export class ListingsAPI {
  private listingService: ListingService;
  private moderationService: ModerationService;
  private authService: AuthService;
  private cacheService: KVCacheService;

  constructor(db: DrizzleD1Database, kv: any, botToken: string) {
    this.listingService = new ListingService(db);
    this.moderationService = new ModerationService(db);
    this.authService = new AuthService(db, botToken);
    this.cacheService = new KVCacheService(kv);
  }

  /**
   * GET /api/listings - Search and filter listings with caching
   */
  async searchListings(c: Context): Promise<Response> {
    try {
      const query = c.req.query('q') || '';
      const categoryId = c.req.query('category') ? parseInt(c.req.query('category')!) : undefined;
      const minPrice = c.req.query('minPrice') ? parseFloat(c.req.query('minPrice')!) : undefined;
      const maxPrice = c.req.query('maxPrice') ? parseFloat(c.req.query('maxPrice')!) : undefined;
      const sort = c.req.query('sort') || 'newest';
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '20')));
      const featuredOnly = c.req.query('featured') === 'true';

      const filters = {
        categoryId,
        minPrice,
        maxPrice,
        sort,
        featuredOnly,
        status: 'active', // Only show active listings
      };

      // Create cache key for search results
      const cacheKey = `search:${JSON.stringify({ query, filters, page, limit })}`;

      const result = await this.cacheService.get<ListingSearchResponse>(
        cacheKey,
        async () => {
          const searchResult = await this.listingService.searchListings(
            query,
            filters,
            page,
            limit
          );

          if (!searchResult.success) {
            return {
              success: false,
              error: searchResult.error || 'Search failed',
            };
          }

          return {
            success: true,
            listings: searchResult.listings?.map(listing => ({
              id: listing.id,
              title: listing.title,
              description:
                listing.description.substring(0, 200) +
                (listing.description.length > 200 ? '...' : ''),
              priceUsd: listing.priceUsd,
              categoryId: listing.categoryId,
              categoryName: listing.category?.name || 'Unknown',
              images: listing.images || [],
              status: listing.status,
              viewCount: listing.viewCount,
              messageCount: listing.messageCount || 0,
              isFeatured: !!listing.featuredUntil && new Date(listing.featuredUntil) > new Date(),
              isPremium: !!listing.bumpedAt || !!listing.featuredUntil,
              createdAt: listing.createdAt,
              updatedAt: listing.updatedAt,
              bumpedAt: listing.bumpedAt,
              user: {
                id: listing.user?.id || '',
                firstName: listing.user?.firstName || 'User',
                username: listing.user?.username,
                isVerified: !!listing.user?.usernameVerifiedAt,
                rating: listing.user?.averageRating || 0,
              },
            })),
            pagination: {
              page,
              limit,
              totalPages: Math.ceil((searchResult.totalCount || 0) / limit),
              totalCount: searchResult.totalCount || 0,
              hasNext: page * limit < (searchResult.totalCount || 0),
              hasPrev: page > 1,
            },
          };
        },
        { ttl: 60 } // Cache for 1 minute
      );

      return c.json(result);
    } catch (error) {
      console.error('Search listings error:', error);
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
   * POST /api/listings - Create new listing
   */
  async createListing(c: Context): Promise<Response> {
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

      const body = (await c.req.json()) as CreateListingRequest;

      // Validate input
      const validationErrors = this.validateListingData(body);
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

      // Create listing
      const createResult = await this.listingService.createListing(
        {
          title: body.title.trim(),
          description: body.description.trim(),
          priceUsd: body.priceUsd,
          categoryId: body.categoryId,
          images: body.images || [],
          tags: body.tags || [],
          contactMethod: body.contactMethod,
          status: body.isDraft ? 'draft' : 'active',
        },
        parseInt(user.telegramId)
      );

      if (!createResult.success) {
        return c.json(
          {
            success: false,
            error: createResult.error || 'Failed to create listing',
          },
          400
        );
      }

      // Invalidate search cache
      await this.invalidateSearchCache();

      return c.json(
        {
          success: true,
          listing: createResult.listing,
          message: body.isDraft ? 'Draft saved successfully' : 'Listing created and published',
        },
        201
      );
    } catch (error) {
      console.error('Create listing error:', error);
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
   * GET /api/listings/{id} - Get specific listing with view tracking
   */
  async getListingDetails(c: Context): Promise<Response> {
    try {
      const listingId = c.req.param('id');
      const user = await this.getCurrentUser(c);

      if (!listingId) {
        return c.json(
          {
            success: false,
            error: 'Listing ID is required',
          },
          400
        );
      }

      // Get listing details
      const listing = await this.listingService.getListingById(listingId);

      if (!listing) {
        return c.json(
          {
            success: false,
            error: 'Listing not found',
          },
          404
        );
      }

      // Track view (only if not the owner)
      const isOwner = user && listing.userId === parseInt(user.telegramId);
      if (!isOwner) {
        await this.listingService.incrementViews(listingId);
      }

      // Get related listings
      const relatedListings = await this.listingService.getRelatedListings(
        listingId,
        listing.categoryId,
        5
      );

      const response: ListingDetailsResponse = {
        success: true,
        listing: {
          id: listing.id,
          title: listing.title,
          description: listing.description,
          priceUsd: listing.priceUsd,
          categoryId: listing.categoryId,
          category: {
            id: listing.category?.id || listing.categoryId,
            name: listing.category?.name || 'Unknown',
            slug: listing.category?.slug || '',
            parent: listing.category?.parent
              ? {
                  id: listing.category.parent.id,
                  name: listing.category.parent.name,
                }
              : undefined,
          },
          images: listing.images || [],
          tags: listing.tags || [],
          status: listing.status,
          viewCount: listing.viewCount + (isOwner ? 0 : 1), // Include the current view
          messageCount: listing.messageCount || 0,
          flagCount: listing.flags?.length || 0,
          isFeatured: !!listing.featuredUntil && new Date(listing.featuredUntil) > new Date(),
          isPremium: !!listing.bumpedAt || !!listing.featuredUntil,
          createdAt: listing.createdAt,
          updatedAt: listing.updatedAt,
          bumpedAt: listing.bumpedAt,
          featuredUntil: listing.featuredUntil,
          user: {
            id: listing.user?.id || '',
            firstName: listing.user?.firstName || 'User',
            lastName: listing.user?.lastName,
            username: listing.user?.username,
            profilePhotoUrl: listing.user?.profilePhotoUrl,
            isVerified: !!listing.user?.usernameVerifiedAt,
            rating: listing.user?.averageRating || 0,
            totalListings: listing.user?.totalListings || 0,
            memberSince: listing.user?.createdAt || '',
          },
          relatedListings,
          canEdit: isOwner,
          canDelete: isOwner,
          canFlag: !isOwner && !!user,
        },
      };

      return c.json(response);
    } catch (error) {
      console.error('Get listing details error:', error);
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
   * PUT /api/listings/{id} - Update listing with ownership check
   */
  async updateListing(c: Context): Promise<Response> {
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

      const listingId = c.req.param('id');
      const body = (await c.req.json()) as Partial<CreateListingRequest>;

      if (!listingId) {
        return c.json(
          {
            success: false,
            error: 'Listing ID is required',
          },
          400
        );
      }

      // Validate input
      const validationErrors = this.validateListingData(body, false);
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

      // Update listing
      const updateResult = await this.listingService.updateListing(
        listingId,
        body,
        parseInt(user.telegramId)
      );

      if (!updateResult.success) {
        return c.json(
          {
            success: false,
            error: updateResult.error || 'Failed to update listing',
          },
          updateResult.error?.includes('not found') ? 404 : 400
        );
      }

      // Invalidate caches
      await this.invalidateListingCache(listingId);

      return c.json({
        success: true,
        listing: updateResult.listing,
        message: 'Listing updated successfully',
      });
    } catch (error) {
      console.error('Update listing error:', error);
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
   * DELETE /api/listings/{id} - Archive listing
   */
  async deleteListing(c: Context): Promise<Response> {
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

      const listingId = c.req.param('id');

      if (!listingId) {
        return c.json(
          {
            success: false,
            error: 'Listing ID is required',
          },
          400
        );
      }

      // Archive listing
      const deleteResult = await this.listingService.archiveListing(
        listingId,
        parseInt(user.telegramId)
      );

      if (!deleteResult.success) {
        return c.json(
          {
            success: false,
            error: deleteResult.error || 'Failed to delete listing',
          },
          deleteResult.error?.includes('not found') ? 404 : 400
        );
      }

      // Invalidate caches
      await this.invalidateListingCache(listingId);

      return c.json({
        success: true,
        message: 'Listing archived successfully',
      });
    } catch (error) {
      console.error('Delete listing error:', error);
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
   * POST /api/listings/{id}/bump - Bump listing for visibility
   */
  async bumpListing(c: Context): Promise<Response> {
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

      const listingId = c.req.param('id');

      if (!listingId) {
        return c.json(
          {
            success: false,
            error: 'Listing ID is required',
          },
          400
        );
      }

      // Bump listing
      const bumpResult = await this.listingService.bumpListing(
        listingId,
        parseInt(user.telegramId)
      );

      if (!bumpResult.success) {
        return c.json(
          {
            success: false,
            error: bumpResult.error || 'Failed to bump listing',
          },
          400
        );
      }

      // Invalidate caches
      await this.invalidateListingCache(listingId);

      return c.json({
        success: true,
        listing: bumpResult.listing,
        message: 'Listing bumped successfully',
      });
    } catch (error) {
      console.error('Bump listing error:', error);
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
   * POST /api/listings/{id}/flag - Flag inappropriate listing
   */
  async flagListing(c: Context): Promise<Response> {
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

      const listingId = c.req.param('id');
      const body = (await c.req.json()) as FlagListingRequest;

      if (!listingId) {
        return c.json(
          {
            success: false,
            error: 'Listing ID is required',
          },
          400
        );
      }

      if (!body.reason) {
        return c.json(
          {
            success: false,
            error: 'Flag reason is required',
          },
          400
        );
      }

      // Submit flag
      const flagResult = await this.moderationService.submitFlag(
        parseInt(user.telegramId),
        listingId,
        body.reason,
        body.description
      );

      if (!flagResult.success) {
        return c.json(
          {
            success: false,
            error: flagResult.error || 'Failed to submit flag',
          },
          400
        );
      }

      return c.json({
        success: true,
        message: 'Report submitted successfully. Our team will review it.',
        ticketId: flagResult.flag?.id,
      });
    } catch (error) {
      console.error('Flag listing error:', error);
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
   * POST /api/listings/{id}/preview - Preview listing before publishing
   */
  async previewListing(c: Context): Promise<Response> {
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

      const listingId = c.req.param('id');

      if (!listingId) {
        return c.json(
          {
            success: false,
            error: 'Listing ID is required',
          },
          400
        );
      }

      // Get listing for preview
      const listing = await this.listingService.getListingById(listingId);

      if (!listing) {
        return c.json(
          {
            success: false,
            error: 'Listing not found',
          },
          404
        );
      }

      // Check ownership
      if (listing.userId !== parseInt(user.telegramId)) {
        return c.json(
          {
            success: false,
            error: 'Access denied',
          },
          403
        );
      }

      // Generate preview URL (in real implementation, this would create a temporary preview)
      const previewUrl = `${c.req.url}/preview/${listingId}`;

      return c.json({
        success: true,
        previewUrl,
        listing: {
          id: listing.id,
          title: listing.title,
          description: listing.description,
          priceUsd: listing.priceUsd,
          images: listing.images,
          status: listing.status,
        },
        message: 'Preview generated successfully',
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      });
    } catch (error) {
      console.error('Preview listing error:', error);
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
   * POST /api/listings/{id}/publish - Publish draft listing
   */
  async publishListing(c: Context): Promise<Response> {
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

      const listingId = c.req.param('id');

      if (!listingId) {
        return c.json(
          {
            success: false,
            error: 'Listing ID is required',
          },
          400
        );
      }

      // Publish listing
      const publishResult = await this.listingService.publishListing(
        listingId,
        parseInt(user.telegramId)
      );

      if (!publishResult.success) {
        return c.json(
          {
            success: false,
            error: publishResult.error || 'Failed to publish listing',
          },
          400
        );
      }

      // Invalidate caches
      await this.invalidateListingCache(listingId);
      await this.invalidateSearchCache();

      return c.json({
        success: true,
        listing: publishResult.listing,
        message: 'Listing published successfully',
      });
    } catch (error) {
      console.error('Publish listing error:', error);
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

  private validateListingData(data: any, isCreate = true): string[] {
    const errors: string[] = [];

    if (isCreate || data.title !== undefined) {
      if (!data.title || !data.title.trim()) {
        errors.push('Title is required');
      } else if (data.title.length > 100) {
        errors.push('Title must be 100 characters or less');
      }
    }

    if (isCreate || data.description !== undefined) {
      if (!data.description || !data.description.trim()) {
        errors.push('Description is required');
      } else if (data.description.length > 2000) {
        errors.push('Description must be 2000 characters or less');
      }
    }

    if (isCreate || data.priceUsd !== undefined) {
      if (typeof data.priceUsd !== 'number' || data.priceUsd < 0) {
        errors.push('Price must be a positive number');
      } else if (data.priceUsd > 1000000) {
        errors.push('Price cannot exceed $1,000,000');
      }
    }

    if (isCreate || data.categoryId !== undefined) {
      if (!Number.isInteger(data.categoryId) || data.categoryId <= 0) {
        errors.push('Valid category is required');
      }
    }

    if (data.images !== undefined) {
      if (!Array.isArray(data.images)) {
        errors.push('Images must be an array');
      } else if (data.images.length > 10) {
        errors.push('Maximum 10 images allowed');
      }
    }

    if (data.tags !== undefined) {
      if (!Array.isArray(data.tags)) {
        errors.push('Tags must be an array');
      } else if (data.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      }
    }

    return errors;
  }

  private async invalidateListingCache(listingId: string): Promise<void> {
    try {
      await this.cacheService.invalidatePattern(`listing:${listingId}*`);
      await this.invalidateSearchCache();
    } catch (error) {
      console.error('Error invalidating listing cache:', error);
    }
  }

  private async invalidateSearchCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern('search:*');
    } catch (error) {
      console.error('Error invalidating search cache:', error);
    }
  }
}

/**
 * Setup listings routes with Hono
 */
export function setupListingsRoutes(app: any, db: DrizzleD1Database, kv: any, botToken: string) {
  const listingsAPI = new ListingsAPI(db, kv, botToken);

  app.get('/api/listings', (c: Context) => listingsAPI.searchListings(c));
  app.post('/api/listings', (c: Context) => listingsAPI.createListing(c));
  app.get('/api/listings/:id', (c: Context) => listingsAPI.getListingDetails(c));
  app.put('/api/listings/:id', (c: Context) => listingsAPI.updateListing(c));
  app.delete('/api/listings/:id', (c: Context) => listingsAPI.deleteListing(c));
  app.post('/api/listings/:id/bump', (c: Context) => listingsAPI.bumpListing(c));
  app.post('/api/listings/:id/flag', (c: Context) => listingsAPI.flagListing(c));
  app.post('/api/listings/:id/preview', (c: Context) => listingsAPI.previewListing(c));
  app.post('/api/listings/:id/publish', (c: Context) => listingsAPI.publishListing(c));
}
