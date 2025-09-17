import { eq, and, desc, asc, count, sql, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import {
  moderationActions,
  type ModerationAction,
  type NewModerationAction,
  type CreateModerationAction,
  ModerationActionType,
  canAppealAction,
  isBanActive,
  MODERATION_CONSTRAINTS,
} from '../../src/db/schema/moderation';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * ModerationAction Model - T044
 *
 * Provides business logic layer for administrative moderation actions.
 * Handles warnings, bans, content removal, appeals, and moderation history.
 */

export interface ModerationActionWithDetails extends ModerationAction {
  targetUser?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
    lastName?: string | null;
    isActive: boolean;
  };
  targetListing?: {
    id: string;
    title: string;
    status: string;
  };
  admin?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
  };
  appealCount: number;
  isActive: boolean;
  isAppealable: boolean;
  daysSinceAction: number;
  daysUntilExpiry?: number;
}

export interface ModerationSearchFilters {
  actionType?: ModerationActionType;
  targetUserId?: number;
  adminId?: number;
  targetListingId?: string;
  createdAfter?: string;
  createdBefore?: string;
  expiresAfter?: string;
  expiresBefore?: string;
  activeOnly?: boolean;
  appealableOnly?: boolean;
  hasAppeals?: boolean;
}

export interface ModerationListResponse {
  actions: ModerationActionWithDetails[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    totalActions: number;
    activeActions: number;
    appealableActions: number;
    actionsByType: Record<ModerationActionType, number>;
  };
}

export interface BanUserData {
  targetUserId: number;
  adminId: number;
  reason: string;
  duration?: number; // Days, null for permanent
  targetListingId?: string;
}

export interface WarnUserData {
  targetUserId: number;
  adminId: number;
  reason: string;
  targetListingId?: string;
}

export interface ModerationStats {
  totalActions: number;
  actionsByType: Record<ModerationActionType, number>;
  actionsByAdmin: Array<{ adminId: number; actionCount: number }>;
  avgActionsPerDay: number;
  activeBans: number;
  appealedActions: number;
  appealSuccessRate: number;
  recentActions: ModerationAction[];
}

export class ModerationActionModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new moderation action
   */
  async create(actionData: CreateModerationAction): Promise<ModerationAction> {
    // Validate expiration for bans
    if (actionData.actionType === ModerationActionType.BAN && actionData.expiresAt) {
      const expiryDate = new Date(actionData.expiresAt);
      const now = new Date();

      if (expiryDate <= now) {
        throw new Error('Ban expiration date must be in the future');
      }
    }

    // Check if user is already banned (prevent duplicate bans)
    if (actionData.actionType === ModerationActionType.BAN) {
      const activeBan = await this.getActiveBan(actionData.targetUserId);
      if (activeBan) {
        throw new Error('User is already banned');
      }
    }

    const [action] = await this.db
      .insert(moderationActions)
      .values({
        targetUserId: actionData.targetUserId,
        targetListingId: actionData.targetListingId || null,
        adminId: actionData.adminId,
        actionType: actionData.actionType,
        reason: actionData.reason,
        expiresAt: actionData.expiresAt || null,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return action;
  }

  /**
   * Find moderation action by ID
   */
  async findById(id: number): Promise<ModerationAction | null> {
    const [action] = await this.db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.id, id))
      .limit(1);

    return action || null;
  }

  /**
   * Get moderation action with full details
   */
  async getWithDetails(id: number): Promise<ModerationActionWithDetails | null> {
    const action = await this.findById(id);
    if (!action) return null;

    // In real implementation, these would be joined queries
    const actionWithDetails: ModerationActionWithDetails = {
      ...action,
      appealCount: 0, // Would be counted from appeals table
      isActive: this.isActionActive(action),
      isAppealable: canAppealAction(action),
      daysSinceAction: Math.floor(
        (Date.now() - new Date(action.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      ),
      daysUntilExpiry: action.expiresAt
        ? Math.floor((new Date(action.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : undefined,
    };

    return actionWithDetails;
  }

  /**
   * Ban a user
   */
  async banUser(banData: BanUserData): Promise<ModerationAction> {
    const expiresAt = banData.duration
      ? new Date(Date.now() + banData.duration * 24 * 60 * 60 * 1000).toISOString()
      : null;

    return await this.create({
      targetUserId: banData.targetUserId,
      targetListingId: banData.targetListingId,
      adminId: banData.adminId,
      actionType: ModerationActionType.BAN,
      reason: banData.reason,
      expiresAt,
    });
  }

  /**
   * Unban a user
   */
  async unbanUser(
    targetUserId: number,
    adminId: number,
    reason: string
  ): Promise<ModerationAction> {
    const activeBan = await this.getActiveBan(targetUserId);
    if (!activeBan) {
      throw new Error('User is not currently banned');
    }

    return await this.create({
      targetUserId,
      adminId,
      actionType: ModerationActionType.UNBAN,
      reason,
    });
  }

  /**
   * Warn a user
   */
  async warnUser(warnData: WarnUserData): Promise<ModerationAction> {
    return await this.create({
      targetUserId: warnData.targetUserId,
      targetListingId: warnData.targetListingId,
      adminId: warnData.adminId,
      actionType: ModerationActionType.WARNING,
      reason: warnData.reason,
    });
  }

  /**
   * Remove content
   */
  async removeContent(
    targetListingId: string,
    adminId: number,
    reason: string,
    targetUserId: number
  ): Promise<ModerationAction> {
    return await this.create({
      targetUserId,
      targetListingId,
      adminId,
      actionType: ModerationActionType.CONTENT_REMOVAL,
      reason,
    });
  }

  /**
   * Get actions for a specific user
   */
  async getUserActions(targetUserId: number, limit = 50): Promise<ModerationAction[]> {
    return await this.db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.targetUserId, targetUserId))
      .orderBy(desc(moderationActions.createdAt))
      .limit(limit);
  }

  /**
   * Get actions by an admin
   */
  async getAdminActions(adminId: number, limit = 100): Promise<ModerationAction[]> {
    return await this.db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.adminId, adminId))
      .orderBy(desc(moderationActions.createdAt))
      .limit(limit);
  }

  /**
   * Get actions for a specific listing
   */
  async getListingActions(targetListingId: string): Promise<ModerationAction[]> {
    return await this.db
      .select()
      .from(moderationActions)
      .where(eq(moderationActions.targetListingId, targetListingId))
      .orderBy(desc(moderationActions.createdAt));
  }

  /**
   * Get active ban for user
   */
  async getActiveBan(targetUserId: number): Promise<ModerationAction | null> {
    const bans = await this.db
      .select()
      .from(moderationActions)
      .where(
        and(
          eq(moderationActions.targetUserId, targetUserId),
          eq(moderationActions.actionType, ModerationActionType.BAN)
        )
      )
      .orderBy(desc(moderationActions.createdAt));

    // Find the most recent active ban
    for (const ban of bans) {
      if (isBanActive(ban)) {
        return ban;
      }
    }

    return null;
  }

  /**
   * Check if user is currently banned
   */
  async isUserBanned(targetUserId: number): Promise<boolean> {
    const activeBan = await this.getActiveBan(targetUserId);
    return activeBan !== null;
  }

  /**
   * Search and filter moderation actions
   */
  async search(
    filters: ModerationSearchFilters = {},
    page = 1,
    limit = 50
  ): Promise<ModerationListResponse> {
    let query = this.db.select().from(moderationActions);
    let countQuery = this.db.select({ count: count() }).from(moderationActions);

    const conditions = [];

    // Action type filter
    if (filters.actionType) {
      conditions.push(eq(moderationActions.actionType, filters.actionType));
    }

    // Target user filter
    if (filters.targetUserId) {
      conditions.push(eq(moderationActions.targetUserId, filters.targetUserId));
    }

    // Admin filter
    if (filters.adminId) {
      conditions.push(eq(moderationActions.adminId, filters.adminId));
    }

    // Target listing filter
    if (filters.targetListingId) {
      conditions.push(eq(moderationActions.targetListingId, filters.targetListingId));
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(moderationActions.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(moderationActions.createdAt, filters.createdBefore));
    }
    if (filters.expiresAfter) {
      conditions.push(gte(moderationActions.expiresAt, filters.expiresAfter));
    }
    if (filters.expiresBefore) {
      conditions.push(lte(moderationActions.expiresAt, filters.expiresBefore));
    }

    // Active only filter (for bans)
    if (filters.activeOnly) {
      conditions.push(
        and(
          eq(moderationActions.actionType, ModerationActionType.BAN),
          sql`(
            ${moderationActions.expiresAt} IS NULL OR
            ${moderationActions.expiresAt} > datetime('now')
          )`
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

    // Get stats
    const stats = await this.getQuickStats();

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(desc(moderationActions.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const actionList = hasMore ? results.slice(0, limit) : results;

    // Enhance with details
    const actionsWithDetails: ModerationActionWithDetails[] = actionList.map(action => ({
      ...action,
      appealCount: 0,
      isActive: this.isActionActive(action),
      isAppealable: canAppealAction(action),
      daysSinceAction: Math.floor(
        (Date.now() - new Date(action.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      ),
      daysUntilExpiry: action.expiresAt
        ? Math.floor((new Date(action.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : undefined,
    }));

    return {
      actions: actionsWithDetails,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Get recent moderation actions
   */
  async getRecent(limit = 20): Promise<ModerationAction[]> {
    return await this.db
      .select()
      .from(moderationActions)
      .orderBy(desc(moderationActions.createdAt))
      .limit(limit);
  }

  /**
   * Get expiring bans
   */
  async getExpiringBans(days = 7, limit = 50): Promise<ModerationAction[]> {
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    return await this.db
      .select()
      .from(moderationActions)
      .where(
        and(
          eq(moderationActions.actionType, ModerationActionType.BAN),
          isNotNull(moderationActions.expiresAt),
          lte(moderationActions.expiresAt, futureDate),
          gte(moderationActions.expiresAt, new Date().toISOString())
        )
      )
      .orderBy(asc(moderationActions.expiresAt))
      .limit(limit);
  }

  /**
   * Get expired bans that should be auto-lifted
   */
  async getExpiredBans(): Promise<ModerationAction[]> {
    const now = new Date().toISOString();

    return await this.db
      .select()
      .from(moderationActions)
      .where(
        and(
          eq(moderationActions.actionType, ModerationActionType.BAN),
          isNotNull(moderationActions.expiresAt),
          lte(moderationActions.expiresAt, now)
        )
      )
      .orderBy(asc(moderationActions.expiresAt));
  }

  /**
   * Get comprehensive moderation statistics
   */
  async getStats(): Promise<ModerationStats> {
    const [totalResult] = await this.db.select({ count: count() }).from(moderationActions);

    // Actions by type
    const actionTypeStats = await this.db
      .select({
        actionType: moderationActions.actionType,
        count: count(),
      })
      .from(moderationActions)
      .groupBy(moderationActions.actionType);

    const actionsByType = Object.values(ModerationActionType).reduce(
      (acc, type) => {
        acc[type] = actionTypeStats.find(stat => stat.actionType === type)?.count || 0;
        return acc;
      },
      {} as Record<ModerationActionType, number>
    );

    // Actions by admin
    const adminStats = await this.db
      .select({
        adminId: moderationActions.adminId,
        actionCount: count(),
      })
      .from(moderationActions)
      .groupBy(moderationActions.adminId)
      .orderBy(desc(count()))
      .limit(10);

    // Calculate average actions per day
    const [firstActionResult] = await this.db
      .select({ createdAt: moderationActions.createdAt })
      .from(moderationActions)
      .orderBy(asc(moderationActions.createdAt))
      .limit(1);

    let avgActionsPerDay = 0;
    if (firstActionResult) {
      const daysSinceFirst = Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(firstActionResult.createdAt).getTime()) / (24 * 60 * 60 * 1000)
        )
      );
      avgActionsPerDay = Math.round((totalResult.count / daysSinceFirst) * 100) / 100;
    }

    // Active bans count
    const [activeBansResult] = await this.db
      .select({ count: count() })
      .from(moderationActions)
      .where(
        and(
          eq(moderationActions.actionType, ModerationActionType.BAN),
          sql`(
          ${moderationActions.expiresAt} IS NULL OR
          ${moderationActions.expiresAt} > datetime('now')
        )`
        )
      );

    const recentActions = await this.getRecent(10);

    return {
      totalActions: totalResult.count,
      actionsByType,
      actionsByAdmin: adminStats.map(stat => ({
        adminId: stat.adminId,
        actionCount: stat.actionCount,
      })),
      avgActionsPerDay,
      activeBans: activeBansResult.count,
      appealedActions: 0, // Would be calculated from appeals
      appealSuccessRate: 0, // Would be calculated from appeals
      recentActions,
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    totalActions: number;
    activeActions: number;
    appealableActions: number;
    actionsByType: Record<ModerationActionType, number>;
  }> {
    const [totalResult] = await this.db.select({ count: count() }).from(moderationActions);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(moderationActions)
      .where(
        and(
          eq(moderationActions.actionType, ModerationActionType.BAN),
          sql`(
          ${moderationActions.expiresAt} IS NULL OR
          ${moderationActions.expiresAt} > datetime('now')
        )`
        )
      );

    // Actions created within appeal deadline
    const appealDeadline = new Date(
      Date.now() - MODERATION_CONSTRAINTS.APPEAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const [appealableResult] = await this.db
      .select({ count: count() })
      .from(moderationActions)
      .where(gte(moderationActions.createdAt, appealDeadline));

    // Actions by type
    const actionTypeStats = await this.db
      .select({
        actionType: moderationActions.actionType,
        count: count(),
      })
      .from(moderationActions)
      .groupBy(moderationActions.actionType);

    const actionsByType = Object.values(ModerationActionType).reduce(
      (acc, type) => {
        acc[type] = actionTypeStats.find(stat => stat.actionType === type)?.count || 0;
        return acc;
      },
      {} as Record<ModerationActionType, number>
    );

    return {
      totalActions: totalResult.count,
      activeActions: activeResult.count,
      appealableActions: appealableResult.count,
      actionsByType,
    };
  }

  /**
   * Get user's moderation history summary
   */
  async getUserHistory(targetUserId: number): Promise<{
    totalActions: number;
    warnings: number;
    bans: number;
    contentRemovals: number;
    currentlyBanned: boolean;
    lastAction?: ModerationAction;
  }> {
    const actions = await this.getUserActions(targetUserId);

    const warnings = actions.filter(a => a.actionType === ModerationActionType.WARNING).length;
    const bans = actions.filter(a => a.actionType === ModerationActionType.BAN).length;
    const contentRemovals = actions.filter(
      a => a.actionType === ModerationActionType.CONTENT_REMOVAL
    ).length;

    const currentlyBanned = await this.isUserBanned(targetUserId);
    const lastAction = actions.length > 0 ? actions[0] : undefined;

    return {
      totalActions: actions.length,
      warnings,
      bans,
      contentRemovals,
      currentlyBanned,
      lastAction,
    };
  }

  /**
   * Check if action is currently active
   */
  isActionActive(action: ModerationAction): boolean {
    if (action.actionType === ModerationActionType.BAN) {
      return isBanActive(action);
    }

    // Other action types are considered "instantaneous" and not "active"
    return false;
  }

  /**
   * Check if action can be appealed
   */
  canAppeal(action: ModerationAction): boolean {
    return canAppealAction(action);
  }

  /**
   * Delete moderation action (admin only)
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(moderationActions).where(eq(moderationActions.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Check if action exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(moderationActions)
      .where(eq(moderationActions.id, id));

    return result.count > 0;
  }

  /**
   * Get escalation path for repeat offenders
   */
  getEscalationPath(violationCount: number): {
    actionType: ModerationActionType;
    duration?: number;
  } {
    if (violationCount <= 1) {
      return { actionType: ModerationActionType.WARNING };
    } else if (violationCount <= 3) {
      return { actionType: ModerationActionType.BAN, duration: 1 }; // 1 day
    } else if (violationCount <= 5) {
      return { actionType: ModerationActionType.BAN, duration: 7 }; // 1 week
    } else if (violationCount <= 10) {
      return { actionType: ModerationActionType.BAN, duration: 30 }; // 1 month
    } else {
      return { actionType: ModerationActionType.BAN }; // Permanent
    }
  }

  /**
   * Validate action business rules
   */
  validateAction(actionData: CreateModerationAction): string[] {
    const errors: string[] = [];

    if (!actionData.reason.trim()) {
      errors.push('Reason is required');
    }

    if (actionData.reason.length > 1000) {
      errors.push('Reason cannot exceed 1000 characters');
    }

    if (actionData.actionType === ModerationActionType.BAN && actionData.expiresAt) {
      const expiryDate = new Date(actionData.expiresAt);
      const now = new Date();

      if (expiryDate <= now) {
        errors.push('Ban expiration date must be in the future');
      }

      // Max ban duration of 1 year
      const maxExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      if (expiryDate > maxExpiry) {
        errors.push('Ban duration cannot exceed 1 year');
      }
    }

    if (
      actionData.actionType === ModerationActionType.CONTENT_REMOVAL &&
      !actionData.targetListingId
    ) {
      errors.push('Target listing is required for content removal actions');
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
export {
  ModerationAction,
  NewModerationAction,
  CreateModerationAction,
  ModerationActionType,
  canAppealAction,
  isBanActive,
  MODERATION_CONSTRAINTS,
};
export type {
  ModerationActionWithDetails,
  ModerationSearchFilters,
  ModerationListResponse,
  BanUserData,
  WarnUserData,
  ModerationStats,
};
