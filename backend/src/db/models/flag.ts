import { eq, and, desc, asc, count, sql, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import {
  flags,
  type Flag,
  type NewFlag,
  type CreateFlag,
  FlagReason,
  FlagStatus,
  canUserFlag,
  MODERATION_CONSTRAINTS
} from '../../src/db/schema/moderation';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Flag Model - T043
 *
 * Provides business logic layer for content flagging and moderation reports.
 * Handles flag creation, review, duplicate prevention, and moderation workflow.
 */

export interface FlagWithDetails extends Flag {
  listing?: {
    id: string;
    title: string;
    userId: number;
    status: string;
  };
  reporter?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
  };
  reviewer?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
  };
  daysSinceCreated: number;
  daysSinceReviewed?: number;
}

export interface FlagSearchFilters {
  status?: FlagStatus | 'all';
  reason?: FlagReason;
  reporterId?: number;
  listingId?: string;
  reviewedBy?: number;
  createdAfter?: string;
  createdBefore?: string;
  reviewedAfter?: string;
  reviewedBefore?: string;
  pendingOnly?: boolean;
}

export interface FlagListResponse {
  flags: FlagWithDetails[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    pendingCount: number;
    upheldCount: number;
    dismissedCount: number;
    avgReviewTimeHours: number;
  };
}

export interface ReviewFlagData {
  status: FlagStatus.UPHELD | FlagStatus.DISMISSED;
  reviewedBy: number;
  reviewNotes?: string;
}

export interface FlagStats {
  totalFlags: number;
  pendingFlags: number;
  upheldFlags: number;
  dismissedFlags: number;
  flagsByReason: Record<FlagReason, number>;
  avgReviewTimeHours: number;
  topReporters: Array<{ reporterId: number; flagCount: number }>;
  topFlaggedListings: Array<{ listingId: string; flagCount: number }>;
}

export class FlagModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new flag/report
   */
  async create(flagData: CreateFlag): Promise<Flag> {
    // Check if user already flagged this listing
    const existingFlag = await this.findByListingAndReporter(flagData.listingId, flagData.reporterId);
    if (existingFlag) {
      throw new Error('You have already flagged this listing');
    }

    // Validate that user can flag this listing (not their own)
    // This would typically involve checking the listing owner
    // For now, assuming validation is done at the service layer

    // Validate description for "other" reason
    if (flagData.reason === FlagReason.OTHER) {
      if (!flagData.description || flagData.description.trim().length === 0) {
        throw new Error('Description is required when reason is "other"');
      }
      if (flagData.description.length > MODERATION_CONSTRAINTS.MAX_FLAG_DESCRIPTION_LENGTH) {
        throw new Error(`Description cannot exceed ${MODERATION_CONSTRAINTS.MAX_FLAG_DESCRIPTION_LENGTH} characters`);
      }
    }

    const [flag] = await this.db
      .insert(flags)
      .values({
        listingId: flagData.listingId,
        reporterId: flagData.reporterId,
        reason: flagData.reason,
        description: flagData.description || null,
        status: FlagStatus.PENDING,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return flag;
  }

  /**
   * Find flag by ID
   */
  async findById(id: number): Promise<Flag | null> {
    const [flag] = await this.db
      .select()
      .from(flags)
      .where(eq(flags.id, id))
      .limit(1);

    return flag || null;
  }

  /**
   * Find existing flag by listing and reporter
   */
  async findByListingAndReporter(listingId: string, reporterId: number): Promise<Flag | null> {
    const [flag] = await this.db
      .select()
      .from(flags)
      .where(and(
        eq(flags.listingId, listingId),
        eq(flags.reporterId, reporterId)
      ))
      .limit(1);

    return flag || null;
  }

  /**
   * Get flag with detailed information
   */
  async getWithDetails(id: number): Promise<FlagWithDetails | null> {
    const flag = await this.findById(id);
    if (!flag) return null;

    // In real implementation, this would use joins
    const flagWithDetails: FlagWithDetails = {
      ...flag,
      daysSinceCreated: Math.floor((Date.now() - new Date(flag.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      daysSinceReviewed: flag.reviewedAt ?
        Math.floor((Date.now() - new Date(flag.reviewedAt).getTime()) / (24 * 60 * 60 * 1000)) : undefined,
    };

    return flagWithDetails;
  }

  /**
   * Review a flag (admin action)
   */
  async review(id: number, reviewData: ReviewFlagData): Promise<Flag | null> {
    const existingFlag = await this.findById(id);
    if (!existingFlag) {
      throw new Error('Flag not found');
    }

    if (existingFlag.status !== FlagStatus.PENDING) {
      throw new Error('Flag has already been reviewed');
    }

    const [flag] = await this.db
      .update(flags)
      .set({
        status: reviewData.status,
        reviewedBy: reviewData.reviewedBy,
        reviewedAt: new Date().toISOString(),
      })
      .where(eq(flags.id, id))
      .returning();

    return flag || null;
  }

  /**
   * Get flags for a specific listing
   */
  async getByListing(listingId: string, includeResolved = true): Promise<Flag[]> {
    let query = this.db
      .select()
      .from(flags)
      .where(eq(flags.listingId, listingId));

    if (!includeResolved) {
      query = query.where(and(
        eq(flags.listingId, listingId),
        eq(flags.status, FlagStatus.PENDING)
      ));
    }

    return await query.orderBy(desc(flags.createdAt));
  }

  /**
   * Get flags by reporter
   */
  async getByReporter(reporterId: number, limit = 50): Promise<Flag[]> {
    return await this.db
      .select()
      .from(flags)
      .where(eq(flags.reporterId, reporterId))
      .orderBy(desc(flags.createdAt))
      .limit(limit);
  }

  /**
   * Search and filter flags
   */
  async search(
    filters: FlagSearchFilters = {},
    page = 1,
    limit = 50
  ): Promise<FlagListResponse> {
    let query = this.db.select().from(flags);
    let countQuery = this.db.select({ count: count() }).from(flags);

    const conditions = [];

    // Status filter
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(flags.status, filters.status));
    } else if (filters.pendingOnly) {
      conditions.push(eq(flags.status, FlagStatus.PENDING));
    }

    // Reason filter
    if (filters.reason) {
      conditions.push(eq(flags.reason, filters.reason));
    }

    // Reporter filter
    if (filters.reporterId) {
      conditions.push(eq(flags.reporterId, filters.reporterId));
    }

    // Listing filter
    if (filters.listingId) {
      conditions.push(eq(flags.listingId, filters.listingId));
    }

    // Reviewer filter
    if (filters.reviewedBy) {
      conditions.push(eq(flags.reviewedBy, filters.reviewedBy));
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(flags.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(flags.createdAt, filters.createdBefore));
    }
    if (filters.reviewedAfter) {
      conditions.push(gte(flags.reviewedAt, filters.reviewedAfter));
    }
    if (filters.reviewedBefore) {
      conditions.push(lte(flags.reviewedAt, filters.reviewedBefore));
    }

    // Apply conditions
    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    // Get total count
    const [{ count: totalCount }] = await countQuery;

    // Get stats
    const stats = await this.getQuickStats();

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(desc(flags.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const flagList = hasMore ? results.slice(0, limit) : results;

    // Enhance with details
    const flagsWithDetails: FlagWithDetails[] = flagList.map(flag => ({
      ...flag,
      daysSinceCreated: Math.floor((Date.now() - new Date(flag.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      daysSinceReviewed: flag.reviewedAt ?
        Math.floor((Date.now() - new Date(flag.reviewedAt).getTime()) / (24 * 60 * 60 * 1000)) : undefined,
    }));

    return {
      flags: flagsWithDetails,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Get pending flags for admin review
   */
  async getPending(limit = 50): Promise<Flag[]> {
    return await this.db
      .select()
      .from(flags)
      .where(eq(flags.status, FlagStatus.PENDING))
      .orderBy(asc(flags.createdAt)) // Oldest first for fairness
      .limit(limit);
  }

  /**
   * Get flags requiring urgent attention
   */
  async getUrgent(days = 7, limit = 20): Promise<Flag[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    return await this.db
      .select()
      .from(flags)
      .where(and(
        eq(flags.status, FlagStatus.PENDING),
        lte(flags.createdAt, cutoffDate)
      ))
      .orderBy(asc(flags.createdAt))
      .limit(limit);
  }

  /**
   * Get flag count for a listing
   */
  async getListingFlagCount(listingId: string, pendingOnly = false): Promise<number> {
    let query = this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.listingId, listingId));

    if (pendingOnly) {
      query = query.where(and(
        eq(flags.listingId, listingId),
        eq(flags.status, FlagStatus.PENDING)
      ));
    }

    const [result] = await query;
    return result.count;
  }

  /**
   * Get reporter's flag statistics
   */
  async getReporterStats(reporterId: number): Promise<{
    totalFlags: number;
    upheldFlags: number;
    dismissedFlags: number;
    pendingFlags: number;
    accuracyRate: number;
  }> {
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.reporterId, reporterId));

    const [upheldResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(and(
        eq(flags.reporterId, reporterId),
        eq(flags.status, FlagStatus.UPHELD)
      ));

    const [dismissedResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(and(
        eq(flags.reporterId, reporterId),
        eq(flags.status, FlagStatus.DISMISSED)
      ));

    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(and(
        eq(flags.reporterId, reporterId),
        eq(flags.status, FlagStatus.PENDING)
      ));

    const totalReviewed = upheldResult.count + dismissedResult.count;
    const accuracyRate = totalReviewed > 0 ? (upheldResult.count / totalReviewed) * 100 : 0;

    return {
      totalFlags: totalResult.count,
      upheldFlags: upheldResult.count,
      dismissedFlags: dismissedResult.count,
      pendingFlags: pendingResult.count,
      accuracyRate: Math.round(accuracyRate * 100) / 100,
    };
  }

  /**
   * Get comprehensive flag statistics
   */
  async getStats(): Promise<FlagStats> {
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(flags);

    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.status, FlagStatus.PENDING));

    const [upheldResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.status, FlagStatus.UPHELD));

    const [dismissedResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.status, FlagStatus.DISMISSED));

    // Get flags by reason
    const reasonStats = await this.db
      .select({
        reason: flags.reason,
        count: count(),
      })
      .from(flags)
      .groupBy(flags.reason);

    const flagsByReason = Object.values(FlagReason).reduce((acc, reason) => {
      acc[reason] = reasonStats.find(stat => stat.reason === reason)?.count || 0;
      return acc;
    }, {} as Record<FlagReason, number>);

    // Calculate average review time
    const [avgTimeResult] = await this.db
      .select({
        avgHours: sql<number>`AVG(
          (julianday(${flags.reviewedAt}) - julianday(${flags.createdAt})) * 24
        )`
      })
      .from(flags)
      .where(isNotNull(flags.reviewedAt));

    // Get top reporters
    const topReporters = await this.db
      .select({
        reporterId: flags.reporterId,
        flagCount: count(),
      })
      .from(flags)
      .groupBy(flags.reporterId)
      .orderBy(desc(count()))
      .limit(10);

    // Get most flagged listings
    const topFlaggedListings = await this.db
      .select({
        listingId: flags.listingId,
        flagCount: count(),
      })
      .from(flags)
      .groupBy(flags.listingId)
      .orderBy(desc(count()))
      .limit(10);

    return {
      totalFlags: totalResult.count,
      pendingFlags: pendingResult.count,
      upheldFlags: upheldResult.count,
      dismissedFlags: dismissedResult.count,
      flagsByReason,
      avgReviewTimeHours: Math.round((avgTimeResult.avgHours || 0) * 100) / 100,
      topReporters: topReporters.map(r => ({
        reporterId: r.reporterId,
        flagCount: r.flagCount,
      })),
      topFlaggedListings: topFlaggedListings.map(l => ({
        listingId: l.listingId,
        flagCount: l.flagCount,
      })),
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    pendingCount: number;
    upheldCount: number;
    dismissedCount: number;
    avgReviewTimeHours: number;
  }> {
    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.status, FlagStatus.PENDING));

    const [upheldResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.status, FlagStatus.UPHELD));

    const [dismissedResult] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.status, FlagStatus.DISMISSED));

    const [avgTimeResult] = await this.db
      .select({
        avgHours: sql<number>`AVG(
          (julianday(${flags.reviewedAt}) - julianday(${flags.createdAt})) * 24
        )`
      })
      .from(flags)
      .where(isNotNull(flags.reviewedAt));

    return {
      pendingCount: pendingResult.count,
      upheldCount: upheldResult.count,
      dismissedCount: dismissedResult.count,
      avgReviewTimeHours: Math.round((avgTimeResult.avgHours || 0) * 100) / 100,
    };
  }

  /**
   * Delete flag (admin action)
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db
      .delete(flags)
      .where(eq(flags.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Check if user can flag a listing
   */
  canUserFlag(reporterId: number, listingOwnerId: number): boolean {
    return canUserFlag(reporterId, listingOwnerId);
  }

  /**
   * Check if flag exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(flags)
      .where(eq(flags.id, id));

    return result.count > 0;
  }

  /**
   * Get flags requiring action (pending for more than X hours)
   */
  async getFlagsRequiringAction(hoursThreshold = 24, limit = 50): Promise<Flag[]> {
    const cutoffDate = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();

    return await this.db
      .select()
      .from(flags)
      .where(and(
        eq(flags.status, FlagStatus.PENDING),
        lte(flags.createdAt, cutoffDate)
      ))
      .orderBy(asc(flags.createdAt))
      .limit(limit);
  }

  /**
   * Auto-dismiss flags for listings that are no longer active
   */
  async autoDismissStaleFlags(listingIds: string[]): Promise<number> {
    if (listingIds.length === 0) return 0;

    const result = await this.db
      .update(flags)
      .set({
        status: FlagStatus.DISMISSED,
        reviewedAt: new Date().toISOString(),
        reviewedBy: null, // System action
      })
      .where(and(
        eq(flags.status, FlagStatus.PENDING),
        sql`${flags.listingId} IN (${listingIds.map(id => `'${id}'`).join(',')})`
      ));

    return result.rowsAffected;
  }

  /**
   * Bulk review flags
   */
  async bulkReview(flagIds: number[], reviewData: ReviewFlagData): Promise<number> {
    if (flagIds.length === 0) return 0;

    const result = await this.db
      .update(flags)
      .set({
        status: reviewData.status,
        reviewedBy: reviewData.reviewedBy,
        reviewedAt: new Date().toISOString(),
      })
      .where(and(
        sql`${flags.id} IN (${flagIds.join(',')})`,
        eq(flags.status, FlagStatus.PENDING)
      ));

    return result.rowsAffected;
  }

  /**
   * Get moderation constraints
   */
  getConstraints() {
    return MODERATION_CONSTRAINTS;
  }
}

// Export types and enums for use in other modules
export {
  Flag,
  NewFlag,
  CreateFlag,
  FlagReason,
  FlagStatus,
  canUserFlag,
  MODERATION_CONSTRAINTS
};
export type {
  FlagWithDetails,
  FlagSearchFilters,
  FlagListResponse,
  ReviewFlagData,
  FlagStats
};