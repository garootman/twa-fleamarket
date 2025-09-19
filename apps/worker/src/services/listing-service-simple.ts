import { Database } from '../db/index';
import { type Listing } from '../db/models/listing';

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

export class ListingServiceSimple {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Create a new listing
   */
  async create(userId: number, listingData: ListingCreateData): Promise<Listing | null> {
    try {
      const sql = `
        INSERT INTO listings (
          title, description, price, currency, category_id, user_id,
          location, contact_method, contact_value, images,
          status, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)
      `;

      const now = new Date().toISOString();
      const imagesJson = listingData.images ? JSON.stringify(listingData.images) : null;

      const result = await this.db.$client.prepare(sql).bind(
        listingData.title,
        listingData.description,
        listingData.price,
        listingData.currency || 'USD',
        listingData.categoryId,
        userId,
        listingData.location,
        listingData.contactMethod || 'telegram',
        listingData.contactValue,
        imagesJson,
        now,
        now
      ).run();

      if (result.success && result.meta.last_row_id) {
        return await this.findById(Number(result.meta.last_row_id));
      }

      return null;
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
      const conditions: string[] = ['is_active = 1'];
      const params: any[] = [];

      // Apply filters
      if (filters.categoryId) {
        conditions.push('category_id = ?');
        params.push(filters.categoryId);
      }

      if (filters.priceMin !== undefined) {
        conditions.push('price >= ?');
        params.push(filters.priceMin);
      }

      if (filters.priceMax !== undefined) {
        conditions.push('price <= ?');
        params.push(filters.priceMax);
      }

      if (filters.location) {
        conditions.push('location LIKE ?');
        params.push(`%${filters.location}%`);
      }

      if (filters.query) {
        conditions.push('(title LIKE ? OR description LIKE ?)');
        params.push(`%${filters.query}%`, `%${filters.query}%`);
      }

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      // Build sorting
      let orderBy = 'ORDER BY created_at DESC'; // Default
      if (filters.sortBy === 'price') {
        orderBy = filters.sortOrder === 'desc' ? 'ORDER BY price DESC' : 'ORDER BY price ASC';
      } else if (filters.sortBy === 'popularity') {
        orderBy = 'ORDER BY view_count DESC';
      }

      // Build pagination
      let limitClause = '';
      if (filters.limit) {
        limitClause = `LIMIT ${filters.limit}`;
        if (filters.offset) {
          limitClause += ` OFFSET ${filters.offset}`;
        }
      }

      const sql = `
        SELECT * FROM listings
        WHERE ${conditions.join(' AND ')}
        ${orderBy}
        ${limitClause}
      `;

      const result = await this.db.$client.prepare(sql).bind(...params).all();
      return result.results as Listing[];
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
      const sql = 'SELECT * FROM listings WHERE id = ? LIMIT 1';
      const result = await this.db.$client.prepare(sql).bind(id).first();
      return result as Listing | null;
    } catch (error) {
      console.error('Error finding listing by ID:', error);
      return null;
    }
  }

  /**
   * Update listing
   */
  async update(id: number, userId: number, updateData: UpdateListing): Promise<Listing | null> {
    try {
      // First check if listing exists and belongs to user
      const existing = await this.findById(id);
      if (!existing || existing.userId !== userId) {
        return null;
      }

      const updateFields: string[] = [];
      const params: any[] = [];

      // Build dynamic update query
      Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined) {
          const columnName = key === 'categoryId' ? 'category_id' :
                           key === 'contactMethod' ? 'contact_method' :
                           key === 'contactValue' ? 'contact_value' : key;

          updateFields.push(`${columnName} = ?`);
          params.push(key === 'images' && Array.isArray(value) ? JSON.stringify(value) : value);
        }
      });

      if (updateFields.length === 0) {
        return existing; // No changes
      }

      updateFields.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id); // For WHERE clause

      const sql = `
        UPDATE listings
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      const result = await this.db.$client.prepare(sql).bind(...params).run();

      if (result.success) {
        return await this.findById(id);
      }

      return null;
    } catch (error) {
      console.error('Error updating listing:', error);
      return null;
    }
  }

  /**
   * Archive listing (soft delete)
   */
  async archive(id: number, userId: number): Promise<boolean> {
    try {
      const sql = `
        UPDATE listings
        SET status = 'archived', is_active = 0, updated_at = ?
        WHERE id = ? AND user_id = ?
      `;

      const result = await this.db.$client.prepare(sql).bind(
        new Date().toISOString(),
        id,
        userId
      ).run();

      return result.success && result.meta.changes > 0;
    } catch (error) {
      console.error('Error archiving listing:', error);
      return false;
    }
  }

  /**
   * Increment view count
   */
  async incrementViews(id: number): Promise<boolean> {
    try {
      const sql = 'UPDATE listings SET view_count = view_count + 1 WHERE id = ?';
      const result = await this.db.$client.prepare(sql).bind(id).run();
      return result.success;
    } catch (error) {
      console.error('Error incrementing views:', error);
      return false;
    }
  }

  /**
   * Bump listing (premium feature)
   */
  async bump(id: number, userId: number): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const sql = `
        UPDATE listings
        SET last_bumped_at = ?, bump_count = bump_count + 1, updated_at = ?
        WHERE id = ? AND user_id = ?
      `;

      const result = await this.db.$client.prepare(sql).bind(now, now, id, userId).run();
      return result.success && result.meta.changes > 0;
    } catch (error) {
      console.error('Error bumping listing:', error);
      return false;
    }
  }

  /**
   * Flag listing for moderation
   */
  async flag(id: number, reason: string): Promise<boolean> {
    try {
      const sql = `
        UPDATE listings
        SET is_flagged = 1, flag_reason = ?, updated_at = ?
        WHERE id = ?
      `;

      const result = await this.db.$client.prepare(sql).bind(
        reason,
        new Date().toISOString(),
        id
      ).run();

      return result.success && result.meta.changes > 0;
    } catch (error) {
      console.error('Error flagging listing:', error);
      return false;
    }
  }

  /**
   * Publish a draft listing
   */
  async publish(id: number, userId: number): Promise<Listing | null> {
    try {
      // First check if listing exists and belongs to user
      const existing = await this.findById(id);
      if (!existing || existing.userId !== userId) {
        return null;
      }

      const sql = `
        UPDATE listings
        SET status = 'active', is_active = 1, updated_at = ?
        WHERE id = ? AND user_id = ?
      `;

      const result = await this.db.$client.prepare(sql).bind(
        new Date().toISOString(),
        id,
        userId
      ).run();

      if (result.success && result.meta.changes > 0) {
        return await this.findById(id);
      }

      return null;
    } catch (error) {
      console.error('Error publishing listing:', error);
      return null;
    }
  }

  /**
   * Get all listings by user ID
   */
  async findByUserId(userId: number, includeInactive: boolean = false): Promise<Listing[]> {
    try {
      let sql = 'SELECT * FROM listings WHERE user_id = ?';
      const params = [userId];

      if (!includeInactive) {
        sql += ' AND is_active = 1';
      }

      sql += ' ORDER BY created_at DESC';

      const result = await this.db.$client.prepare(sql).bind(...params).all();
      return result.results as Listing[];
    } catch (error) {
      console.error('Error finding listings by user ID:', error);
      return [];
    }
  }
}