import { eq, and, desc, asc, count, sql, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import {
  appeals,
  type Appeal,
  type NewAppeal,
  type CreateAppeal,
  AppealStatus,
  MODERATION_CONSTRAINTS,
} from '../../src/db/schema/moderation';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Appeal Model - T045
 *
 * Provides business logic layer for user appeals of moderation actions.
 * Handles appeal creation, review, status tracking, and appeal workflow.
 */

export interface AppealWithDetails extends Appeal {
  user?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
    lastName?: string | null;
  };
  moderationAction?: {
    id: number;
    actionType: string;
    reason: string;
    createdAt: string;
    adminId: number;
  };
  reviewer?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
  };
  daysSinceCreated: number;
  daysSinceReviewed?: number;
  daysUntilDeadline: number;
  isWithinDeadline: boolean;
}

export interface AppealSearchFilters {
  status?: AppealStatus | 'all';
  userId?: number;
  reviewedBy?: number;
  moderationActionId?: number;
  createdAfter?: string;
  createdBefore?: string;
  reviewedAfter?: string;
  reviewedBefore?: string;
  pendingOnly?: boolean;
  urgentOnly?: boolean; // Appeals near deadline
}

export interface AppealListResponse {
  appeals: AppealWithDetails[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    pendingCount: number;
    approvedCount: number;
    deniedCount: number;
    avgReviewTimeHours: number;
    urgentCount: number;
  };
}

export interface ReviewAppealData {
  status: AppealStatus.APPROVED | AppealStatus.DENIED;
  adminResponse?: string;
  reviewedBy: number;
}

export interface AppealStats {
  totalAppeals: number;
  pendingAppeals: number;
  approvedAppeals: number;
  deniedAppeals: number;
  successRate: number;
  avgReviewTimeHours: number;
  appealsByActionType: Record<string, number>;
  appealsByUser: Array<{ userId: number; appealCount: number }>;
  recentAppeals: Appeal[];
  urgentAppeals: number;
  expiredAppeals: number;
}

export class AppealModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new appeal
   */
  async create(appealData: CreateAppeal): Promise<Appeal> {
    // Check if user already appealed this action
    const existingAppeal = await this.findByActionAndUser(
      appealData.moderationActionId,
      appealData.userId
    );
    if (existingAppeal) {
      throw new Error('You have already appealed this moderation action');
    }

    // Validate message length
    if (appealData.message.length > MODERATION_CONSTRAINTS.MAX_APPEAL_MESSAGE_LENGTH) {
      throw new Error(
        `Appeal message cannot exceed ${MODERATION_CONSTRAINTS.MAX_APPEAL_MESSAGE_LENGTH} characters`
      );
    }

    // Check if appeal is within deadline (this would require checking the moderation action)
    // For now, assuming validation is done at the service layer

    const [appeal] = await this.db
      .insert(appeals)
      .values({
        userId: appealData.userId,
        moderationActionId: appealData.moderationActionId,
        message: appealData.message,
        status: AppealStatus.PENDING,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return appeal;
  }

  /**
   * Find appeal by ID
   */
  async findById(id: number): Promise<Appeal | null> {
    const [appeal] = await this.db.select().from(appeals).where(eq(appeals.id, id)).limit(1);

    return appeal || null;
  }

  /**
   * Find existing appeal by moderation action and user
   */
  async findByActionAndUser(moderationActionId: number, userId: number): Promise<Appeal | null> {
    const [appeal] = await this.db
      .select()
      .from(appeals)
      .where(and(eq(appeals.moderationActionId, moderationActionId), eq(appeals.userId, userId)))
      .limit(1);

    return appeal || null;
  }

  /**
   * Get appeal with detailed information
   */
  async getWithDetails(id: number): Promise<AppealWithDetails | null> {
    const appeal = await this.findById(id);
    if (!appeal) return null;

    // Calculate deadline info
    const createdDate = new Date(appeal.createdAt);
    const deadlineDate = new Date(
      createdDate.getTime() + MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    );
    const now = new Date();

    const appealWithDetails: AppealWithDetails = {
      ...appeal,
      daysSinceCreated: Math.floor((now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000)),
      daysSinceReviewed: appeal.reviewedAt
        ? Math.floor(
            (now.getTime() - new Date(appeal.reviewedAt).getTime()) / (24 * 60 * 60 * 1000)
          )
        : undefined,
      daysUntilDeadline: Math.floor(
        (deadlineDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      ),
      isWithinDeadline: now <= deadlineDate,
    };

    return appealWithDetails;
  }

  /**
   * Review an appeal (admin action)
   */
  async review(id: number, reviewData: ReviewAppealData): Promise<Appeal | null> {
    const existingAppeal = await this.findById(id);
    if (!existingAppeal) {
      throw new Error('Appeal not found');
    }

    if (existingAppeal.status !== AppealStatus.PENDING) {
      throw new Error('Appeal has already been reviewed');
    }

    // Check if appeal is still within deadline
    const createdDate = new Date(existingAppeal.createdAt);
    const deadlineDate = new Date(
      createdDate.getTime() + MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    );
    if (new Date() > deadlineDate) {
      throw new Error('Appeal deadline has expired');
    }

    // Validate admin response length
    if (
      reviewData.adminResponse &&
      reviewData.adminResponse.length > MODERATION_CONSTRAINTS.MAX_ADMIN_RESPONSE_LENGTH
    ) {
      throw new Error(
        `Admin response cannot exceed ${MODERATION_CONSTRAINTS.MAX_ADMIN_RESPONSE_LENGTH} characters`
      );
    }

    const [appeal] = await this.db
      .update(appeals)
      .set({
        status: reviewData.status,
        adminResponse: reviewData.adminResponse || null,
        reviewedBy: reviewData.reviewedBy,
        reviewedAt: new Date().toISOString(),
      })
      .where(eq(appeals.id, id))
      .returning();

    return appeal || null;
  }

  /**
   * Get appeals for a specific user
   */
  async getUserAppeals(userId: number, limit = 50): Promise<Appeal[]> {
    return await this.db
      .select()
      .from(appeals)
      .where(eq(appeals.userId, userId))
      .orderBy(desc(appeals.createdAt))
      .limit(limit);
  }

  /**
   * Get appeals for a specific moderation action
   */
  async getActionAppeals(moderationActionId: number): Promise<Appeal[]> {
    return await this.db
      .select()
      .from(appeals)
      .where(eq(appeals.moderationActionId, moderationActionId))
      .orderBy(desc(appeals.createdAt));
  }

  /**
   * Get appeals reviewed by admin
   */
  async getAdminReviews(reviewedBy: number, limit = 100): Promise<Appeal[]> {
    return await this.db
      .select()
      .from(appeals)
      .where(eq(appeals.reviewedBy, reviewedBy))
      .orderBy(desc(appeals.reviewedAt))
      .limit(limit);
  }

  /**
   * Search and filter appeals
   */
  async search(
    filters: AppealSearchFilters = {},
    page = 1,
    limit = 50
  ): Promise<AppealListResponse> {
    let query = this.db.select().from(appeals);
    let countQuery = this.db.select({ count: count() }).from(appeals);

    const conditions = [];

    // Status filter
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(appeals.status, filters.status));
    } else if (filters.pendingOnly) {
      conditions.push(eq(appeals.status, AppealStatus.PENDING));
    }

    // User filter
    if (filters.userId) {
      conditions.push(eq(appeals.userId, filters.userId));
    }

    // Reviewer filter
    if (filters.reviewedBy) {
      conditions.push(eq(appeals.reviewedBy, filters.reviewedBy));
    }

    // Moderation action filter
    if (filters.moderationActionId) {
      conditions.push(eq(appeals.moderationActionId, filters.moderationActionId));
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(appeals.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(appeals.createdAt, filters.createdBefore));
    }
    if (filters.reviewedAfter) {
      conditions.push(gte(appeals.reviewedAt, filters.reviewedAfter));
    }
    if (filters.reviewedBefore) {
      conditions.push(lte(appeals.reviewedAt, filters.reviewedBefore));
    }

    // Urgent filter (near deadline)
    if (filters.urgentOnly) {
      const urgentDate = new Date(
        Date.now() - (MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS - 2) * 24 * 60 * 60 * 1000
      ).toISOString();
      conditions.push(
        and(eq(appeals.status, AppealStatus.PENDING), lte(appeals.createdAt, urgentDate))
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

    // Get stats
    const stats = await this.getQuickStats();

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(desc(appeals.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const appealList = hasMore ? results.slice(0, limit) : results;

    // Enhance with details
    const appealsWithDetails: AppealWithDetails[] = appealList.map(appeal => {
      const createdDate = new Date(appeal.createdAt);
      const deadlineDate = new Date(
        createdDate.getTime() + MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
      );
      const now = new Date();

      return {
        ...appeal,
        daysSinceCreated: Math.floor(
          (now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000)
        ),
        daysSinceReviewed: appeal.reviewedAt
          ? Math.floor(
              (now.getTime() - new Date(appeal.reviewedAt).getTime()) / (24 * 60 * 60 * 1000)
            )
          : undefined,
        daysUntilDeadline: Math.floor(
          (deadlineDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        ),
        isWithinDeadline: now <= deadlineDate,
      };
    });

    return {
      appeals: appealsWithDetails,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Get pending appeals for admin review
   */
  async getPending(limit = 50): Promise<Appeal[]> {
    return await this.db
      .select()
      .from(appeals)
      .where(eq(appeals.status, AppealStatus.PENDING))
      .orderBy(asc(appeals.createdAt)) // Oldest first for fairness
      .limit(limit);
  }

  /**
   * Get urgent appeals (near deadline)
   */
  async getUrgent(daysBeforeDeadline = 2, limit = 20): Promise<Appeal[]> {
    const urgentDate = new Date(
      Date.now() -
        (MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS - daysBeforeDeadline) * 24 * 60 * 60 * 1000
    ).toISOString();

    return await this.db
      .select()
      .from(appeals)
      .where(and(eq(appeals.status, AppealStatus.PENDING), lte(appeals.createdAt, urgentDate)))
      .orderBy(asc(appeals.createdAt))
      .limit(limit);
  }

  /**
   * Get expired appeals (past deadline)
   */
  async getExpired(): Promise<Appeal[]> {
    const expiredDate = new Date(
      Date.now() - MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    return await this.db
      .select()
      .from(appeals)
      .where(and(eq(appeals.status, AppealStatus.PENDING), lte(appeals.createdAt, expiredDate)))
      .orderBy(asc(appeals.createdAt));
  }

  /**
   * Auto-deny expired appeals
   */
  async autoDenyExpired(): Promise<number> {
    const expiredDate = new Date(
      Date.now() - MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const result = await this.db
      .update(appeals)
      .set({
        status: AppealStatus.DENIED,
        adminResponse: 'Appeal automatically denied due to deadline expiration',
        reviewedAt: new Date().toISOString(),
        reviewedBy: null, // System action
      })
      .where(and(eq(appeals.status, AppealStatus.PENDING), lte(appeals.createdAt, expiredDate)));

    return result.rowsAffected;
  }

  /**
   * Get user's appeal statistics
   */
  async getUserStats(userId: number): Promise<{
    totalAppeals: number;
    approvedAppeals: number;
    deniedAppeals: number;
    pendingAppeals: number;
    successRate: number;
    lastAppeal?: Appeal;
  }> {
    const userAppeals = await this.getUserAppeals(userId);

    const approved = userAppeals.filter(a => a.status === AppealStatus.APPROVED).length;
    const denied = userAppeals.filter(a => a.status === AppealStatus.DENIED).length;
    const pending = userAppeals.filter(a => a.status === AppealStatus.PENDING).length;

    const totalReviewed = approved + denied;
    const successRate = totalReviewed > 0 ? (approved / totalReviewed) * 100 : 0;

    return {
      totalAppeals: userAppeals.length,
      approvedAppeals: approved,
      deniedAppeals: denied,
      pendingAppeals: pending,
      successRate: Math.round(successRate * 100) / 100,
      lastAppeal: userAppeals.length > 0 ? userAppeals[0] : undefined,
    };
  }

  /**
   * Get comprehensive appeal statistics
   */
  async getStats(): Promise<AppealStats> {
    const [totalResult] = await this.db.select({ count: count() }).from(appeals);

    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(eq(appeals.status, AppealStatus.PENDING));

    const [approvedResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(eq(appeals.status, AppealStatus.APPROVED));

    const [deniedResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(eq(appeals.status, AppealStatus.DENIED));

    // Calculate success rate
    const totalReviewed = approvedResult.count + deniedResult.count;
    const successRate = totalReviewed > 0 ? (approvedResult.count / totalReviewed) * 100 : 0;

    // Calculate average review time
    const [avgTimeResult] = await this.db
      .select({
        avgHours: sql<number>`AVG(
          (julianday(${appeals.reviewedAt}) - julianday(${appeals.createdAt})) * 24
        )`,
      })
      .from(appeals)
      .where(isNotNull(appeals.reviewedAt));

    // Get appeals by user
    const appealsByUser = await this.db
      .select({
        userId: appeals.userId,
        appealCount: count(),
      })
      .from(appeals)
      .groupBy(appeals.userId)
      .orderBy(desc(count()))
      .limit(10);

    // Get urgent appeals count
    const urgentDate = new Date(
      Date.now() - (MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS - 2) * 24 * 60 * 60 * 1000
    ).toISOString();
    const [urgentResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(and(eq(appeals.status, AppealStatus.PENDING), lte(appeals.createdAt, urgentDate)));

    // Get expired appeals count
    const expiredDate = new Date(
      Date.now() - MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const [expiredResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(and(eq(appeals.status, AppealStatus.PENDING), lte(appeals.createdAt, expiredDate)));

    const recentAppeals = await this.db
      .select()
      .from(appeals)
      .orderBy(desc(appeals.createdAt))
      .limit(10);

    return {
      totalAppeals: totalResult.count,
      pendingAppeals: pendingResult.count,
      approvedAppeals: approvedResult.count,
      deniedAppeals: deniedResult.count,
      successRate: Math.round(successRate * 100) / 100,
      avgReviewTimeHours: Math.round((avgTimeResult.avgHours || 0) * 100) / 100,
      appealsByActionType: {}, // Would be calculated with joins
      appealsByUser: appealsByUser.map(a => ({
        userId: a.userId,
        appealCount: a.appealCount,
      })),
      recentAppeals,
      urgentAppeals: urgentResult.count,
      expiredAppeals: expiredResult.count,
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    pendingCount: number;
    approvedCount: number;
    deniedCount: number;
    avgReviewTimeHours: number;
    urgentCount: number;
  }> {
    const [pendingResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(eq(appeals.status, AppealStatus.PENDING));

    const [approvedResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(eq(appeals.status, AppealStatus.APPROVED));

    const [deniedResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(eq(appeals.status, AppealStatus.DENIED));

    const [avgTimeResult] = await this.db
      .select({
        avgHours: sql<number>`AVG(
          (julianday(${appeals.reviewedAt}) - julianday(${appeals.createdAt})) * 24
        )`,
      })
      .from(appeals)
      .where(isNotNull(appeals.reviewedAt));

    // Get urgent appeals count
    const urgentDate = new Date(
      Date.now() - (MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS - 2) * 24 * 60 * 60 * 1000
    ).toISOString();
    const [urgentResult] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(and(eq(appeals.status, AppealStatus.PENDING), lte(appeals.createdAt, urgentDate)));

    return {
      pendingCount: pendingResult.count,
      approvedCount: approvedResult.count,
      deniedCount: deniedResult.count,
      avgReviewTimeHours: Math.round((avgTimeResult.avgHours || 0) * 100) / 100,
      urgentCount: urgentResult.count,
    };
  }

  /**
   * Check if appeal is within deadline
   */
  isWithinDeadline(appeal: Appeal): boolean {
    const createdDate = new Date(appeal.createdAt);
    const deadlineDate = new Date(
      createdDate.getTime() + MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    );
    return new Date() <= deadlineDate;
  }

  /**
   * Get days until deadline
   */
  getDaysUntilDeadline(appeal: Appeal): number {
    const createdDate = new Date(appeal.createdAt);
    const deadlineDate = new Date(
      createdDate.getTime() + MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    );
    return Math.floor((deadlineDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }

  /**
   * Delete appeal (admin action)
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(appeals).where(eq(appeals.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Check if appeal exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(appeals)
      .where(eq(appeals.id, id));

    return result.count > 0;
  }

  /**
   * Validate appeal business rules
   */
  validateAppeal(appealData: CreateAppeal): string[] {
    const errors: string[] = [];

    if (!appealData.message.trim()) {
      errors.push('Appeal message is required');
    }

    if (appealData.message.length > MODERATION_CONSTRAINTS.MAX_APPEAL_MESSAGE_LENGTH) {
      errors.push(
        `Appeal message cannot exceed ${MODERATION_CONSTRAINTS.MAX_APPEAL_MESSAGE_LENGTH} characters`
      );
    }

    return errors;
  }

  /**
   * Get moderation constraints
   */
  getConstraints() {
    return MODERATION_CONSTRAINTS;
  }
}

// Export types and enums for use in other modules
export { Appeal, NewAppeal, CreateAppeal, AppealStatus, MODERATION_CONSTRAINTS };
export type {
  AppealWithDetails,
  AppealSearchFilters,
  AppealListResponse,
  ReviewAppealData,
  AppealStats,
};
