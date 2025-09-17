import { eq, and, desc, gte, lte, count, sql } from 'drizzle-orm';
import {
  users,
  type User,
  type NewUser,
  type CreateUser,
  type UpdateUser,
  UserStatus,
  getUserStatus,
  isUserAdmin,
} from '../../src/db/schema/users';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * User Model - T040
 *
 * Provides business logic layer for user management with Telegram integration.
 * Handles user authentication, profile management, banning, warnings, and admin checks.
 */

export interface UserWithStats extends User {
  listingsCount?: number;
  activeListingsCount?: number;
  flagsCount?: number;
  premiumFeaturesCount?: number;
}

export interface UserSearchFilters {
  status?: UserStatus[];
  banned?: boolean;
  warningCountMin?: number;
  warningCountMax?: number;
  createdAfter?: string;
  createdBefore?: string;
  lastActiveAfter?: string;
  lastActiveBefore?: string;
  hasUsername?: boolean;
  search?: string; // Search in username, firstName, lastName
}

export interface UserListResponse {
  users: UserWithStats[];
  totalCount: number;
  hasMore: boolean;
}

export class UserModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new user from Telegram authentication data
   */
  async create(userData: CreateUser): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({
        telegramId: userData.telegramId,
        username: userData.username || null,
        firstName: userData.firstName,
        lastName: userData.lastName || null,
        profilePhotoUrl: userData.profilePhotoUrl || null,
        lastAuthTimestamp: new Date().toISOString(), // Legacy compatibility
      })
      .returning();

    return user;
  }

  /**
   * Find user by Telegram ID
   */
  async findByTelegramId(telegramId: number): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    return user || null;
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const [user] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);

    return user || null;
  }

  /**
   * Update user profile
   */
  async update(telegramId: number, updateData: UpdateUser): Promise<User | null> {
    const [user] = await this.db
      .update(users)
      .set({
        ...updateData,
        updatedDate: new Date().toISOString(), // Legacy compatibility
        lastActive: new Date().toISOString(),
      })
      .where(eq(users.telegramId, telegramId))
      .returning();

    return user || null;
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(telegramId: number): Promise<void> {
    await this.db
      .update(users)
      .set({
        lastActive: new Date().toISOString(),
        lastAuthTimestamp: new Date().toISOString(), // Legacy compatibility
      })
      .where(eq(users.telegramId, telegramId));
  }

  /**
   * Ban a user
   */
  async banUser(telegramId: number, reason: string, bannedBy?: number): Promise<User | null> {
    const [user] = await this.db
      .update(users)
      .set({
        isBanned: true,
        banReason: reason,
        bannedAt: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      })
      .where(eq(users.telegramId, telegramId))
      .returning();

    return user || null;
  }

  /**
   * Unban a user
   */
  async unbanUser(telegramId: number): Promise<User | null> {
    const [user] = await this.db
      .update(users)
      .set({
        isBanned: false,
        banReason: null,
        bannedAt: null,
        updatedDate: new Date().toISOString(),
      })
      .where(eq(users.telegramId, telegramId))
      .returning();

    return user || null;
  }

  /**
   * Add warning to user
   */
  async addWarning(telegramId: number): Promise<User | null> {
    const [user] = await this.db
      .update(users)
      .set({
        warningCount: sql`${users.warningCount} + 1`,
        updatedDate: new Date().toISOString(),
      })
      .where(eq(users.telegramId, telegramId))
      .returning();

    return user || null;
  }

  /**
   * Remove warning from user (for appeals)
   */
  async removeWarning(telegramId: number): Promise<User | null> {
    const [user] = await this.db
      .update(users)
      .set({
        warningCount: sql`MAX(0, ${users.warningCount} - 1)`,
        updatedDate: new Date().toISOString(),
      })
      .where(eq(users.telegramId, telegramId))
      .returning();

    return user || null;
  }

  /**
   * Get user with statistics
   */
  async getWithStats(telegramId: number): Promise<UserWithStats | null> {
    const user = await this.findByTelegramId(telegramId);
    if (!user) return null;

    // These would be joined with actual listings, flags, etc. in real implementation
    // For now, returning user with placeholder stats
    return {
      ...user,
      listingsCount: 0,
      activeListingsCount: 0,
      flagsCount: 0,
      premiumFeaturesCount: 0,
    };
  }

  /**
   * Search and filter users
   */
  async search(filters: UserSearchFilters = {}, page = 1, limit = 50): Promise<UserListResponse> {
    let query = this.db.select().from(users);
    let countQuery = this.db.select({ count: count() }).from(users);

    // Apply filters
    const conditions = [];

    if (filters.banned !== undefined) {
      conditions.push(eq(users.isBanned, filters.banned));
    }

    if (filters.status && filters.status.length > 0) {
      // This would need more complex logic to filter by computed status
      if (filters.status.includes(UserStatus.BANNED)) {
        conditions.push(eq(users.isBanned, true));
      }
      if (
        filters.status.includes(UserStatus.WARNED) &&
        !filters.status.includes(UserStatus.BANNED)
      ) {
        conditions.push(and(eq(users.isBanned, false), sql`${users.warningCount} > 0`));
      }
      if (filters.status.includes(UserStatus.ACTIVE) && filters.status.length === 1) {
        conditions.push(and(eq(users.isBanned, false), eq(users.warningCount, 0)));
      }
    }

    if (filters.warningCountMin !== undefined) {
      conditions.push(gte(users.warningCount, filters.warningCountMin));
    }

    if (filters.warningCountMax !== undefined) {
      conditions.push(lte(users.warningCount, filters.warningCountMax));
    }

    if (filters.createdAfter) {
      conditions.push(gte(users.createdAt, filters.createdAfter));
    }

    if (filters.createdBefore) {
      conditions.push(lte(users.createdAt, filters.createdBefore));
    }

    if (filters.lastActiveAfter) {
      conditions.push(gte(users.lastActive, filters.lastActiveAfter));
    }

    if (filters.lastActiveBefore) {
      conditions.push(lte(users.lastActive, filters.lastActiveBefore));
    }

    if (filters.hasUsername !== undefined) {
      if (filters.hasUsername) {
        conditions.push(sql`${users.username} IS NOT NULL`);
      } else {
        conditions.push(sql`${users.username} IS NULL`);
      }
    }

    if (filters.search) {
      conditions.push(
        sql`(
          ${users.username} LIKE ${`%${filters.search}%`} OR
          ${users.firstName} LIKE ${`%${filters.search}%`} OR
          ${users.lastName} LIKE ${`%${filters.search}%`}
        )`
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

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(desc(users.lastActive))
      .limit(limit + 1) // Get one extra to check if there are more
      .offset(offset);

    const hasMore = results.length > limit;
    const users_list = hasMore ? results.slice(0, limit) : results;

    return {
      users: users_list,
      totalCount,
      hasMore,
    };
  }

  /**
   * Get recently active users
   */
  async getRecentlyActive(limit = 10): Promise<User[]> {
    return await this.db
      .select()
      .from(users)
      .where(eq(users.isBanned, false))
      .orderBy(desc(users.lastActive))
      .limit(limit);
  }

  /**
   * Get users by status
   */
  async getUsersByStatus(status: UserStatus, limit = 50): Promise<User[]> {
    let whereClause;

    switch (status) {
      case UserStatus.BANNED:
        whereClause = eq(users.isBanned, true);
        break;
      case UserStatus.WARNED:
        whereClause = and(eq(users.isBanned, false), sql`${users.warningCount} > 0`);
        break;
      case UserStatus.ACTIVE:
        whereClause = and(eq(users.isBanned, false), eq(users.warningCount, 0));
        break;
      default:
        throw new Error(`Invalid user status: ${status}`);
    }

    return await this.db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.lastActive))
      .limit(limit);
  }

  /**
   * Check if user is admin
   */
  isAdmin(user: User, adminId?: string): boolean {
    return isUserAdmin(user, adminId);
  }

  /**
   * Get user status
   */
  getStatus(user: User): UserStatus {
    return getUserStatus(user);
  }

  /**
   * Check if user exists
   */
  async exists(telegramId: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(users)
      .where(eq(users.telegramId, telegramId));

    return result.count > 0;
  }

  /**
   * Delete user (for GDPR compliance)
   */
  async delete(telegramId: number): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.telegramId, telegramId));

    return result.rowsAffected > 0;
  }

  /**
   * Get user statistics
   */
  async getStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    bannedUsers: number;
    warnedUsers: number;
    newUsersToday: number;
  }> {
    const [totalResult] = await this.db.select({ count: count() }).from(users);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.isBanned, false), eq(users.warningCount, 0)));

    const [bannedResult] = await this.db
      .select({ count: count() })
      .from(users)
      .where(eq(users.isBanned, true));

    const [warnedResult] = await this.db
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.isBanned, false), sql`${users.warningCount} > 0`));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [newTodayResult] = await this.db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, today.toISOString()));

    return {
      totalUsers: totalResult.count,
      activeUsers: activeResult.count,
      bannedUsers: bannedResult.count,
      warnedUsers: warnedResult.count,
      newUsersToday: newTodayResult.count,
    };
  }

  /**
   * Verify username accessibility (for Telegram contact)
   */
  async verifyUsername(telegramId: number): Promise<boolean> {
    const user = await this.findByTelegramId(telegramId);
    if (!user || !user.username) return false;

    // In real implementation, this would check if the username is publicly accessible
    // For now, just update the verification timestamp
    await this.db
      .update(users)
      .set({
        usernameVerifiedAt: new Date().toISOString(),
      })
      .where(eq(users.telegramId, telegramId));

    return true;
  }

  /**
   * Create or update user from Telegram auth data (upsert operation)
   */
  async createOrUpdate(userData: CreateUser): Promise<User> {
    const existingUser = await this.findByTelegramId(userData.telegramId);

    if (existingUser) {
      // Update existing user
      const updatedUser = await this.update(userData.telegramId, {
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profilePhotoUrl: userData.profilePhotoUrl,
      });
      return updatedUser!;
    } else {
      // Create new user
      return await this.create(userData);
    }
  }
}

// Export types and enums for use in other modules
export { User, NewUser, CreateUser, UpdateUser, UserStatus, getUserStatus, isUserAdmin };
export type { UserWithStats, UserSearchFilters, UserListResponse };
