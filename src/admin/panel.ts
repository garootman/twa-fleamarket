import type { Database } from '../db';
import type { KVStorage } from '../kv';
import type { User } from '../db/schema/users';
import type { Listing } from '../db/schema/listings';
import type {
  Flag,
  ModerationAction,
  Appeal,
  CreateModerationAction,
  CreateAppeal,
} from '../db/schema/moderation';
import { ModerationActionType } from '../db/schema/moderation';
import { ListingStatus } from '../db/schema/listings';

export interface AdminStats {
  users: {
    total: number;
    active: number;
    banned: number;
    newToday: number;
  };
  listings: {
    total: number;
    active: number;
    expired: number;
    hidden: number;
    newToday: number;
  };
  moderation: {
    pendingFlags: number;
    pendingAppeals: number;
    actionsToday: number;
  };
  system: {
    cacheHitRate: number;
    storageUsed: string;
    avgResponseTime: number;
  };
}

export interface AdminListingView extends Omit<Listing, 'adminNotes'> {
  user?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
    isBanned: boolean;
  };
  flagCount: number;
  adminNotes?: string | null | undefined;
  moderationActions?: ModerationAction[];
  canHide: boolean;
  canRestore: boolean;
  canStick: boolean;
}

export interface AdminUserView extends User {
  listingCount: number;
  flagCount: number;
  moderationActions: ModerationAction[];
  canBan: boolean;
  canUnban: boolean;
  recentActivity?: string | undefined;
}

export class AdminPanel {
  private db: Database;
  private kv: KVStorage;
  private adminId?: string | undefined;

  constructor(db: Database, kv: KVStorage, adminId?: string) {
    this.db = db;
    this.kv = kv;
    this.adminId = adminId;
  }

  /**
   * Check if user has admin permissions
   */
  isAdmin(userId: number): boolean {
    if (!this.adminId) return false;
    return userId.toString() === this.adminId;
  }

  /**
   * Require admin permissions
   */
  private requireAdmin(userId: number): void {
    if (!this.isAdmin(userId)) {
      throw new Error('Admin privileges required');
    }
  }

  /**
   * Get comprehensive admin dashboard statistics
   */
  async getDashboardStats(adminId: number): Promise<AdminStats> {
    this.requireAdmin(adminId);

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // In a real implementation, these would be actual database queries
    // For now, returning placeholder data since we haven't implemented the database service methods yet

    return {
      users: {
        total: 0, // await this.db.getUserCount()
        active: 0, // await this.db.getActiveUserCount()
        banned: 0, // await this.db.getBannedUserCount()
        newToday: 0, // await this.db.getUsersCreatedSince(todayStart)
      },
      listings: {
        total: 0, // await this.db.getListingCount()
        active: 0, // await this.db.getActiveListingCount()
        expired: 0, // await this.db.getExpiredListingCount()
        hidden: 0, // await this.db.getHiddenListingCount()
        newToday: 0, // await this.db.getListingsCreatedSince(todayStart)
      },
      moderation: {
        pendingFlags: 0, // await this.db.getPendingFlagCount()
        pendingAppeals: 0, // await this.db.getPendingAppealCount()
        actionsToday: 0, // await this.db.getModerationActionsCount(todayStart)
      },
      system: {
        cacheHitRate: 0.95, // Would calculate from KV stats
        storageUsed: '2.4 GB', // Would get from R2 stats
        avgResponseTime: 150, // Would calculate from metrics
      },
    };
  }

  /**
   * Get all listings for admin review (including hidden ones)
   */
  async getAllListings(
    adminId: number,
    options: {
      status?: 'all' | 'active' | 'flagged' | 'hidden';
      userId?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AdminListingView[]> {
    this.requireAdmin(adminId);

    const { status = 'all', userId, limit = 50, offset = 0 } = options;

    // In a real implementation, this would be a complex query joining multiple tables
    // For now, returning empty array as placeholder

    return [];
  }

  /**
   * Hide/unhide listing with admin notes
   */
  async moderateListing(
    adminId: number,
    listingId: string,
    action: 'hide' | 'restore' | 'delete',
    reason: string,
    adminNotes?: string
  ): Promise<boolean> {
    this.requireAdmin(adminId);

    try {
      // Get the listing first
      // const listing = await this.db.getListingById(listingId);
      // if (!listing) return false;

      const moderationAction: Omit<CreateModerationAction, 'adminId'> = {
        targetListingId: listingId,
        targetUserId: 0, // Would get from listing.userId
        actionType:
          action === 'hide'
            ? ModerationActionType.CONTENT_REMOVAL
            : action === 'restore'
              ? ModerationActionType.UNBAN
              : ModerationActionType.CONTENT_REMOVAL,
        reason,
      };

      // Create moderation action record
      // await this.db.createModerationAction({ ...moderationAction, adminId });

      // Update listing status
      if (action === 'hide') {
        // await this.db.updateListingStatus(listingId, ListingStatus.HIDDEN);
      } else if (action === 'restore') {
        // await this.db.updateListingStatus(listingId, ListingStatus.ACTIVE);
      } else if (action === 'delete') {
        // await this.db.updateListingStatus(listingId, ListingStatus.ARCHIVED);
      }

      // Add admin notes if provided
      if (adminNotes) {
        // await this.db.updateListingAdminNotes(listingId, adminNotes);
      }

      // Invalidate relevant caches
      // await this.kv.cache.onListingChange(listing);

      return true;
    } catch (error) {
      console.error('Error moderating listing:', error);
      return false;
    }
  }

  /**
   * Manually stick listing with custom duration
   */
  async stickListing(
    adminId: number,
    listingId: string,
    durationDays: number = 7
  ): Promise<boolean> {
    this.requireAdmin(adminId);

    try {
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

      // Create admin sticky feature
      // await this.db.createPremiumFeature({
      //   userId: 0, // Admin-granted, not paid by user
      //   listingId,
      //   featureType: 'sticky_listing',
      //   starsPaid: 0, // Admin manual stick
      //   expiresAt: expiresAt.toISOString(),
      // });

      return true;
    } catch (error) {
      console.error('Error sticking listing:', error);
      return false;
    }
  }

  /**
   * Get all users for admin management
   */
  async getAllUsers(
    adminId: number,
    options: {
      status?: 'all' | 'active' | 'banned' | 'warned';
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AdminUserView[]> {
    this.requireAdmin(adminId);

    // Implementation placeholder
    return [];
  }

  /**
   * Ban/unban user with reason
   */
  async moderateUser(
    adminId: number,
    targetUserId: number,
    action: 'ban' | 'unban' | 'warn',
    reason: string,
    durationDays?: number
  ): Promise<boolean> {
    this.requireAdmin(adminId);

    try {
      const actionType =
        action === 'ban'
          ? ModerationActionType.BAN
          : action === 'unban'
            ? ModerationActionType.UNBAN
            : ModerationActionType.WARNING;

      const expiresAt = durationDays
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const moderationAction: Omit<CreateModerationAction, 'adminId'> = {
        targetUserId,
        actionType,
        reason,
        expiresAt,
      };

      // Create moderation action
      // await this.db.createModerationAction({ ...moderationAction, adminId });

      // Update user status
      if (action === 'ban') {
        // await this.db.banUser(targetUserId, reason, expiresAt);
      } else if (action === 'unban') {
        // await this.db.unbanUser(targetUserId);
      } else if (action === 'warn') {
        // await this.db.warnUser(targetUserId);
      }

      // Send notification to user via bot
      await this.notifyUser(targetUserId, action, reason, durationDays);

      // Invalidate user cache
      await this.kv.cache.onUserChange(targetUserId);

      return true;
    } catch (error) {
      console.error('Error moderating user:', error);
      return false;
    }
  }

  /**
   * Get pending flags for review
   */
  async getPendingFlags(
    adminId: number,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Flag[]> {
    this.requireAdmin(adminId);

    // Implementation placeholder
    return [];
  }

  /**
   * Review flag (uphold or dismiss)
   */
  async reviewFlag(
    adminId: number,
    flagId: number,
    decision: 'upheld' | 'dismissed',
    adminNotes?: string
  ): Promise<boolean> {
    this.requireAdmin(adminId);

    try {
      // Update flag status
      // await this.db.updateFlagStatus(flagId, decision, adminId);

      if (decision === 'upheld') {
        // Take action on the flagged listing
        // const flag = await this.db.getFlagById(flagId);
        // await this.moderateListing(adminId, flag.listingId, 'hide', 'Content flagged by user', adminNotes);
      }

      return true;
    } catch (error) {
      console.error('Error reviewing flag:', error);
      return false;
    }
  }

  /**
   * Get pending appeals for review
   */
  async getPendingAppeals(
    adminId: number,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Appeal[]> {
    this.requireAdmin(adminId);

    // Implementation placeholder
    return [];
  }

  /**
   * Review appeal (approve or deny)
   */
  async reviewAppeal(
    adminId: number,
    appealId: number,
    decision: 'approved' | 'denied',
    adminResponse?: string
  ): Promise<boolean> {
    this.requireAdmin(adminId);

    try {
      // Update appeal status
      // await this.db.updateAppealStatus(appealId, decision, adminId, adminResponse);

      if (decision === 'approved') {
        // Reverse the original moderation action
        // const appeal = await this.db.getAppealById(appealId);
        // const originalAction = await this.db.getModerationActionById(appeal.moderationActionId);
        // if (originalAction.actionType === 'ban') {
        //   await this.moderateUser(adminId, originalAction.targetUserId, 'unban', 'Appeal approved');
        // }
      }

      // Notify user of decision
      // await this.notifyUserAppealDecision(appeal.userId, decision, adminResponse);

      return true;
    } catch (error) {
      console.error('Error reviewing appeal:', error);
      return false;
    }
  }

  /**
   * Send notification to user via Telegram bot
   */
  private async notifyUser(
    userId: number,
    action: string,
    reason: string,
    durationDays?: number
  ): Promise<void> {
    try {
      // This would integrate with the bot service to send messages
      console.log(
        `Notify user ${userId}: ${action} - ${reason}${durationDays ? ` (${durationDays} days)` : ''}`
      );
    } catch (error) {
      console.error('Error notifying user:', error);
    }
  }

  /**
   * Export data for compliance/backup
   */
  async exportData(
    adminId: number,
    type: 'users' | 'listings' | 'moderation',
    format: 'json' | 'csv' = 'json'
  ): Promise<{ data: any; filename: string }> {
    this.requireAdmin(adminId);

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${type}_export_${timestamp}.${format}`;

    // Implementation would export actual data
    const data = { placeholder: true };

    return { data, filename };
  }

  /**
   * Get system health and metrics
   */
  async getSystemHealth(adminId: number): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    checks: Array<{
      name: string;
      status: 'ok' | 'warning' | 'error';
      message: string;
      responseTime?: number;
    }>;
  }> {
    this.requireAdmin(adminId);

    try {
      // Run health checks
      const [dbHealth, kvHealth] = await Promise.all([
        this.db.healthCheck(),
        this.kv.healthCheck(),
      ]);

      const checks = [
        {
          name: 'Database',
          status: dbHealth.status === 'ok' ? ('ok' as const) : ('error' as const),
          message: dbHealth.message,
        },
        {
          name: 'KV Storage',
          status: kvHealth.status === 'ok' ? ('ok' as const) : ('error' as const),
          message: kvHealth.message,
        },
      ];

      const errorCount = checks.filter(check => check.status === 'error').length;
      // Note: Currently no 'warning' status in our check results, but keeping for future use
      const warningCount = 0; // checks.filter(check => check.status === 'warning').length;

      let status: 'healthy' | 'degraded' | 'critical';
      if (errorCount > 0) {
        status = errorCount >= checks.length / 2 ? 'critical' : 'degraded';
      } else if (warningCount > 0) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      return { status, checks };
    } catch (error) {
      console.error('Error checking system health:', error);
      return {
        status: 'critical',
        checks: [
          {
            name: 'System',
            status: 'error',
            message: 'Health check failed',
          },
        ],
      };
    }
  }
}
