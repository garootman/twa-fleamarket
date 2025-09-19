import { Database } from '../db/index';
import { type Listing } from '../db/models/listing';
import { type User } from '../db/models/user';

export interface AdminListingFilters {
  status?: string;
  isFlagged?: boolean;
  isSticky?: boolean;
  userId?: number;
  limit?: number;
  offset?: number;
}

export interface AdminDashboardStats {
  users: {
    total: number;
    active: number;
    banned: number;
    newToday: number;
  };
  listings: {
    total: number;
    active: number;
    pending: number;
    flagged: number;
  };
  moderation: {
    pendingFlags: number;
    resolvedToday: number;
  };
}

export class AdminService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: number, adminTelegramId: string): Promise<boolean> {
    try {
      const user = await this.db.$client
        .prepare('SELECT telegram_id FROM users WHERE id = ?')
        .bind(userId)
        .first() as { telegram_id: string } | null;

      return user?.telegram_id === adminTelegramId;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Get admin dashboard statistics
   */
  async getDashboardStats(): Promise<AdminDashboardStats> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get user stats
      const userStats = await this.db.$client
        .prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END) as banned,
            SUM(CASE WHEN DATE(created_at) = ? THEN 1 ELSE 0 END) as newToday
          FROM users
        `)
        .bind(today)
        .first() as any;

      // Get listing stats
      const listingStats = await this.db.$client
        .prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN is_flagged = 1 THEN 1 ELSE 0 END) as flagged
          FROM listings
        `)
        .first() as any;

      return {
        users: {
          total: userStats?.total || 0,
          active: userStats?.active || 0,
          banned: userStats?.banned || 0,
          newToday: userStats?.newToday || 0
        },
        listings: {
          total: listingStats?.total || 0,
          active: listingStats?.active || 0,
          pending: listingStats?.pending || 0,
          flagged: listingStats?.flagged || 0
        },
        moderation: {
          pendingFlags: listingStats?.flagged || 0,
          resolvedToday: 0 // Would need moderation_actions table to track this
        }
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw new Error('Failed to get dashboard statistics');
    }
  }

  /**
   * Get all listings with admin filters
   */
  async getListings(filters: AdminListingFilters = {}): Promise<Listing[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      if (filters.isFlagged !== undefined) {
        conditions.push('is_flagged = ?');
        params.push(filters.isFlagged ? 1 : 0);
      }

      if (filters.isSticky !== undefined) {
        conditions.push('is_sticky = ?');
        params.push(filters.isSticky ? 1 : 0);
      }

      if (filters.userId) {
        conditions.push('user_id = ?');
        params.push(filters.userId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Math.min(filters.limit || 50, 200);
      const offset = filters.offset || 0;

      const sql = `
        SELECT * FROM listings
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const result = await this.db.$client.prepare(sql).bind(...params).all();
      return result.results as Listing[];
    } catch (error) {
      console.error('Error getting admin listings:', error);
      return [];
    }
  }

  /**
   * Stick/unstick a listing
   */
  async toggleListingSticky(listingId: number, isSticky: boolean): Promise<boolean> {
    try {
      const sql = `
        UPDATE listings
        SET is_sticky = ?, updated_at = ?
        WHERE id = ?
      `;

      const result = await this.db.$client
        .prepare(sql)
        .bind(isSticky ? 1 : 0, new Date().toISOString(), listingId)
        .run();

      return result.success && result.meta.changes > 0;
    } catch (error) {
      console.error('Error toggling listing sticky:', error);
      return false;
    }
  }

  /**
   * Ban/unban a user
   */
  async toggleUserBan(userId: number, isBanned: boolean): Promise<boolean> {
    try {
      const sql = `
        UPDATE users
        SET is_banned = ?, updated_at = ?
        WHERE id = ?
      `;

      const result = await this.db.$client
        .prepare(sql)
        .bind(isBanned ? 1 : 0, new Date().toISOString(), userId)
        .run();

      return result.success && result.meta.changes > 0;
    } catch (error) {
      console.error('Error toggling user ban:', error);
      return false;
    }
  }

  /**
   * Get blocked words list (placeholder - would need blocked_words table)
   */
  async getBlockedWords(): Promise<string[]> {
    // Placeholder implementation - would need proper blocked_words table
    return ['spam', 'scam', 'fake', 'fraud'];
  }

  /**
   * Add blocked word (placeholder - would need blocked_words table)
   */
  async addBlockedWord(word: string): Promise<boolean> {
    // Placeholder implementation - would need proper blocked_words table
    console.log('Would add blocked word:', word);
    return true;
  }

  /**
   * Remove blocked word (placeholder - would need blocked_words table)
   */
  async removeBlockedWord(word: string): Promise<boolean> {
    // Placeholder implementation - would need proper blocked_words table
    console.log('Would remove blocked word:', word);
    return true;
  }

  /**
   * Get users with admin filters
   */
  async getUsers(limit: number = 50, offset: number = 0): Promise<User[]> {
    try {
      const sql = `
        SELECT * FROM users
        ORDER BY created_at DESC
        LIMIT ${Math.min(limit, 200)} OFFSET ${offset}
      `;

      const result = await this.db.$client.prepare(sql).all();
      return result.results as User[];
    } catch (error) {
      console.error('Error getting admin users:', error);
      return [];
    }
  }
}