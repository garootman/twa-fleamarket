import { Database } from '../db/index';
import { listings, type Listing, type NewListing } from '../db/models/listing';
import { categories, type Category } from '../db/models/category';
import { users, type User } from '../db/models/user';
import { eq, and, desc, asc, like, gte, lte } from 'drizzle-orm';

export interface ListingCreateData {
  title: string;
  description: string;
  price: number;
  currency?: string;
  categoryId: number;
  location?: string;
  contactMethod?: string;
  contactValue?: string;
  images?: string[];
}

export interface ListingSearchFilters {
  categoryId?: number;
  priceMin?: number;
  priceMax?: number;
  location?: string;
  query?: string;
  status?: string;
  sortBy?: 'price' | 'date' | 'popularity';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface UpdateListing {
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  categoryId?: number;
  location?: string;
  contactMethod?: string;
  contactValue?: string;
  images?: string[];
  status?: string;
}

export class ListingService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create a new listing
   */
  async create(userId: number, listingData: ListingCreateData): Promise<Listing | null> {
    try {
      const [newListing] = await this.db.insert(listings)
        .values({
          ...listingData,
          userId,
          images: listingData.images ? JSON.stringify(listingData.images) : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .returning();

      return newListing;
    } catch (error) {
      console.error('Error creating listing:', error);
      return null;
    }
  }

  /**
   * Search listings with filters
   */
  async search(filters: ListingSearchFilters = {}): Promise<Listing[]> {
    try {
      let query = this.db.select().from(listings);

      // Apply filters
      const conditions = [];

      if (filters.categoryId) {
        conditions.push(eq(listings.categoryId, filters.categoryId));
      }

      if (filters.priceMin !== undefined) {
        conditions.push(gte(listings.price, filters.priceMin));
      }

      if (filters.priceMax !== undefined) {
        conditions.push(lte(listings.price, filters.priceMax));
      }

      if (filters.location) {
        conditions.push(like(listings.location, `%${filters.location}%`));
      }

      if (filters.query) {
        conditions.push(like(listings.title, `%${filters.query}%`));
      }

      if (filters.status) {
        conditions.push(eq(listings.status, filters.status));
      } else {
        // Default to active listings
        conditions.push(eq(listings.isActive, true));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Apply sorting
      if (filters.sortBy === 'price') {
        query = query.orderBy(filters.sortOrder === 'desc' ? desc(listings.price) : asc(listings.price));
      } else if (filters.sortBy === 'popularity') {
        query = query.orderBy(desc(listings.viewCount));
      } else {
        // Default: sort by date (newest first)
        query = query.orderBy(desc(listings.createdAt));
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.offset(filters.offset);
      }

      return await query;
    } catch (error) {
      console.error('Error searching listings:', error);
      return [];
    }
  }

  /**
   * Find listing by ID
   */
  async findById(id: number): Promise<Listing | null> {
    try {
      const result = await this.db.select()
        .from(listings)
        .where(eq(listings.id, id))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('Error finding listing by ID:', error);
      return null;
    }
  }

  /**
   * Find listings by user
   */
  async findByUser(userId: number, status?: string): Promise<Listing[]> {
    try {
      let query = this.db.select()
        .from(listings)
        .where(eq(listings.userId, userId));

      if (status) {
        query = query.where(and(eq(listings.userId, userId), eq(listings.status, status)));
      }

      query = query.orderBy(desc(listings.createdAt));

      return await query;
    } catch (error) {
      console.error('Error finding listings by user:', error);
      return [];
    }
  }

  /**
   * Update listing
   */
  async update(listingId: number, userId: number, updateData: UpdateListing): Promise<Listing | null> {
    try {
      // Verify ownership
      const listing = await this.findById(listingId);
      if (!listing || listing.userId !== userId) {
        return null;
      }

      const updatePayload = {
        ...updateData,
        updatedAt: new Date().toISOString()
      };

      if (updateData.images) {
        updatePayload.images = JSON.stringify(updateData.images);
      }

      const [updatedListing] = await this.db.update(listings)
        .set(updatePayload)
        .where(eq(listings.id, listingId))
        .returning();

      return updatedListing || null;
    } catch (error) {
      console.error('Error updating listing:', error);
      return null;
    }
  }

  /**
   * Mark listing as sold
   */
  async markSold(listingId: number, userId: number): Promise<boolean> {
    try {
      const result = await this.update(listingId, userId, {
        status: 'sold',
        soldAt: new Date().toISOString()
      });

      return result !== null;
    } catch (error) {
      console.error('Error marking listing as sold:', error);
      return false;
    }
  }

  /**
   * Archive listing
   */
  async archive(listingId: number, userId: number): Promise<boolean> {
    try {
      const result = await this.update(listingId, userId, {
        status: 'archived',
        isActive: false
      });

      return result !== null;
    } catch (error) {
      console.error('Error archiving listing:', error);
      return false;
    }
  }

  /**
   * Delete listing
   */
  async delete(listingId: number, userId: number): Promise<boolean> {
    try {
      // Verify ownership
      const listing = await this.findById(listingId);
      if (!listing || listing.userId !== userId) {
        return false;
      }

      await this.db.delete(listings)
        .where(eq(listings.id, listingId));

      return true;
    } catch (error) {
      console.error('Error deleting listing:', error);
      return false;
    }
  }

  /**
   * Bump listing (promote to top)
   */
  async bump(listingId: number, userId: number): Promise<boolean> {
    try {
      const result = await this.update(listingId, userId, {
        lastBumpedAt: new Date().toISOString(),
        bumpCount: listing => listing.bumpCount + 1
      });

      return result !== null;
    } catch (error) {
      console.error('Error bumping listing:', error);
      return false;
    }
  }

  /**
   * Flag listing for moderation
   */
  async flag(listingId: number, reason: string): Promise<boolean> {
    try {
      const [updatedListing] = await this.db.update(listings)
        .set({
          isFlagged: true,
          flagReason: reason,
          updatedAt: new Date().toISOString()
        })
        .where(eq(listings.id, listingId))
        .returning();

      return updatedListing !== undefined;
    } catch (error) {
      console.error('Error flagging listing:', error);
      return false;
    }
  }

  /**
   * Get featured listings
   */
  async getFeatured(limit: number = 10): Promise<Listing[]> {
    try {
      return await this.db.select()
        .from(listings)
        .where(and(eq(listings.isActive, true), eq(listings.isPromoted, true)))
        .orderBy(desc(listings.createdAt))
        .limit(limit);
    } catch (error) {
      console.error('Error getting featured listings:', error);
      return [];
    }
  }

  /**
   * Get trending listings
   */
  async getTrending(limit: number = 10): Promise<Listing[]> {
    try {
      return await this.db.select()
        .from(listings)
        .where(eq(listings.isActive, true))
        .orderBy(desc(listings.viewCount), desc(listings.createdAt))
        .limit(limit);
    } catch (error) {
      console.error('Error getting trending listings:', error);
      return [];
    }
  }

  /**
   * Increment view count
   */
  async incrementViews(listingId: number): Promise<void> {
    try {
      await this.db.update(listings)
        .set({
          viewCount: listing => listing.viewCount + 1
        })
        .where(eq(listings.id, listingId));
    } catch (error) {
      console.error('Error incrementing views:', error);
    }
  }

  /**
   * Get listing statistics
   */
  async getStats(userId?: number): Promise<any> {
    try {
      if (userId) {
        // User-specific stats
        const userListings = await this.findByUser(userId);
        return {
          total: userListings.length,
          active: userListings.filter(l => l.status === 'active').length,
          sold: userListings.filter(l => l.status === 'sold').length,
          draft: userListings.filter(l => l.status === 'draft').length
        };
      } else {
        // Global stats
        const allListings = await this.db.select().from(listings);
        return {
          total: allListings.length,
          active: allListings.filter(l => l.isActive).length,
          sold: allListings.filter(l => l.status === 'sold').length
        };
      }
    } catch (error) {
      console.error('Error getting stats:', error);
      return {};
    }
  }
}