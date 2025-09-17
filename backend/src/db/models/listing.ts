import { eq, and, desc, asc, gte, lte, count, sql, like, or, isNull, inArray } from 'drizzle-orm';
import {
  listings,
  type Listing,
  type NewListing,
  type CreateListing,
  type UpdateListing,
  type ListingSearch,
  type ListingWithRelations,
  ListingStatus,
  generateListingId,
  isListingExpired,
  canBumpListing,
  getTimeLeft,
  validateListingOwnership,
  canUserCreateListing,
  isValidStatusTransition,
  LISTING_CONSTRAINTS
} from '../../src/db/schema/listings';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Listing Model - T042
 *
 * Provides business logic layer for marketplace listing management with premium features.
 * Handles CRUD operations, search, bumping, expiration, and premium feature integration.
 */

export interface ListingWithStats extends ListingWithRelations {
  flagCount: number;
  reportCount: number;
  premiumFeaturesActive: string[];
  daysSinceCreated: number;
  hoursSinceLastBump?: number;
  viewsToday: number;
  avgDailyViews: number;
  contactClickCount: number;
}

export interface ListingSearchFilters {
  query?: string;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  userId?: number;
  status?: ListingStatus | 'all';
  isPremium?: boolean;
  isSticky?: boolean;
  isHighlighted?: boolean;
  hasAutoBump?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  expiringWithinDays?: number;
  location?: string;
}

export interface ListingListResponse {
  listings: ListingWithStats[];
  totalCount: number;
  hasMore: boolean;
  searchMeta?: {
    totalResults: number;
    searchTime: number;
    suggestedFilters?: string[];
    relatedCategories?: number[];
  };
}

export interface ListingCreateData extends CreateListing {
  contactUsername: string;
  isDraft?: boolean;
}

export interface BumpResult {
  success: boolean;
  listing: Listing | null;
  nextBumpAvailable?: string;
  error?: string;
}

export class ListingModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new listing
   */
  async create(listingData: ListingCreateData, userId: number): Promise<Listing> {
    // Check if user can create more listings
    const userListingsCount = await this.getUserActiveListingsCount(userId);
    const isAdmin = false; // Would be checked from user data

    if (!canUserCreateListing(userListingsCount, isAdmin)) {
      throw new Error(`Maximum ${LISTING_CONSTRAINTS.MAX_LISTINGS_PER_USER} listings per user exceeded`);
    }

    // Validate price range
    if (listingData.priceUsd < LISTING_CONSTRAINTS.MIN_PRICE ||
        listingData.priceUsd > LISTING_CONSTRAINTS.MAX_PRICE) {
      throw new Error(`Price must be between $${LISTING_CONSTRAINTS.MIN_PRICE} and $${LISTING_CONSTRAINTS.MAX_PRICE}`);
    }

    const id = generateListingId();
    const now = new Date().toISOString();
    const isDraft = listingData.isDraft ?? true;

    const [listing] = await this.db
      .insert(listings)
      .values({
        id,
        userId,
        categoryId: listingData.categoryId,
        title: listingData.title,
        description: listingData.description,
        priceUsd: listingData.priceUsd,
        images: listingData.images,
        contactUsername: listingData.contactUsername,
        status: isDraft ? ListingStatus.DRAFT : ListingStatus.ACTIVE,
        publishedAt: isDraft ? null : now,
        createdAt: now,
        expiresAt: new Date(Date.now() + LISTING_CONSTRAINTS.EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      })
      .returning();

    return listing;
  }

  /**
   * Find listing by ID
   */
  async findById(id: string): Promise<Listing | null> {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, id))
      .limit(1);

    return listing || null;
  }

  /**
   * Get listing with full relations and stats
   */
  async getWithStats(id: string): Promise<ListingWithStats | null> {
    const listing = await this.findById(id);
    if (!listing) return null;

    // In real implementation, these would be joined queries
    const stats: ListingWithStats = {
      ...listing,
      flagCount: 0,
      reportCount: 0,
      premiumFeaturesActive: [],
      daysSinceCreated: Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      hoursSinceLastBump: listing.bumpedAt ?
        Math.floor((Date.now() - new Date(listing.bumpedAt).getTime()) / (60 * 60 * 1000)) : undefined,
      viewsToday: 0,
      avgDailyViews: 0,
      contactClickCount: 0,
      timeLeft: getTimeLeft(listing),
      canBump: canBumpListing(listing),
      canEdit: true, // Would check user permissions
    };

    return stats;
  }

  /**
   * Update listing
   */
  async update(id: string, updateData: UpdateListing, userId?: number): Promise<Listing | null> {
    const existingListing = await this.findById(id);
    if (!existingListing) {
      throw new Error('Listing not found');
    }

    // Check ownership if userId provided
    if (userId && !validateListingOwnership(existingListing, userId)) {
      throw new Error('Not authorized to update this listing');
    }

    // Validate status transition
    if (updateData.status && !isValidStatusTransition(existingListing.status as ListingStatus, updateData.status as ListingStatus)) {
      throw new Error(`Invalid status transition from ${existingListing.status} to ${updateData.status}`);
    }

    // Set publishedAt when moving from draft to active
    const updates: any = { ...updateData };
    if (updateData.status === ListingStatus.ACTIVE && existingListing.status === ListingStatus.DRAFT) {
      updates.publishedAt = new Date().toISOString();
    }

    // Set archivedAt when archiving
    if (updateData.status === ListingStatus.ARCHIVED) {
      updates.archivedAt = new Date().toISOString();
    }

    const [listing] = await this.db
      .update(listings)
      .set(updates)
      .where(eq(listings.id, id))
      .returning();

    return listing || null;
  }

  /**
   * Bump listing (move to top of feed)
   */
  async bump(id: string, userId: number): Promise<BumpResult> {
    const listing = await this.findById(id);
    if (!listing) {
      return { success: false, listing: null, error: 'Listing not found' };
    }

    // Check ownership
    if (!validateListingOwnership(listing, userId)) {
      return { success: false, listing: null, error: 'Not authorized to bump this listing' };
    }

    // Check if can bump
    if (!canBumpListing(listing)) {
      const nextBump = listing.bumpedAt ?
        new Date(new Date(listing.bumpedAt).getTime() + 24 * 60 * 60 * 1000).toISOString() :
        new Date().toISOString();

      return {
        success: false,
        listing: null,
        error: 'Cannot bump listing yet',
        nextBumpAvailable: nextBump
      };
    }

    const now = new Date().toISOString();
    const [updatedListing] = await this.db
      .update(listings)
      .set({
        bumpedAt: now,
        status: ListingStatus.ACTIVE, // Reactivate if expired
        expiresAt: new Date(Date.now() + LISTING_CONSTRAINTS.EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      })
      .where(eq(listings.id, id))
      .returning();

    return { success: true, listing: updatedListing };
  }

  /**
   * Mark listing as sold
   */
  async markSold(id: string, userId: number): Promise<Listing | null> {
    return await this.update(id, { status: ListingStatus.SOLD }, userId);
  }

  /**
   * Archive listing
   */
  async archive(id: string, userId: number): Promise<Listing | null> {
    return await this.update(id, { status: ListingStatus.ARCHIVED }, userId);
  }

  /**
   * Increment view count
   */
  async incrementViews(id: string): Promise<void> {
    await this.db
      .update(listings)
      .set({
        viewCount: sql`${listings.viewCount} + 1`
      })
      .where(eq(listings.id, id));
  }

  /**
   * Search and filter listings
   */
  async search(
    filters: ListingSearchFilters = {},
    page = 1,
    limit = 20
  ): Promise<ListingListResponse> {
    const startTime = Date.now();

    let query = this.db.select().from(listings);
    let countQuery = this.db.select({ count: count() }).from(listings);

    const conditions = [];

    // Status filter
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(listings.status, filters.status));
    } else if (!filters.status || filters.status !== 'all') {
      // Default to active listings only
      conditions.push(eq(listings.status, ListingStatus.ACTIVE));
    }

    // Category filter
    if (filters.categoryId) {
      conditions.push(eq(listings.categoryId, filters.categoryId));
    }

    // User filter
    if (filters.userId) {
      conditions.push(eq(listings.userId, filters.userId));
    }

    // Price range
    if (filters.minPrice !== undefined) {
      conditions.push(gte(listings.priceUsd, filters.minPrice));
    }
    if (filters.maxPrice !== undefined) {
      conditions.push(lte(listings.priceUsd, filters.maxPrice));
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(listings.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(listings.createdAt, filters.createdBefore));
    }

    // Expiring soon filter
    if (filters.expiringWithinDays) {
      const futureDate = new Date(Date.now() + filters.expiringWithinDays * 24 * 60 * 60 * 1000).toISOString();
      conditions.push(lte(listings.expiresAt, futureDate));
    }

    // Premium features
    if (filters.isSticky) {
      conditions.push(eq(listings.isSticky, true));
    }
    if (filters.isHighlighted) {
      conditions.push(eq(listings.isHighlighted, true));
    }
    if (filters.hasAutoBump) {
      conditions.push(eq(listings.autoBumpEnabled, true));
    }

    // Text search
    if (filters.query) {
      conditions.push(
        or(
          like(listings.title, `%${filters.query}%`),
          like(listings.description, `%${filters.query}%`)
        )
      );
    }

    // Apply conditions
    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    // Get total count
    const [{ count: totalCount }] = await countQuery;

    // Apply sorting
    let orderBy;
    switch (filters.sortBy || 'newest') {
      case 'oldest':
        orderBy = [asc(listings.createdAt)];
        break;
      case 'price_asc':
        orderBy = [asc(listings.priceUsd)];
        break;
      case 'price_desc':
        orderBy = [desc(listings.priceUsd)];
        break;
      case 'expiring':
        orderBy = [asc(listings.expiresAt)];
        break;
      case 'bumped':
        orderBy = [desc(listings.bumpedAt), desc(listings.createdAt)];
        break;
      case 'newest':
      default:
        // Premium listings first, then by creation/bump date
        orderBy = [
          desc(listings.isSticky),
          desc(sql`COALESCE(${listings.bumpedAt}, ${listings.createdAt})`),
          desc(listings.createdAt)
        ];
    }

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(...orderBy)
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const listingResults = hasMore ? results.slice(0, limit) : results;

    // Enhance with stats
    const listingsWithStats: ListingWithStats[] = listingResults.map(listing => ({
      ...listing,
      flagCount: 0,
      reportCount: 0,
      premiumFeaturesActive: [
        listing.isSticky ? 'sticky' : '',
        listing.isHighlighted ? 'highlighted' : '',
        listing.autoBumpEnabled ? 'auto_bump' : ''
      ].filter(Boolean),
      daysSinceCreated: Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      hoursSinceLastBump: listing.bumpedAt ?
        Math.floor((Date.now() - new Date(listing.bumpedAt).getTime()) / (60 * 60 * 1000)) : undefined,
      viewsToday: 0,
      avgDailyViews: 0,
      contactClickCount: 0,
      timeLeft: getTimeLeft(listing),
      canBump: canBumpListing(listing),
      canEdit: true, // Would check user permissions
    }));

    const searchTime = Date.now() - startTime;

    return {
      listings: listingsWithStats,
      totalCount,
      hasMore,
      searchMeta: {
        totalResults: totalCount,
        searchTime,
        suggestedFilters: [],
        relatedCategories: [],
      },
    };
  }

  /**
   * Get user's listings
   */
  async getUserListings(userId: number, status?: ListingStatus): Promise<Listing[]> {
    let query = this.db
      .select()
      .from(listings)
      .where(eq(listings.userId, userId));

    if (status) {
      query = query.where(and(eq(listings.userId, userId), eq(listings.status, status)));
    }

    return await query.orderBy(desc(listings.createdAt));
  }

  /**
   * Get user's active listings count
   */
  async getUserActiveListingsCount(userId: number): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(listings)
      .where(and(
        eq(listings.userId, userId),
        inArray(listings.status, [ListingStatus.ACTIVE, ListingStatus.DRAFT])
      ));

    return result.count;
  }

  /**
   * Get featured/sticky listings
   */
  async getFeatured(limit = 10): Promise<Listing[]> {
    return await this.db
      .select()
      .from(listings)
      .where(and(
        eq(listings.status, ListingStatus.ACTIVE),
        eq(listings.isSticky, true)
      ))
      .orderBy(desc(listings.bumpedAt), desc(listings.createdAt))
      .limit(limit);
  }

  /**
   * Get recently bumped listings
   */
  async getRecentlyBumped(limit = 20): Promise<Listing[]> {
    return await this.db
      .select()
      .from(listings)
      .where(and(
        eq(listings.status, ListingStatus.ACTIVE),
        sql`${listings.bumpedAt} IS NOT NULL`
      ))
      .orderBy(desc(listings.bumpedAt))
      .limit(limit);
  }

  /**
   * Get expiring listings
   */
  async getExpiring(days = 1, limit = 50): Promise<Listing[]> {
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    return await this.db
      .select()
      .from(listings)
      .where(and(
        eq(listings.status, ListingStatus.ACTIVE),
        lte(listings.expiresAt, futureDate)
      ))
      .orderBy(asc(listings.expiresAt))
      .limit(limit);
  }

  /**
   * Mark expired listings
   */
  async markExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db
      .update(listings)
      .set({ status: ListingStatus.EXPIRED })
      .where(and(
        eq(listings.status, ListingStatus.ACTIVE),
        lte(listings.expiresAt, now)
      ));

    return result.rowsAffected;
  }

  /**
   * Delete listing (permanent)
   */
  async delete(id: string, userId?: number): Promise<boolean> {
    const listing = await this.findById(id);
    if (!listing) return false;

    // Check ownership if userId provided
    if (userId && !validateListingOwnership(listing, userId)) {
      throw new Error('Not authorized to delete this listing');
    }

    const result = await this.db
      .delete(listings)
      .where(eq(listings.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Get listing statistics
   */
  async getStats(): Promise<{
    totalListings: number;
    activeListings: number;
    draftListings: number;
    expiredListings: number;
    soldListings: number;
    premiumListings: number;
    avgPrice: number;
    totalViews: number;
  }> {
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(listings);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(listings)
      .where(eq(listings.status, ListingStatus.ACTIVE));

    const [draftResult] = await this.db
      .select({ count: count() })
      .from(listings)
      .where(eq(listings.status, ListingStatus.DRAFT));

    const [expiredResult] = await this.db
      .select({ count: count() })
      .from(listings)
      .where(eq(listings.status, ListingStatus.EXPIRED));

    const [soldResult] = await this.db
      .select({ count: count() })
      .from(listings)
      .where(eq(listings.status, ListingStatus.SOLD));

    const [premiumResult] = await this.db
      .select({ count: count() })
      .from(listings)
      .where(or(
        eq(listings.isSticky, true),
        eq(listings.isHighlighted, true),
        eq(listings.autoBumpEnabled, true)
      ));

    const [priceResult] = await this.db
      .select({
        avg: sql<number>`AVG(${listings.priceUsd})`,
        totalViews: sql<number>`SUM(${listings.viewCount})`
      })
      .from(listings)
      .where(eq(listings.status, ListingStatus.ACTIVE));

    return {
      totalListings: totalResult.count,
      activeListings: activeResult.count,
      draftListings: draftResult.count,
      expiredListings: expiredResult.count,
      soldListings: soldResult.count,
      premiumListings: premiumResult.count,
      avgPrice: priceResult.avg || 0,
      totalViews: priceResult.totalViews || 0,
    };
  }

  /**
   * Check if listing exists
   */
  async exists(id: string): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(listings)
      .where(eq(listings.id, id));

    return result.count > 0;
  }

  /**
   * Get popular listings (by views)
   */
  async getPopular(limit = 10, days = 7): Promise<Listing[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    return await this.db
      .select()
      .from(listings)
      .where(and(
        eq(listings.status, ListingStatus.ACTIVE),
        gte(listings.createdAt, startDate)
      ))
      .orderBy(desc(listings.viewCount), desc(listings.createdAt))
      .limit(limit);
  }

  /**
   * Get similar listings (same category, similar price)
   */
  async getSimilar(listingId: string, limit = 5): Promise<Listing[]> {
    const baseListing = await this.findById(listingId);
    if (!baseListing) return [];

    const priceRange = baseListing.priceUsd * 0.3; // 30% price tolerance

    return await this.db
      .select()
      .from(listings)
      .where(and(
        eq(listings.status, ListingStatus.ACTIVE),
        eq(listings.categoryId, baseListing.categoryId),
        sql`${listings.id} != ${listingId}`,
        gte(listings.priceUsd, baseListing.priceUsd - priceRange),
        lte(listings.priceUsd, baseListing.priceUsd + priceRange)
      ))
      .orderBy(desc(listings.createdAt))
      .limit(limit);
  }

  /**
   * Validate business rules
   */
  validateBusinessRules(listing: CreateListing | UpdateListing): string[] {
    const errors: string[] = [];

    if ('title' in listing && listing.title) {
      if (listing.title.length > LISTING_CONSTRAINTS.MAX_TITLE_LENGTH) {
        errors.push(`Title cannot exceed ${LISTING_CONSTRAINTS.MAX_TITLE_LENGTH} characters`);
      }
    }

    if ('description' in listing && listing.description) {
      if (listing.description.length > LISTING_CONSTRAINTS.MAX_DESCRIPTION_LENGTH) {
        errors.push(`Description cannot exceed ${LISTING_CONSTRAINTS.MAX_DESCRIPTION_LENGTH} characters`);
      }
    }

    if ('priceUsd' in listing && listing.priceUsd !== undefined) {
      if (listing.priceUsd < LISTING_CONSTRAINTS.MIN_PRICE) {
        errors.push(`Price cannot be less than $${LISTING_CONSTRAINTS.MIN_PRICE}`);
      }
      if (listing.priceUsd > LISTING_CONSTRAINTS.MAX_PRICE) {
        errors.push(`Price cannot exceed $${LISTING_CONSTRAINTS.MAX_PRICE}`);
      }
    }

    if ('images' in listing && listing.images) {
      if (listing.images.length < LISTING_CONSTRAINTS.MIN_IMAGES) {
        errors.push(`At least ${LISTING_CONSTRAINTS.MIN_IMAGES} image is required`);
      }
      if (listing.images.length > LISTING_CONSTRAINTS.MAX_IMAGES) {
        errors.push(`Maximum ${LISTING_CONSTRAINTS.MAX_IMAGES} images allowed`);
      }
    }

    return errors;
  }

  /**
   * Helper methods
   */
  isExpired(listing: Listing): boolean {
    return isListingExpired(listing);
  }

  canBump(listing: Listing): boolean {
    return canBumpListing(listing);
  }

  getTimeLeft(listing: Listing): string {
    return getTimeLeft(listing);
  }

  validateOwnership(listing: Listing, userId: number): boolean {
    return validateListingOwnership(listing, userId);
  }

  getConstraints() {
    return LISTING_CONSTRAINTS;
  }
}

// Export types and functions for use in other modules
export {
  Listing,
  NewListing,
  CreateListing,
  UpdateListing,
  ListingSearch,
  ListingWithRelations,
  ListingWithStats,
  ListingStatus,
  generateListingId,
  isListingExpired,
  canBumpListing,
  getTimeLeft,
  validateListingOwnership,
  canUserCreateListing,
  isValidStatusTransition,
  LISTING_CONSTRAINTS
};
export type {
  ListingSearchFilters,
  ListingListResponse,
  ListingCreateData,
  BumpResult
};