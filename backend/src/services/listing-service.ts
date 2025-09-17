import { ListingModel } from '../db/models/listing';
import { CategoryModel } from '../db/models/category';
import { UserModel } from '../db/models/user';
import { BlockedWordModel } from '../db/models/blocked-word';
import { KVCacheService } from './kv-cache-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  CreateListing,
  UpdateListing,
  ListingWithStats,
  ListingSearchFilters,
  ListingCreateData,
  BumpResult,
} from '../db/models/listing';

/**
 * ListingService - T054
 *
 * Provides business logic for listing CRUD operations, search, and management.
 * Handles content validation, image processing, search optimization, and analytics.
 */

export interface ListingCreationResult {
  success: boolean;
  listing?: any;
  error?: string;
  warnings?: string[];
  isDraft?: boolean;
}

export interface ListingSearchResult {
  listings: ListingWithStats[];
  totalCount: number;
  hasMore: boolean;
  searchTime: number;
  filters: any;
  suggestions: string[];
  facets: {
    categories: Array<{ id: number; name: string; count: number }>;
    priceRanges: Array<{ range: string; count: number }>;
    locations: Array<{ location: string; count: number }>;
  };
}

export interface ListingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  contentFlags: {
    hasBlockedWords: boolean;
    flaggedTerms: string[];
    severity: 'none' | 'warning' | 'block';
  };
}

export interface ListingAnalytics {
  totalViews: number;
  viewsToday: number;
  viewsTrend: 'up' | 'down' | 'stable';
  averageViewTime: number;
  contactClicks: number;
  conversionRate: number;
  similarListings: any[];
  suggestedImprovements: string[];
}

export class ListingService {
  private listingModel: ListingModel;
  private categoryModel: CategoryModel;
  private userModel: UserModel;
  private blockedWordModel: BlockedWordModel;
  private cache: KVCacheService;

  constructor(db: DrizzleD1Database, cache: KVCacheService) {
    this.listingModel = new ListingModel(db);
    this.categoryModel = new CategoryModel(db);
    this.userModel = new UserModel(db);
    this.blockedWordModel = new BlockedWordModel(db);
    this.cache = cache;
  }

  /**
   * Create new listing with comprehensive validation
   */
  async createListing(
    listingData: ListingCreateData,
    userId: number
  ): Promise<ListingCreationResult> {
    try {
      // Validate listing data
      const validation = await this.validateListing(listingData);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          warnings: validation.warnings,
        };
      }

      // Check content for blocked words
      if (validation.contentFlags.severity === 'block') {
        return {
          success: false,
          error: 'Content contains prohibited terms',
          warnings: [`Blocked terms: ${validation.contentFlags.flaggedTerms.join(', ')}`],
        };
      }

      // Verify user can create listings (use cache for user data)
      const userKey = this.cache.generateKey('user', userId);
      const user = await this.cache.get(
        userKey,
        () => this.userModel.findByTelegramId(userId),
        { ttl: 3600 } // Cache user for 1 hour
      );

      const userListingsCount = await this.listingModel.getUserActiveListingsCount(userId);
      const isAdmin = user ? this.userModel.isAdmin(user) : false;

      if (!this.listingModel.canUserCreateListing(userListingsCount, isAdmin)) {
        return {
          success: false,
          error: 'Maximum listing limit reached',
        };
      }

      // Verify category exists and is a leaf category (use cache)
      const categoryKey = this.cache.generateKey('category', listingData.categoryId);
      const category = await this.cache.get(
        categoryKey,
        () => this.categoryModel.findById(listingData.categoryId),
        { ttl: 3600 } // Cache category for 1 hour
      );

      if (!category) {
        return {
          success: false,
          error: 'Invalid category',
        };
      }

      // Create listing
      const listing = await this.listingModel.create(listingData, userId);

      // Invalidate related caches
      await this.invalidateListingCaches(userId, listingData.categoryId);

      return {
        success: true,
        listing,
        warnings: validation.warnings.concat(
          validation.contentFlags.severity === 'warning'
            ? [`Content flagged: ${validation.contentFlags.flaggedTerms.join(', ')}`]
            : []
        ),
        isDraft: listingData.isDraft,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Listing creation failed',
      };
    }
  }

  /**
   * Search listings with advanced filters and facets
   */
  async searchListings(
    searchQuery: string = '',
    filters: ListingSearchFilters = {},
    page = 1,
    limit = 20
  ): Promise<ListingSearchResult> {
    const startTime = Date.now();

    // Enhance filters with search query
    const enhancedFilters = {
      ...filters,
      query: searchQuery.trim() || undefined,
    };

    // Create cache key for search results
    const searchKey = this.cache.generateKey(
      'search',
      JSON.stringify(enhancedFilters),
      page,
      limit
    );

    // Try to get cached search results
    const cachedResult = await this.cache.get<ListingSearchResult>(searchKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Perform search
    const result = await this.listingModel.search(enhancedFilters, page, limit);

    // Generate search suggestions (cache separately)
    const suggestionsKey = this.cache.generateKey('suggestions', searchQuery);
    const suggestions = await this.cache.get(
      suggestionsKey,
      () => this.generateSearchSuggestions(searchQuery),
      { ttl: 1800 } // Cache suggestions for 30 minutes
    );

    // Generate facets for filtering (cache with shorter TTL)
    const facetsKey = this.cache.generateKey('facets', JSON.stringify(enhancedFilters));
    const facets = await this.cache.get(
      facetsKey,
      () => this.generateSearchFacets(enhancedFilters),
      { ttl: 600 } // Cache facets for 10 minutes
    );

    const searchTime = Date.now() - startTime;

    const searchResult = {
      ...result,
      searchTime,
      filters: enhancedFilters,
      suggestions: suggestions || [],
      facets: facets || { categories: [], priceRanges: [], locations: [] },
    };

    // Cache search results for 5 minutes
    await this.cache.set(searchKey, searchResult, { ttl: 300 });

    return searchResult;
  }

  /**
   * Get listing with comprehensive details and analytics
   */
  async getListingDetails(
    listingId: string,
    viewerId?: number
  ): Promise<{
    listing: ListingWithStats | null;
    analytics: ListingAnalytics | null;
    canEdit: boolean;
    canBump: boolean;
    similarListings: any[];
  }> {
    // Cache listing details (excluding view-sensitive data)
    const listingKey = this.cache.generateKey('listing', listingId);
    const listing = await this.cache.get(
      listingKey,
      () => this.listingModel.getWithStats(listingId),
      { ttl: 300 } // Cache for 5 minutes
    );

    if (!listing) {
      return {
        listing: null,
        analytics: null,
        canEdit: false,
        canBump: false,
        similarListings: [],
      };
    }

    // Increment view count (if not owner viewing)
    if (!viewerId || listing.userId !== viewerId) {
      await this.listingModel.incrementViews(listingId);
      // Invalidate listing cache to reflect new view count
      await this.cache.delete(listingKey);
    }

    // Check permissions
    const canEdit = viewerId ? this.listingModel.validateOwnership(listing, viewerId) : false;
    const canBump = canEdit && this.listingModel.canBump(listing);

    // Get analytics (cache with short TTL)
    const analyticsKey = this.cache.generateKey('analytics', listingId);
    const analytics = await this.cache.get(
      analyticsKey,
      () => this.getListingAnalytics(listingId),
      { ttl: 600 } // Cache analytics for 10 minutes
    );

    // Get similar listings (cache with longer TTL)
    const similarKey = this.cache.generateKey('similar', listingId);
    const similarListings = await this.cache.get(
      similarKey,
      () => this.listingModel.getSimilar(listingId, 5),
      { ttl: 1800 } // Cache similar listings for 30 minutes
    );

    return {
      listing,
      analytics: analytics || null,
      canEdit,
      canBump,
      similarListings: similarListings || [],
    };
  }

  /**
   * Mark listing as sold
   */
  async markAsSold(
    listingId: string,
    userId: number
  ): Promise<{ success: boolean; listing?: any; error?: string }> {
    try {
      const listing = await this.listingModel.markSold(listingId, userId);
      return {
        success: true,
        listing,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark as sold',
      };
    }
  }

  /**
   * Archive listing
   */
  async archiveListing(
    listingId: string,
    userId: number
  ): Promise<{ success: boolean; listing?: any; error?: string }> {
    try {
      const listing = await this.listingModel.archive(listingId, userId);
      return {
        success: true,
        listing,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to archive listing',
      };
    }
  }

  /**
   * Delete listing permanently
   */
  async deleteListing(
    listingId: string,
    userId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const success = await this.listingModel.delete(listingId, userId);
      return { success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete listing',
      };
    }
  }

  /**
   * Get user's listings with statistics
   */
  async getUserListings(
    userId: number,
    status?: string,
    page = 1,
    limit = 20
  ): Promise<{
    listings: ListingWithStats[];
    totalCount: number;
    hasMore: boolean;
    stats: {
      totalListings: number;
      activeListings: number;
      draftListings: number;
      soldListings: number;
      totalViews: number;
    };
  }> {
    const filters: ListingSearchFilters = { userId };
    if (status && status !== 'all') {
      filters.status = status as any;
    }

    const result = await this.listingModel.search(filters, page, limit);

    // Get user listing statistics
    const userListings = await this.listingModel.getUserListings(userId);
    const stats = {
      totalListings: userListings.length,
      activeListings: userListings.filter(l => l.status === 'active').length,
      draftListings: userListings.filter(l => l.status === 'draft').length,
      soldListings: userListings.filter(l => l.status === 'sold').length,
      totalViews: userListings.reduce((sum, l) => sum + l.viewCount, 0),
    };

    return {
      ...result,
      stats,
    };
  }

  /**
   * Get featured/promoted listings
   */
  async getFeaturedListings(limit = 10): Promise<ListingWithStats[]> {
    const featured = await this.listingModel.getFeatured(limit);
    return await Promise.all(
      featured.map(async listing => {
        const stats = await this.listingModel.getWithStats(listing.id);
        return stats!;
      })
    );
  }

  /**
   * Get trending listings
   */
  async getTrendingListings(limit = 10): Promise<ListingWithStats[]> {
    const trending = await this.listingModel.getRecentlyBumped(limit);
    return await Promise.all(
      trending.map(async listing => {
        const stats = await this.listingModel.getWithStats(listing.id);
        return stats!;
      })
    );
  }

  /**
   * Validate listing content
   */
  private async validateListing(
    listingData: any,
    isCreation = true
  ): Promise<ListingValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Business rule validation
    const businessErrors = this.listingModel.validateBusinessRules(listingData);
    errors.push(...businessErrors);

    // Content validation
    let contentFlags = {
      hasBlockedWords: false,
      flaggedTerms: [] as string[],
      severity: 'none' as 'none' | 'warning' | 'block',
    };

    if (listingData.title || listingData.description) {
      const textToCheck = [listingData.title, listingData.description].filter(Boolean).join(' ');
      const filterResult = await this.blockedWordModel.filterContent(textToCheck);

      contentFlags = {
        hasBlockedWords: filterResult.hasViolations,
        flaggedTerms: filterResult.violations,
        severity: filterResult.severity || 'none',
      };
    }

    // Category validation
    if (listingData.categoryId) {
      const category = await this.categoryModel.findById(listingData.categoryId);
      if (!category) {
        errors.push('Invalid category');
      } else if (!category.isActive) {
        errors.push('Category is not active');
      } else {
        // Check if it's a leaf category (can have listings)
        const children = await this.categoryModel.getChildCategories(category.id);
        if (children.length > 0) {
          errors.push(
            'Cannot create listing in parent category. Please select a specific subcategory.'
          );
        }
      }
    }

    // Image validation
    if (listingData.images && Array.isArray(listingData.images)) {
      if (listingData.images.length === 0) {
        errors.push('At least one image is required');
      }
      if (listingData.images.length > 9) {
        errors.push('Maximum 9 images allowed');
      }

      // Validate image URLs
      const invalidUrls = listingData.images.filter(url => {
        try {
          new URL(url);
          return false;
        } catch {
          return true;
        }
      });

      if (invalidUrls.length > 0) {
        errors.push('Invalid image URLs detected');
      }
    }

    // Price validation
    if (listingData.priceUsd !== undefined) {
      if (listingData.priceUsd <= 0) {
        errors.push('Price must be greater than 0');
      }
      if (listingData.priceUsd > 999999) {
        errors.push('Price cannot exceed $999,999');
      }
      if (listingData.priceUsd < 0.01) {
        errors.push('Minimum price is $0.01');
      }
    }

    // Warnings
    if (listingData.title && listingData.title.length < 10) {
      warnings.push('Title is quite short. Consider adding more details.');
    }
    if (listingData.description && listingData.description.length < 50) {
      warnings.push('Description is short. More details help buyers.');
    }

    return {
      valid: errors.length === 0 && contentFlags.severity !== 'block',
      errors,
      warnings,
      contentFlags,
    };
  }

  /**
   * Generate search suggestions based on query
   */
  private async generateSearchSuggestions(query: string): Promise<string[]> {
    if (!query || query.length < 2) return [];

    // This would typically use a search index or ML model
    // For now, return simple suggestions
    const suggestions = [
      `${query} for sale`,
      `${query} cheap`,
      `${query} used`,
      `${query} new`,
      `${query} deal`,
    ].slice(0, 3);

    return suggestions;
  }

  /**
   * Generate search facets for filtering
   */
  private async generateSearchFacets(filters: ListingSearchFilters): Promise<{
    categories: Array<{ id: number; name: string; count: number }>;
    priceRanges: Array<{ range: string; count: number }>;
    locations: Array<{ location: string; count: number }>;
  }> {
    // Get all listings matching current filters (without category filter)
    const facetFilters = { ...filters };
    delete facetFilters.categoryId;

    const facetResult = await this.listingModel.search(facetFilters, 1, 1000);

    // Generate category facets
    const categoryGroups = new Map<number, { name: string; count: number }>();
    for (const listing of facetResult.listings) {
      const category = await this.categoryModel.findById(listing.categoryId);
      if (category) {
        const existing = categoryGroups.get(category.id) || { name: category.name, count: 0 };
        existing.count++;
        categoryGroups.set(category.id, existing);
      }
    }

    const categories = Array.from(categoryGroups.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      count: data.count,
    }));

    // Generate price range facets
    const priceRanges = [
      { range: 'Under $50', count: 0 },
      { range: '$50 - $100', count: 0 },
      { range: '$100 - $500', count: 0 },
      { range: '$500 - $1000', count: 0 },
      { range: 'Over $1000', count: 0 },
    ];

    facetResult.listings.forEach(listing => {
      if (listing.priceUsd < 50) priceRanges[0].count++;
      else if (listing.priceUsd < 100) priceRanges[1].count++;
      else if (listing.priceUsd < 500) priceRanges[2].count++;
      else if (listing.priceUsd < 1000) priceRanges[3].count++;
      else priceRanges[4].count++;
    });

    // Placeholder for locations (would be extracted from listing data)
    const locations = [{ location: 'Local', count: facetResult.listings.length }];

    return {
      categories: categories.slice(0, 10),
      priceRanges: priceRanges.filter(r => r.count > 0),
      locations,
    };
  }

  /**
   * Get listing analytics
   */
  private async getListingAnalytics(listingId: string): Promise<ListingAnalytics> {
    const listing = await this.listingModel.findById(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Mock analytics data - in real implementation would come from analytics service
    return {
      totalViews: listing.viewCount,
      viewsToday: Math.floor(listing.viewCount * 0.1), // 10% today
      viewsTrend: 'stable',
      averageViewTime: 45, // seconds
      contactClicks: Math.floor(listing.viewCount * 0.05), // 5% contact rate
      conversionRate: 5.2, // percentage
      similarListings: [],
      suggestedImprovements: this.generateListingImprovements(listing),
    };
  }

  /**
   * Generate listing improvement suggestions
   */
  private generateListingImprovements(listing: any): string[] {
    const suggestions: string[] = [];

    if (listing.images.length < 3) {
      suggestions.push('Add more photos to showcase your item better');
    }
    if (listing.description.length < 100) {
      suggestions.push('Add more details to your description');
    }
    if (listing.viewCount < 10 && listing.daysSinceCreated > 7) {
      suggestions.push('Consider updating your title with more keywords');
    }
    if (!listing.bumpedAt && listing.daysSinceCreated > 3) {
      suggestions.push('Bump your listing to increase visibility');
    }

    return suggestions;
  }

  /**
   * Get listing statistics
   */
  async getListingStats(): Promise<any> {
    return await this.listingModel.getStats();
  }

  /**
   * Mark expired listings
   */
  async processExpiredListings(): Promise<number> {
    return await this.listingModel.markExpired();
  }

  /**
   * Check if listing exists
   */
  async exists(listingId: string): Promise<boolean> {
    return await this.listingModel.exists(listingId);
  }

  /**
   * Invalidate caches related to listings
   */
  private async invalidateListingCaches(userId?: number, categoryId?: number): Promise<void> {
    const patterns = [
      'search:*', // Invalidate all search results
      'featured:*', // Invalidate featured listings
      'trending:*', // Invalidate trending listings
      'facets:*', // Invalidate search facets
    ];

    if (userId) {
      patterns.push(`user:${userId}:*`); // Invalidate user-specific caches
    }

    if (categoryId) {
      patterns.push(`category:${categoryId}:*`); // Invalidate category-specific caches
    }

    // Invalidate patterns
    for (const pattern of patterns) {
      try {
        await this.cache.invalidatePattern(pattern);
      } catch (error) {
        console.warn(`Failed to invalidate cache pattern ${pattern}:`, error);
      }
    }
  }

  /**
   * Get featured listings with caching
   */
  async getFeaturedListings(limit = 10): Promise<ListingWithStats[]> {
    const featuredKey = this.cache.generateKey('featured', 'listings', limit);

    return await this.cache.cached(
      featuredKey,
      async () => {
        const featured = await this.listingModel.getFeatured(limit);
        return await Promise.all(
          featured.map(async listing => {
            const stats = await this.listingModel.getWithStats(listing.id);
            return stats!;
          })
        );
      },
      { ttl: 900 } // Cache for 15 minutes
    );
  }

  /**
   * Get trending listings with caching
   */
  async getTrendingListings(limit = 10): Promise<ListingWithStats[]> {
    const trendingKey = this.cache.generateKey('trending', 'listings', limit);

    return await this.cache.cached(
      trendingKey,
      async () => {
        const trending = await this.listingModel.getRecentlyBumped(limit);
        return await Promise.all(
          trending.map(async listing => {
            const stats = await this.listingModel.getWithStats(listing.id);
            return stats!;
          })
        );
      },
      { ttl: 600 } // Cache for 10 minutes
    );
  }

  /**
   * Update existing listing with cache invalidation
   */
  async updateListing(
    listingId: string,
    updateData: UpdateListing,
    userId: number
  ): Promise<ListingCreationResult> {
    try {
      // Validate ownership
      const existingListing = await this.listingModel.findById(listingId);
      if (!existingListing) {
        return {
          success: false,
          error: 'Listing not found',
        };
      }

      if (!this.listingModel.validateOwnership(existingListing, userId)) {
        return {
          success: false,
          error: 'Not authorized to update this listing',
        };
      }

      // Validate update data
      const validation = await this.validateListing(updateData, false);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`,
          warnings: validation.warnings,
        };
      }

      // Check content for blocked words
      if (validation.contentFlags.severity === 'block') {
        return {
          success: false,
          error: 'Content contains prohibited terms',
          warnings: [`Blocked terms: ${validation.contentFlags.flaggedTerms.join(', ')}`],
        };
      }

      const listing = await this.listingModel.update(listingId, updateData, userId);

      // Invalidate all caches related to this listing
      await this.cache.delete(this.cache.generateKey('listing', listingId));
      await this.cache.delete(this.cache.generateKey('analytics', listingId));
      await this.cache.delete(this.cache.generateKey('similar', listingId));
      await this.invalidateListingCaches(userId, existingListing.categoryId);

      return {
        success: true,
        listing,
        warnings: validation.warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Listing update failed',
      };
    }
  }

  /**
   * Bump listing with cache invalidation
   */
  async bumpListing(listingId: string, userId: number): Promise<BumpResult> {
    const result = await this.listingModel.bump(listingId, userId);

    if (result.success) {
      // Invalidate caches when listing is bumped
      await this.cache.delete(this.cache.generateKey('listing', listingId));
      await this.invalidateListingCaches(userId);
    }

    return result;
  }
}
