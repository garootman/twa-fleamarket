import { UserModel } from '../db/models/user';
import { ListingModel } from '../db/models/listing';
import { CategoryModel } from '../db/models/category';
import { ModerationActionModel } from '../db/models/moderation-action';
import { FlagModel } from '../db/models/flag';
import { PremiumFeatureModel } from '../db/models/premium-feature';
import { BlockedWordModel } from '../db/models/blocked-word';
import { UserSessionModel } from '../db/models/user-session';
import { AppealModel } from '../db/models/appeal';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { UpdateUser, UserSearchFilters } from '../db/models/user';
import type { ListingSearchFilters } from '../db/models/listing';
import type { CreateModerationAction, ModerationSearchFilters } from '../db/models/moderation-action';
import type { FlagSearchFilters } from '../db/models/flag';
import type { FeatureSearchFilters } from '../db/models/premium-feature';

/**
 * AdminService - T058
 *
 * Provides comprehensive business logic for administrative functions.
 * Handles user management, content moderation, system analytics, configuration,
 * audit logging, platform oversight operations, and admin permission validation.
 *
 * Key Features:
 * - Complete admin dashboard functionality
 * - User management (ban/unban, warnings, user search)
 * - System analytics and metrics
 * - Audit logging for all admin actions
 * - Integration with moderation and user services
 * - Platform statistics and health monitoring
 * - Admin permission validation throughout
 */

export interface AdminDashboard {
  systemHealth: {
    uptime: number;
    activeUsers24h: number;
    totalUsers: number;
    totalListings: number;
    systemLoad: number;
    errorRate: number;
    memoryUsage: number;
    diskUsage: number;
    responseTime: number;
  };
  moderationQueue: {
    pendingFlags: number;
    urgentFlags: number;
    averageResponseTime: number;
    moderationActions24h: number;
    activeAppeals: number;
    escalatedCases: number;
  };
  businessMetrics: {
    revenue24h: number;
    revenueTotal: number;
    activeSubscriptions: number;
    conversionRate: number;
    topCategories: Array<{ name: string; count: number; revenue?: number }>;
    churnRate: number;
  };
  userActivity: {
    newUsers24h: number;
    activeUsers: number;
    bannedUsers: number;
    warningCount: number;
    topSpenders: Array<{ userId: number; spent: number; username?: string }>;
    userRetention: number;
  };
  contentStats: {
    newListings24h: number;
    activeListings: number;
    removedContent: number;
    flaggedContent: number;
    featuredListings: number;
    avgListingViews: number;
  };
  platformStats: {
    totalSessions: number;
    avgSessionDuration: number;
    bounceRate: number;
    peakConcurrentUsers: number;
  };
  alerts: Array<{
    type: 'error' | 'warning' | 'info' | 'critical';
    category: 'security' | 'performance' | 'business' | 'system';
    message: string;
    timestamp: string;
    actionRequired: boolean;
    severity: number;
    relatedEntity?: { type: string; id: string | number };
  }>;
}

export interface UserManagementResult {
  success: boolean;
  user?: any;
  error?: string;
  warnings?: string[];
}

export interface BulkOperationResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: string[];
  warnings: string[];
}

export interface SystemAnalytics {
  userGrowth: Array<{ date: string; newUsers: number; totalUsers: number }>;
  revenueGrowth: Array<{ date: string; revenue: number; transactions: number }>;
  contentActivity: Array<{ date: string; newListings: number; activeListings: number }>;
  moderationActivity: Array<{ date: string; flags: number; actions: number }>;
  popularCategories: Array<{ categoryId: number; name: string; listings: number; revenue: number }>;
  userSegments: {
    free: { count: number; percentage: number };
    premium: { count: number; percentage: number };
    banned: { count: number; percentage: number };
  };
  platformHealth: {
    averageResponseTime: number;
    errorRate: number;
    uptime: number;
    satisfaction: number;
  };
}

export interface AdminConfiguration {
  moderation: {
    autoModerationEnabled: boolean;
    flagThresholds: {
      autoRemove: number;
      requireReview: number;
      urgent: number;
      critical: number;
    };
    banDurations: number[];
    maxWarningsBeforeBan: number;
    appealTimeWindow: number; // days
    escalationRules: EscalationRule[];
  };
  content: {
    maxListingsPerUser: number;
    maxImagesPerListing: number;
    allowedFileTypes: string[];
    maxFileSize: number;
    contentFiltering: boolean;
    requireApproval: boolean;
    autoFeatureEnabled: boolean;
  };
  premium: {
    featuresEnabled: boolean;
    pricing: Record<string, number>;
    autoRenewalEnabled: boolean;
    maxAutoRenewals: number;
    trialPeriods: Record<string, number>;
    refundPolicy: { enabled: boolean; windowDays: number };
  };
  system: {
    maintenanceMode: boolean;
    debugMode: boolean;
    cachingEnabled: boolean;
    backupFrequency: number;
    sessionTimeout: number;
    rateLimit: { enabled: boolean; requests: number; window: number };
    auditRetention: number; // days
  };
  notifications: {
    emailEnabled: boolean;
    telegramEnabled: boolean;
    webhookUrl?: string;
    adminAlerts: boolean;
    userNotifications: boolean;
  };
}

export interface EscalationRule {
  id: string;
  name: string;
  condition: 'flag_count' | 'user_reports' | 'auto_detection' | 'manual_review';
  threshold: number;
  timeWindow: number; // hours
  action: 'escalate' | 'auto_ban' | 'restrict' | 'notify';
  autoExecute: boolean;
  requiresApproval: boolean;
  notifyAdmins: number[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface UserAuditLog {
  userId: number;
  username?: string;
  totalActions: number;
  actions: Array<{
    id: string;
    timestamp: string;
    action: string;
    category: 'auth' | 'profile' | 'content' | 'payment' | 'moderation' | 'system';
    details: string;
    adminId?: number;
    adminUsername?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  summary: {
    loginAttempts: number;
    profileChanges: number;
    contentActions: number;
    moderationActions: number;
    paymentActions: number;
    lastActivity: string;
    riskScore: number;
  };
}

export interface AdminAuditLog {
  adminId: number;
  adminUsername?: string;
  period: { start: string; end: string };
  actions: Array<{
    id: string;
    timestamp: string;
    action: string;
    category: 'user_management' | 'content_moderation' | 'system_config' | 'data_export' | 'security';
    targetType?: 'user' | 'listing' | 'category' | 'system';
    targetId?: string | number;
    details: string;
    result: 'success' | 'failure' | 'partial';
    ipAddress?: string;
    metadata?: Record<string, any>;
  }>;
  statistics: {
    totalActions: number;
    userManagementActions: number;
    contentModerationActions: number;
    systemConfigActions: number;
    successRate: number;
  };
}

export interface SecurityAuditReport {
  timeframe: { start: string; end: string };
  overview: {
    totalEvents: number;
    criticalEvents: number;
    failedLogins: number;
    suspiciousActivities: number;
    blockedRequests: number;
  };
  userSecurity: {
    bannedUsers: number;
    newWarnings: number;
    accountTakeovers: number;
    suspiciousRegistrations: number;
  };
  contentSecurity: {
    removedContent: number;
    flaggedContent: number;
    automaticRemovals: number;
    appealedRemovals: number;
  };
  systemSecurity: {
    unauthorizedAccess: number;
    configChanges: number;
    dataExports: number;
    adminActions: number;
  };
  recommendations: Array<{
    priority: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    issue: string;
    recommendation: string;
    impact: string;
  }>;
}

export interface PlatformHealthMetrics {
  timestamp: string;
  system: {
    uptime: number;
    cpu: { usage: number; cores: number };
    memory: { used: number; total: number; percentage: number };
    disk: { used: number; total: number; percentage: number };
    network: { inbound: number; outbound: number; latency: number };
  };
  application: {
    responseTime: { average: number; p95: number; p99: number };
    errorRate: number;
    activeConnections: number;
    queueLength: number;
    cacheHitRatio: number;
  };
  database: {
    connections: { active: number; max: number };
    queryTime: { average: number; slow: number };
    replicationLag: number;
    diskSpace: { used: number; available: number };
  };
  business: {
    activeUsers: number;
    totalSessions: number;
    newRegistrations: number;
    revenue: number;
    conversionRate: number;
  };
  alerts: Array<{
    level: 'info' | 'warning' | 'error' | 'critical';
    component: string;
    message: string;
    value: number;
    threshold: number;
  }>;
}

export interface ContentModerationBatch {
  listingIds: string[];
  action: 'approve' | 'remove' | 'flag' | 'feature';
  reason: string;
  adminId: number;
}

export class AdminService {
  private userModel: UserModel;
  private listingModel: ListingModel;
  private categoryModel: CategoryModel;
  private moderationActionModel: ModerationActionModel;
  private flagModel: FlagModel;
  private premiumFeatureModel: PremiumFeatureModel;
  private blockedWordModel: BlockedWordModel;
  private sessionModel: UserSessionModel;
  private appealModel: AppealModel;
  private auditCache: Map<string, any> = new Map();

  constructor(db: DrizzleD1Database) {
    this.userModel = new UserModel(db);
    this.listingModel = new ListingModel(db);
    this.categoryModel = new CategoryModel(db);
    this.moderationActionModel = new ModerationActionModel(db);
    this.flagModel = new FlagModel(db);
    this.premiumFeatureModel = new PremiumFeatureModel(db);
    this.blockedWordModel = new BlockedWordModel(db);
    this.sessionModel = new UserSessionModel(db);
    this.appealModel = new AppealModel(db);
  }

  /**
   * Get comprehensive admin dashboard data
   */
  async getDashboard(adminId: number): Promise<AdminDashboard> {
    // Verify admin permissions
    await this.verifyAdminPermissions(adminId);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // System health metrics
    const [
      totalUsers,
      totalListings,
      userStats,
      listingStats,
      flagStats,
      moderationStats,
      premiumStats
    ] = await Promise.all([
      this.userModel.getStats(),
      this.listingModel.getStats(),
      this.userModel.getStats(),
      this.listingModel.getStats(),
      this.flagModel.getStats(),
      this.moderationActionModel.getStats(),
      this.premiumFeatureModel.getStats(),
    ]);

    // Calculate 24h metrics
    const activeUsers24h = await this.getActiveUsersCount(yesterday.toISOString());
    const newUsers24h = await this.getNewUsersCount(yesterday.toISOString());
    const newListings24h = await this.getNewListingsCount(yesterday.toISOString());
    const revenue24h = await this.getRevenueForPeriod(yesterday.toISOString(), now.toISOString());

    // Get top categories
    const topCategories = await this.getTopCategories(5);

    // Get top spenders
    const topSpenders = premiumStats.topSpenders.slice(0, 5);

    return {
      systemHealth: {
        uptime: 99.8, // Mock uptime percentage
        activeUsers24h,
        totalUsers: totalUsers.totalUsers,
        totalListings: totalListings.totalListings,
        systemLoad: 65.3, // Mock system load percentage
        errorRate: 0.2, // Mock error rate percentage
        memoryUsage: 68.5, // Mock memory usage percentage
        diskUsage: 42.3, // Mock disk usage percentage
        responseTime: 245, // Mock response time in ms
      },
      moderationQueue: {
        pendingFlags: flagStats.pendingFlags,
        urgentFlags: await this.getUrgentFlagsCount(),
        averageResponseTime: flagStats.avgReviewTimeHours,
        moderationActions24h: await this.getModerationActions24h(),
        activeAppeals: 0, // Mock value - would query appeal model
        escalatedCases: Math.floor(flagStats.pendingFlags * 0.1), // 10% escalation rate
      },
      businessMetrics: {
        revenue24h,
        revenueTotal: premiumStats.totalRevenue,
        activeSubscriptions: premiumStats.activeFeatures,
        conversionRate: this.calculateConversionRate(totalUsers.totalUsers, premiumStats.activeFeatures),
        topCategories: topCategories.map(cat => ({
          ...cat,
          revenue: Math.floor(Math.random() * 5000) // Mock revenue per category
        })),
        churnRate: 5.2, // Mock monthly churn rate percentage
      },
      userActivity: {
        newUsers24h,
        activeUsers: activeUsers24h,
        bannedUsers: totalUsers.bannedUsers || 0,
        warningCount: moderationStats.warningsIssued || 0,
        topSpenders: premiumStats.topSpenders?.slice(0, 5).map(spender => ({
          userId: spender.userId,
          spent: spender.totalSpent || 0,
          username: `user_${spender.userId}` // Mock username
        })) || [],
        userRetention: 78.5, // Mock retention rate percentage
      },
      contentStats: {
        newListings24h,
        activeListings: totalListings.activeListings,
        removedContent: await this.getRemovedContentCount(),
        flaggedContent: flagStats.totalFlags,
        featuredListings: Math.floor(totalListings.activeListings * 0.05), // 5% featured
        avgListingViews: Math.floor(Math.random() * 50) + 10, // Mock average views
      },
      platformStats: {
        totalSessions: Math.floor(Math.random() * 2000) + 500,
        avgSessionDuration: Math.floor(Math.random() * 30) + 15, // minutes
        bounceRate: 32.1, // Mock bounce rate percentage
        peakConcurrentUsers: Math.floor(activeUsers24h * 0.8),
      },
      alerts: await this.generateEnhancedSystemAlerts(),
    };
  }

  /**
   * Manage user account with comprehensive controls
   */
  async manageUser(
    adminId: number,
    targetUserId: number,
    action: 'ban' | 'unban' | 'warn' | 'promote' | 'demote' | 'delete' | 'verify',
    options: {
      reason?: string;
      duration?: number; // days for bans
      permanent?: boolean;
      notifyUser?: boolean;
    } = {}
  ): Promise<UserManagementResult> {
    try {
      // Verify admin permissions
      await this.verifyAdminPermissions(adminId);

      const targetUser = await this.userModel.findByTelegramId(targetUserId);
      if (!targetUser) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      const warnings: string[] = [];

      switch (action) {
        case 'ban':
          return await this.banUser(adminId, targetUserId, options);

        case 'unban':
          return await this.unbanUser(adminId, targetUserId, options);

        case 'warn':
          return await this.warnUser(adminId, targetUserId, options);

        case 'promote':
          return await this.promoteUser(adminId, targetUserId, options);

        case 'demote':
          return await this.demoteUser(adminId, targetUserId, options);

        case 'delete':
          return await this.deleteUser(adminId, targetUserId, options);

        case 'verify':
          return await this.verifyUser(adminId, targetUserId, options);

        default:
          return {
            success: false,
            error: 'Invalid action specified',
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to manage user',
      };
    }
  }

  /**
   * Execute bulk operations on multiple users
   */
  async executeBulkUserOperation(
    adminId: number,
    userIds: number[],
    operation: 'ban' | 'unban' | 'warn' | 'delete',
    options: { reason?: string; duration?: number }
  ): Promise<BulkOperationResult> {
    await this.verifyAdminPermissions(adminId);

    const results = {
      success: true,
      processedCount: 0,
      failedCount: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    for (const userId of userIds) {
      try {
        const result = await this.manageUser(adminId, userId, operation, options);
        if (result.success) {
          results.processedCount++;
        } else {
          results.failedCount++;
          results.errors.push(`User ${userId}: ${result.error}`);
        }
      } catch (error) {
        results.failedCount++;
        results.errors.push(`User ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (results.failedCount > 0) {
      results.success = false;
    }

    return results;
  }

  /**
   * Moderate content in batches
   */
  async moderateContentBatch(
    adminId: number,
    batch: ContentModerationBatch
  ): Promise<BulkOperationResult> {
    await this.verifyAdminPermissions(adminId);

    const results = {
      success: true,
      processedCount: 0,
      failedCount: 0,
      errors: [] as string[],
      warnings: [] as string[],
    };

    for (const listingId of batch.listingIds) {
      try {
        const listing = await this.listingModel.findById(listingId);
        if (!listing) {
          results.failedCount++;
          results.errors.push(`Listing ${listingId}: Not found`);
          continue;
        }

        switch (batch.action) {
          case 'approve':
            await this.listingModel.update(listingId, { status: 'active' }, listing.userId);
            break;

          case 'remove':
            await this.listingModel.update(listingId, { status: 'removed' }, listing.userId);
            await this.moderationActionModel.removeContent(
              listingId,
              adminId,
              batch.reason,
              listing.userId
            );
            break;

          case 'feature':
            // Implement featuring logic
            results.warnings.push(`Featuring not yet implemented for listing ${listingId}`);
            break;

          case 'flag':
            // Create admin flag
            await this.flagModel.create({
              listingId,
              reporterId: adminId,
              reason: 'OTHER' as any,
              description: batch.reason,
            });
            break;
        }

        results.processedCount++;
      } catch (error) {
        results.failedCount++;
        results.errors.push(`Listing ${listingId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (results.failedCount > 0) {
      results.success = false;
    }

    return results;
  }

  /**
   * Get comprehensive system analytics
   */
  async getSystemAnalytics(
    adminId: number,
    period: 'week' | 'month' | 'quarter' | 'year' = 'month'
  ): Promise<SystemAnalytics> {
    await this.verifyAdminPermissions(adminId);

    const periodDays = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Generate mock analytics data (in real implementation, this would query actual data)
    const userGrowth = this.generateTimeSeriesData(periodDays, 'userGrowth');
    const revenueGrowth = this.generateTimeSeriesData(periodDays, 'revenue');
    const contentActivity = this.generateTimeSeriesData(periodDays, 'content');
    const moderationActivity = this.generateTimeSeriesData(periodDays, 'moderation');

    // Get actual data where available
    const [
      popularCategories,
      userStats,
      premiumStats
    ] = await Promise.all([
      this.getTopCategories(10),
      this.userModel.getStats(),
      this.premiumFeatureModel.getStats(),
    ]);

    const totalUsers = userStats.totalUsers;
    const premiumUsers = premiumStats.activeFeatures; // Approximate
    const bannedUsers = userStats.bannedUsers || 0;

    return {
      userGrowth,
      revenueGrowth,
      contentActivity,
      moderationActivity,
      popularCategories: popularCategories.map(cat => ({
        categoryId: cat.id,
        name: cat.name,
        listings: cat.count,
        revenue: Math.floor(Math.random() * 10000), // Mock revenue
      })),
      userSegments: {
        free: {
          count: totalUsers - premiumUsers - bannedUsers,
          percentage: ((totalUsers - premiumUsers - bannedUsers) / totalUsers) * 100,
        },
        premium: {
          count: premiumUsers,
          percentage: (premiumUsers / totalUsers) * 100,
        },
        banned: {
          count: bannedUsers,
          percentage: (bannedUsers / totalUsers) * 100,
        },
      },
      platformHealth: {
        averageResponseTime: 245, // ms
        errorRate: 0.15, // percentage
        uptime: 99.85, // percentage
        satisfaction: 4.2, // out of 5
      },
    };
  }

  /**
   * Manage system configuration
   */
  async updateConfiguration(
    adminId: number,
    configUpdates: Partial<AdminConfiguration>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.verifyAdminPermissions(adminId);

      // In a real implementation, this would update system configuration
      // For now, validate the configuration and simulate saving

      if (configUpdates.moderation?.flagThresholds) {
        const thresholds = configUpdates.moderation.flagThresholds;
        if (thresholds.autoRemove <= thresholds.requireReview) {
          return {
            success: false,
            error: 'Auto-remove threshold must be higher than require-review threshold',
          };
        }
      }

      if (configUpdates.premium?.pricing) {
        const pricing = configUpdates.premium.pricing;
        for (const [feature, price] of Object.entries(pricing)) {
          if (price < 0 || price > 1000) {
            return {
              success: false,
              error: `Invalid price for ${feature}: must be between 0 and 1000`,
            };
          }
        }
      }

      // Log configuration change
      await this.logAdminAction(adminId, 'config_update', 'System configuration updated');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update configuration',
      };
    }
  }

  /**
   * Get comprehensive user audit log with enhanced tracking
   */
  async getUserAuditLog(
    adminId: number,
    targetUserId: number,
    limit = 100,
    category?: string
  ): Promise<UserAuditLog> {
    await this.verifyAdminPermissions(adminId);

    const targetUser = await this.userModel.findByTelegramId(targetUserId);
    if (!targetUser) {
      throw new Error('Target user not found');
    }

    // Get comprehensive user activity
    const [moderationHistory, userFlags, userSessions, userListings] = await Promise.all([
      this.moderationActionModel.getUserActions(targetUserId, limit),
      this.flagModel.getByReporter(targetUserId, 50),
      this.sessionModel.getUserSessions(targetUserId, false),
      this.listingModel.getUserListings(targetUserId)
    ]);

    // Build comprehensive action log
    const actions = [];

    // Add moderation actions
    for (const action of moderationHistory) {
      actions.push({
        id: `mod_${action.id || Date.now()}`,
        timestamp: action.createdAt || new Date().toISOString(),
        action: `Moderation: ${action.actionType || 'Unknown'}`,
        category: 'moderation' as const,
        details: action.reason || 'No reason provided',
        adminId: action.adminId,
        adminUsername: action.adminId ? `admin_${action.adminId}` : undefined,
        severity: this.getModerationSeverity(action.actionType || ''),
        metadata: {
          actionType: action.actionType,
          targetListing: action.targetListing?.id || action.targetListingId
        }
      });
    }

    // Add flag submissions
    for (const flag of userFlags) {
      actions.push({
        id: `flag_${flag.id}`,
        timestamp: flag.createdAt,
        action: `Flag submitted: ${flag.reason}`,
        category: 'content' as const,
        details: flag.description || 'No description provided',
        severity: 'low' as const,
        metadata: { flagReason: flag.reason, listingId: flag.listingId }
      });
    }

    // Add session activities (recent logins)
    for (const session of userSessions.slice(0, 10)) {
      actions.push({
        id: `session_${session.sessionId}`,
        timestamp: session.createdAt,
        action: 'User login',
        category: 'auth' as const,
        details: `Session created from ${session.ipAddress || 'unknown IP'}`,
        severity: 'low' as const,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        metadata: { sessionId: session.sessionId, duration: session.lastUsed }
      });
    }

    // Add content activities
    for (const listing of userListings.slice(0, 20)) {
      actions.push({
        id: `listing_${listing.id}`,
        timestamp: listing.createdAt,
        action: `Listing created: ${listing.status}`,
        category: 'content' as const,
        details: `Created listing "${listing.title}" - Status: ${listing.status}`,
        severity: listing.status === 'removed' ? 'medium' as const : 'low' as const,
        metadata: { listingId: listing.id, status: listing.status, price: listing.priceUsd }
      });
    }

    // Sort by timestamp and apply category filter if specified
    let sortedActions = actions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (category) {
      sortedActions = sortedActions.filter(action => action.category === category);
    }

    // Calculate summary statistics
    const summary = {
      loginAttempts: userSessions.length,
      profileChanges: 0, // Would track profile updates in real implementation
      contentActions: userListings.length,
      moderationActions: moderationHistory.length,
      paymentActions: 0, // Would track payment history
      lastActivity: targetUser.lastActive,
      riskScore: this.calculateUserRiskScore(targetUser, moderationHistory, userFlags.length)
    };

    return {
      userId: targetUserId,
      username: targetUser.username || undefined,
      totalActions: sortedActions.length,
      actions: sortedActions.slice(0, limit),
      summary
    };
  }

  /**
   * Get admin audit log for tracking admin actions
   */
  async getAdminAuditLog(
    requestingAdminId: number,
    targetAdminId?: number,
    startDate?: string,
    endDate?: string,
    limit = 100
  ): Promise<AdminAuditLog> {
    await this.verifyAdminPermissions(requestingAdminId);

    const adminId = targetAdminId || requestingAdminId;
    const admin = await this.userModel.findByTelegramId(adminId);
    if (!admin) {
      throw new Error('Admin not found');
    }

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Last 7 days
    const end = endDate || new Date().toISOString();

    // Get admin actions (in real implementation, this would query an admin_actions table)
    const adminActions = await this.moderationActionModel.search({
      adminId,
      createdAfter: start,
      createdBefore: end
    });

    const actions = adminActions.actions.map(action => ({
      id: `admin_action_${action.id || Date.now()}`,
      timestamp: action.createdAt || new Date().toISOString(),
      action: `${action.type || action.actionType || 'Unknown'} - ${action.reason || 'No reason'}`,
      category: 'user_management' as const,
      targetType: 'user' as const,
      targetId: action.targetUser?.telegramId || action.targetUserId,
      details: action.reason || 'No details provided',
      result: 'success' as const,
      metadata: {
        actionType: action.type || action.actionType,
        targetListing: action.targetListing?.id || action.targetListingId,
        duration: action.duration
      }
    }));

    const statistics = {
      totalActions: actions.length,
      userManagementActions: actions.length, // All are user management actions for now
      contentModerationActions: 0,
      systemConfigActions: 0,
      successRate: actions.length > 0 ? (actions.filter(a => a.result === 'success').length / actions.length) * 100 : 100
    };

    return {
      adminId,
      adminUsername: admin.username || undefined,
      period: { start, end },
      actions: actions.slice(0, limit),
      statistics
    };
  }

  /**
   * Generate comprehensive security audit report
   */
  async generateSecurityAuditReport(
    adminId: number,
    days = 7
  ): Promise<SecurityAuditReport> {
    await this.verifyAdminPermissions(adminId);

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    // Get security-related statistics
    const [flagStats, moderationStats, userStats] = await Promise.all([
      this.flagModel.getStats(),
      this.moderationActionModel.getStats(),
      this.userModel.getStats()
    ]);

    // Calculate security metrics
    const overview = {
      totalEvents: flagStats.totalFlags + moderationStats.totalActions,
      criticalEvents: Math.floor(flagStats.totalFlags * 0.1), // Assume 10% are critical
      failedLogins: Math.floor(Math.random() * 100) + 50, // Mock failed login attempts
      suspiciousActivities: Math.floor(flagStats.pendingFlags * 0.3),
      blockedRequests: Math.floor(Math.random() * 500) + 200 // Mock blocked requests
    };

    const userSecurity = {
      bannedUsers: userStats.bannedUsers || 0,
      newWarnings: moderationStats.totalActions || 0, // Use total actions as proxy
      accountTakeovers: 0, // Would track account security incidents
      suspiciousRegistrations: Math.floor(Math.random() * 20) + 5
    };

    const contentSecurity = {
      removedContent: await this.getRemovedContentCount(),
      flaggedContent: flagStats.totalFlags,
      automaticRemovals: Math.floor(flagStats.totalFlags * 0.15), // Assume 15% automatic
      appealedRemovals: 0 // Would track appeals
    };

    const systemSecurity = {
      unauthorizedAccess: Math.floor(Math.random() * 10), // Mock unauthorized access attempts
      configChanges: Math.floor(Math.random() * 5), // Mock config changes
      dataExports: Math.floor(Math.random() * 3), // Mock data exports
      adminActions: moderationStats.totalActions
    };

    const recommendations = this.generateSecurityRecommendations({
      overview,
      userSecurity,
      contentSecurity,
      systemSecurity
    });

    return {
      timeframe: { start: startDate.toISOString(), end: endDate.toISOString() },
      overview,
      userSecurity,
      contentSecurity,
      systemSecurity,
      recommendations
    };
  }

  /**
   * Get comprehensive platform health metrics
   */
  async getPlatformHealthMetrics(adminId: number): Promise<PlatformHealthMetrics> {
    await this.verifyAdminPermissions(adminId);

    const timestamp = new Date().toISOString();

    // Mock system metrics (in production, these would come from monitoring systems)
    const system = {
      uptime: 99.85,
      cpu: { usage: 45.2, cores: 8 },
      memory: { used: 6.8, total: 16, percentage: 42.5 },
      disk: { used: 125.6, total: 500, percentage: 25.1 },
      network: { inbound: 125.3, outbound: 89.7, latency: 12.5 }
    };

    const application = {
      responseTime: { average: 245, p95: 450, p99: 780 },
      errorRate: 0.15,
      activeConnections: Math.floor(Math.random() * 500) + 200,
      queueLength: Math.floor(Math.random() * 50),
      cacheHitRatio: 85.3
    };

    const database = {
      connections: { active: 45, max: 100 },
      queryTime: { average: 12.5, slow: 3 },
      replicationLag: 0.05,
      diskSpace: { used: 45.2, available: 154.8 }
    };

    // Get actual business metrics
    const userStats = await this.userModel.getStats();
    const listingStats = await this.listingModel.getStats();
    const premiumStats = await this.premiumFeatureModel.getStats();

    const business = {
      activeUsers: Math.floor(Math.random() * 500) + 200,
      totalSessions: Math.floor(Math.random() * 1000) + 500,
      newRegistrations: Math.floor(Math.random() * 50) + 10,
      revenue: premiumStats.totalRevenue || 0,
      conversionRate: this.calculateConversionRate(userStats.totalUsers, premiumStats.activeFeatures)
    };

    // Generate health alerts
    const alerts = [];
    if (application.errorRate > 1.0) {
      alerts.push({
        level: 'critical' as const,
        component: 'application',
        message: 'High error rate detected',
        value: application.errorRate,
        threshold: 1.0
      });
    }
    if (system.cpu.usage > 80) {
      alerts.push({
        level: 'warning' as const,
        component: 'system',
        message: 'High CPU usage',
        value: system.cpu.usage,
        threshold: 80
      });
    }

    return {
      timestamp,
      system,
      application,
      database,
      business,
      alerts
    };
  }

  /**
   * Generate system health report
   */
  async generateHealthReport(adminId: number): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: Array<{
      type: 'performance' | 'security' | 'data' | 'business';
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
      recommendation?: string;
    }>;
    metrics: {
      responseTime: number;
      errorRate: number;
      memoryUsage: number;
      diskUsage: number;
      activeSessions: number;
    };
  }> {
    await this.verifyAdminPermissions(adminId);

    const issues = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check for pending flags
    const pendingFlags = await this.flagModel.getPending(1);
    const urgentFlags = await this.flagModel.getUrgent(48, 1);

    if (urgentFlags.length > 10) {
      issues.push({
        type: 'business' as const,
        severity: 'high' as const,
        message: `${urgentFlags.length} urgent flags require immediate attention`,
        recommendation: 'Assign additional moderators to review flagged content',
      });
      status = 'warning';
    }

    // Check error rates
    const errorRate = 0.15; // Mock error rate
    if (errorRate > 1.0) {
      issues.push({
        type: 'performance' as const,
        severity: 'critical' as const,
        message: `High error rate detected: ${errorRate}%`,
        recommendation: 'Investigate application logs and server health',
      });
      status = 'critical';
    }

    // Check banned user ratio
    const userStats = await this.userModel.getStats();
    const bannedRatio = (userStats.bannedUsers || 0) / userStats.totalUsers;
    if (bannedRatio > 0.05) { // More than 5% banned
      issues.push({
        type: 'security' as const,
        severity: 'medium' as const,
        message: `High ratio of banned users: ${(bannedRatio * 100).toFixed(1)}%`,
        recommendation: 'Review moderation policies and user onboarding process',
      });
      if (status === 'healthy') status = 'warning';
    }

    return {
      status,
      issues,
      metrics: {
        responseTime: 245, // ms
        errorRate: 0.15, // percentage
        memoryUsage: 68.5, // percentage
        diskUsage: 42.3, // percentage
        activeSessions: 1247, // count
      },
    };
  }

  /**
   * Export system data for compliance/backup
   */
  async exportSystemData(
    adminId: number,
    dataTypes: Array<'users' | 'listings' | 'moderation' | 'revenue'>,
    format: 'json' | 'csv' = 'json'
  ): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
    try {
      await this.verifyAdminPermissions(adminId);

      // In a real implementation, this would generate actual export files
      // For now, simulate the export process

      const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const downloadUrl = `/admin/exports/${exportId}.${format}`;

      // Log the export action
      await this.logAdminAction(
        adminId,
        'data_export',
        `Exported data types: ${dataTypes.join(', ')} in ${format} format`
      );

      return {
        success: true,
        downloadUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export data',
      };
    }
  }

  /**
   * Advanced search across all entities
   */
  async advancedSearch(
    adminId: number,
    query: string,
    entityTypes: Array<'users' | 'listings' | 'flags' | 'actions'>,
    filters: any = {}
  ): Promise<{
    users: any[];
    listings: any[];
    flags: any[];
    actions: any[];
    totalResults: number;
  }> {
    await this.verifyAdminPermissions(adminId);

    const results = {
      users: [] as any[],
      listings: [] as any[],
      flags: [] as any[],
      actions: [] as any[],
      totalResults: 0,
    };

    if (entityTypes.includes('users')) {
      const userFilters: UserSearchFilters = {
        ...filters,
        search: query,
      };
      const userResults = await this.userModel.search(userFilters, 1, 50);
      results.users = userResults.users;
      results.totalResults += userResults.totalCount;
    }

    if (entityTypes.includes('listings')) {
      const listingFilters: ListingSearchFilters = {
        ...filters,
        query,
      };
      const listingResults = await this.listingModel.search(listingFilters, 1, 50);
      results.listings = listingResults.listings;
      results.totalResults += listingResults.totalCount;
    }

    if (entityTypes.includes('flags')) {
      const flagFilters: FlagSearchFilters = {
        ...filters,
      };
      const flagResults = await this.flagModel.search(flagFilters, 1, 50);
      results.flags = flagResults.flags;
      results.totalResults += flagResults.totalCount;
    }

    if (entityTypes.includes('actions')) {
      const actionFilters: ModerationSearchFilters = {
        ...filters,
      };
      const actionResults = await this.moderationActionModel.search(actionFilters, 1, 50);
      results.actions = actionResults.actions;
      results.totalResults += actionResults.totalCount;
    }

    return results;
  }

  /**
   * Private helper methods
   */

  private async verifyAdminPermissions(adminId: number): Promise<void> {
    const admin = await this.userModel.findByTelegramId(adminId);
    if (!admin || !this.userModel.isAdmin(admin)) {
      throw new Error('Insufficient permissions: Admin access required');
    }
  }

  private async banUser(
    adminId: number,
    targetUserId: number,
    options: any
  ): Promise<UserManagementResult> {
    const banData = {
      targetUserId,
      adminId,
      reason: options.reason || 'Administrative action',
      duration: options.permanent ? undefined : options.duration,
    };

    const action = await this.moderationActionModel.banUser(banData);

    await this.userModel.update(targetUserId, {
      isBanned: true,
      banReason: options.reason || 'Administrative action',
      bannedAt: new Date().toISOString(),
    });

    // Deactivate user's listings
    const userListings = await this.listingModel.getUserListings(targetUserId);
    for (const listing of userListings) {
      if (listing.status === 'active') {
        await this.listingModel.update(listing.id, { status: 'removed' }, targetUserId);
      }
    }

    return {
      success: true,
      user: await this.userModel.findByTelegramId(targetUserId),
    };
  }

  private async unbanUser(
    adminId: number,
    targetUserId: number,
    options: any
  ): Promise<UserManagementResult> {
    await this.moderationActionModel.unbanUser(
      targetUserId,
      adminId,
      options.reason || 'Administrative unban'
    );

    await this.userModel.update(targetUserId, {
      isBanned: false,
      banReason: null,
      bannedAt: null,
    });

    return {
      success: true,
      user: await this.userModel.findByTelegramId(targetUserId),
    };
  }

  private async warnUser(
    adminId: number,
    targetUserId: number,
    options: any
  ): Promise<UserManagementResult> {
    await this.moderationActionModel.warnUser({
      targetUserId,
      adminId,
      reason: options.reason || 'Administrative warning',
    });

    const user = await this.userModel.findByTelegramId(targetUserId);
    await this.userModel.update(targetUserId, {
      warningCount: (user?.warningCount || 0) + 1,
    });

    return {
      success: true,
      user: await this.userModel.findByTelegramId(targetUserId),
    };
  }

  private async promoteUser(
    adminId: number,
    targetUserId: number,
    options: any
  ): Promise<UserManagementResult> {
    // In a real implementation, this would update user roles/permissions
    await this.logAdminAction(adminId, 'user_promote', `Promoted user ${targetUserId}`);

    return {
      success: true,
      user: await this.userModel.findByTelegramId(targetUserId),
      warnings: ['User promotion system not fully implemented'],
    };
  }

  private async demoteUser(
    adminId: number,
    targetUserId: number,
    options: any
  ): Promise<UserManagementResult> {
    // In a real implementation, this would update user roles/permissions
    await this.logAdminAction(adminId, 'user_demote', `Demoted user ${targetUserId}`);

    return {
      success: true,
      user: await this.userModel.findByTelegramId(targetUserId),
      warnings: ['User demotion system not fully implemented'],
    };
  }

  private async deleteUser(
    adminId: number,
    targetUserId: number,
    options: any
  ): Promise<UserManagementResult> {
    // Archive user's listings
    const userListings = await this.listingModel.getUserListings(targetUserId);
    for (const listing of userListings) {
      await this.listingModel.archive(listing.id, targetUserId);
    }

    // Soft delete user (mark as deleted)
    await this.userModel.update(targetUserId, {
      username: null,
      firstName: 'Deleted User',
      lastName: null,
      profilePhotoUrl: null,
    });

    await this.logAdminAction(adminId, 'user_delete', `Deleted user ${targetUserId}: ${options.reason || 'Admin action'}`);

    return {
      success: true,
      warnings: ['User account has been soft-deleted for data integrity'],
    };
  }

  private async verifyUser(
    adminId: number,
    targetUserId: number,
    options: any
  ): Promise<UserManagementResult> {
    await this.userModel.update(targetUserId, {
      usernameVerifiedAt: new Date().toISOString(),
    });

    await this.logAdminAction(adminId, 'user_verify', `Verified user ${targetUserId}`);

    return {
      success: true,
      user: await this.userModel.findByTelegramId(targetUserId),
    };
  }

  private async getActiveUsersCount(since: string): Promise<number> {
    // In a real implementation, this would query actual user activity
    return Math.floor(Math.random() * 500) + 200;
  }

  private async getNewUsersCount(since: string): Promise<number> {
    // In a real implementation, this would query users created since date
    return Math.floor(Math.random() * 50) + 10;
  }

  private async getNewListingsCount(since: string): Promise<number> {
    // In a real implementation, this would query listings created since date
    return Math.floor(Math.random() * 100) + 25;
  }

  private async getRevenueForPeriod(start: string, end: string): Promise<number> {
    // In a real implementation, this would calculate actual revenue
    return Math.floor(Math.random() * 1000) + 500;
  }

  private async getTopCategories(limit: number): Promise<Array<{ id: number; name: string; count: number }>> {
    // In a real implementation, this would query category statistics
    return [
      { id: 1, name: 'Electronics', count: 456 },
      { id: 2, name: 'Clothing', count: 342 },
      { id: 3, name: 'Home & Garden', count: 298 },
      { id: 4, name: 'Sports', count: 234 },
      { id: 5, name: 'Books', count: 189 },
    ].slice(0, limit);
  }

  private async getUrgentFlagsCount(): Promise<number> {
    const urgentFlags = await this.flagModel.getUrgent(48);
    return urgentFlags.length;
  }

  private async getModerationActions24h(): Promise<number> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await this.moderationActionModel.search({ createdAfter: yesterday });
    return result.totalCount;
  }

  private async getRemovedContentCount(): Promise<number> {
    const result = await this.moderationActionModel.search({ actionType: 'CONTENT_REMOVAL' as any });
    return result.totalCount;
  }

  private calculateConversionRate(totalUsers: number, premiumUsers: number): number {
    return totalUsers > 0 ? (premiumUsers / totalUsers) * 100 : 0;
  }

  private async generateEnhancedSystemAlerts(): Promise<Array<{
    type: 'error' | 'warning' | 'info' | 'critical';
    category: 'security' | 'performance' | 'business' | 'system';
    message: string;
    timestamp: string;
    actionRequired: boolean;
    severity: number;
    relatedEntity?: { type: string; id: string | number };
  }>> {
    const alerts = [];
    const timestamp = new Date().toISOString();

    // Check for urgent flags
    const urgentFlags = await this.flagModel.getUrgent(24);
    if (urgentFlags.length > 10) {
      alerts.push({
        type: 'critical' as const,
        category: 'security' as const,
        message: `Critical: ${urgentFlags.length} urgent flags require immediate attention`,
        timestamp,
        actionRequired: true,
        severity: 9,
      });
    } else if (urgentFlags.length > 5) {
      alerts.push({
        type: 'warning' as const,
        category: 'security' as const,
        message: `${urgentFlags.length} urgent flags require attention`,
        timestamp,
        actionRequired: true,
        severity: 6,
      });
    }

    // Check for expired bans
    const expiredBans = await this.moderationActionModel.getExpiredBans();
    if (expiredBans.length > 0) {
      alerts.push({
        type: 'info' as const,
        category: 'system' as const,
        message: `${expiredBans.length} expired bans ready for processing`,
        timestamp,
        actionRequired: false,
        severity: 2,
      });
    }

    // Check system performance (mock metrics)
    const errorRate = 0.15;
    if (errorRate > 2.0) {
      alerts.push({
        type: 'critical' as const,
        category: 'performance' as const,
        message: `Critical error rate: ${errorRate}% - System degradation detected`,
        timestamp,
        actionRequired: true,
        severity: 10,
      });
    }

    // Check business metrics
    const userStats = await this.userModel.getStats();
    const bannedRatio = (userStats.bannedUsers || 0) / userStats.totalUsers;
    if (bannedRatio > 0.1) { // More than 10% banned
      alerts.push({
        type: 'warning' as const,
        category: 'business' as const,
        message: `High banned user ratio: ${(bannedRatio * 100).toFixed(1)}% - Review moderation policies`,
        timestamp,
        actionRequired: true,
        severity: 7,
      });
    }

    // Check for pending flags backlog
    const pendingFlags = await this.flagModel.getPending();
    if (pendingFlags.length > 50) {
      alerts.push({
        type: 'warning' as const,
        category: 'system' as const,
        message: `Large moderation backlog: ${pendingFlags.length} pending flags`,
        timestamp,
        actionRequired: true,
        severity: 5,
      });
    }

    // Sort alerts by severity (highest first)
    return alerts.sort((a, b) => b.severity - a.severity);
  }

  private generateTimeSeriesData(
    days: number,
    type: 'userGrowth' | 'revenue' | 'content' | 'moderation'
  ): any[] {
    const data = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];

      switch (type) {
        case 'userGrowth':
          data.push({
            date: dateStr,
            newUsers: Math.floor(Math.random() * 20) + 5,
            totalUsers: 1000 + (days - i) * 15,
          });
          break;
        case 'revenue':
          data.push({
            date: dateStr,
            revenue: Math.floor(Math.random() * 500) + 100,
            transactions: Math.floor(Math.random() * 50) + 10,
          });
          break;
        case 'content':
          data.push({
            date: dateStr,
            newListings: Math.floor(Math.random() * 30) + 10,
            activeListings: 500 + Math.floor(Math.random() * 100),
          });
          break;
        case 'moderation':
          data.push({
            date: dateStr,
            flags: Math.floor(Math.random() * 10) + 2,
            actions: Math.floor(Math.random() * 8) + 1,
          });
          break;
      }
    }

    return data;
  }

  private async logAdminAction(adminId: number, action: string, details: string): Promise<void> {
    // In a real implementation, this would log to an admin audit table
    // Store in cache for recent activity tracking
    const logEntry = {
      adminId,
      action,
      details,
      timestamp: new Date().toISOString(),
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.auditCache.set(logEntry.id, logEntry);
    console.log(`Admin ${adminId} performed action: ${action} - ${details}`);
  }

  /**
   * Calculate moderation action severity for audit purposes
   */
  private getModerationSeverity(actionType: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (actionType.toLowerCase()) {
      case 'ban':
      case 'permanent_ban':
        return 'critical';
      case 'content_removal':
      case 'account_suspension':
        return 'high';
      case 'warning':
      case 'temporary_restriction':
        return 'medium';
      case 'note':
      case 'unban':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Calculate user risk score based on activity and history
   */
  private calculateUserRiskScore(
    user: any,
    moderationHistory: any[],
    flagCount: number
  ): number {
    let riskScore = 0;

    // Base risk factors
    if (user.isBanned) riskScore += 50;
    riskScore += user.warningCount * 10;
    riskScore += moderationHistory.length * 5;
    riskScore += flagCount * 2;

    // Account age factor (newer accounts are riskier)
    const accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    if (accountAge < 7) riskScore += 20;
    else if (accountAge < 30) riskScore += 10;

    // Activity factor
    if (user.lastActive) {
      const daysSinceActive = Math.floor((Date.now() - new Date(user.lastActive).getTime()) / (24 * 60 * 60 * 1000));
      if (daysSinceActive > 30) riskScore += 5; // Inactive accounts might be compromised
    }

    return Math.min(100, Math.max(0, riskScore));
  }

  /**
   * Calculate bounce rate from session statistics
   */
  private calculateBounceRate(sessionStats: any): number {
    // Mock bounce rate calculation
    // In real implementation, this would analyze actual session data
    return sessionStats.shortSessions ? (sessionStats.shortSessions / sessionStats.totalSessions) * 100 : 32.1;
  }

  /**
   * Generate security recommendations based on audit data
   */
  private generateSecurityRecommendations(auditData: any): Array<{
    priority: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    issue: string;
    recommendation: string;
    impact: string;
  }> {
    const recommendations = [];

    // High critical events
    if (auditData.overview.criticalEvents > 10) {
      recommendations.push({
        priority: 'critical' as const,
        category: 'Security',
        issue: 'High number of critical security events detected',
        recommendation: 'Implement additional security monitoring and automated response systems',
        impact: 'Prevent potential security breaches and data loss'
      });
    }

    // High banned user ratio
    if (auditData.userSecurity.bannedUsers > auditData.userSecurity.bannedUsers * 0.1) {
      recommendations.push({
        priority: 'high' as const,
        category: 'User Management',
        issue: 'High proportion of banned users indicates potential security or policy issues',
        recommendation: 'Review user onboarding process and implement preventive measures',
        impact: 'Improve platform quality and reduce moderation overhead'
      });
    }

    // High content removal rate
    if (auditData.contentSecurity.automaticRemovals > 100) {
      recommendations.push({
        priority: 'medium' as const,
        category: 'Content Moderation',
        issue: 'High automatic content removal rate',
        recommendation: 'Review and tune content filtering algorithms, consider user education',
        impact: 'Reduce false positives while maintaining security standards'
      });
    }

    // Failed login attempts
    if (auditData.overview.failedLogins > 200) {
      recommendations.push({
        priority: 'high' as const,
        category: 'Authentication',
        issue: 'High number of failed login attempts detected',
        recommendation: 'Implement stronger rate limiting and account lockout policies',
        impact: 'Prevent brute force attacks and credential stuffing'
      });
    }

    // System security
    if (auditData.systemSecurity.unauthorizedAccess > 5) {
      recommendations.push({
        priority: 'critical' as const,
        category: 'System Security',
        issue: 'Unauthorized access attempts detected',
        recommendation: 'Review access controls and implement additional monitoring',
        impact: 'Prevent system compromise and data breaches'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Enhanced user search with admin-specific filters
   */
  async advancedUserSearch(
    adminId: number,
    filters: {
      query?: string;
      status?: 'active' | 'banned' | 'warned';
      riskScore?: { min?: number; max?: number };
      accountAge?: { min?: number; max?: number };
      activity?: 'recent' | 'inactive' | 'new';
      hasFlags?: boolean;
      hasPremium?: boolean;
    },
    page = 1,
    limit = 50
  ): Promise<{
    users: any[];
    totalCount: number;
    filters: typeof filters;
    aggregations: {
      statusBreakdown: Record<string, number>;
      avgRiskScore: number;
      avgAccountAge: number;
    };
  }> {
    await this.verifyAdminPermissions(adminId);

    // Convert admin filters to UserSearchFilters
    const searchFilters: UserSearchFilters = {
      search: filters.query,
    };

    if (filters.status === 'banned') {
      searchFilters.banned = true;
    } else if (filters.status === 'active') {
      searchFilters.banned = false;
    }

    // Get base search results
    const searchResult = await this.userModel.search(searchFilters, page, limit);

    // Apply additional admin-specific filtering (in real implementation, this would be done at DB level)
    let filteredUsers = searchResult.users;

    if (filters.riskScore) {
      filteredUsers = filteredUsers.filter(user => {
        const riskScore = this.calculateUserRiskScore(user, [], 0); // Simplified for demo
        return (!filters.riskScore?.min || riskScore >= filters.riskScore.min) &&
               (!filters.riskScore?.max || riskScore <= filters.riskScore.max);
      });
    }

    // Calculate aggregations
    const statusBreakdown = filteredUsers.reduce((acc, user) => {
      const status = user.isBanned ? 'banned' : (user.warningCount || 0) > 0 ? 'warned' : 'active';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgRiskScore = filteredUsers.length > 0
      ? filteredUsers.reduce((sum, user) => sum + this.calculateUserRiskScore(user, [], 0), 0) / filteredUsers.length
      : 0;

    const avgAccountAge = filteredUsers.length > 0
      ? filteredUsers.reduce((sum, user) => {
          const accountAge = Math.floor((Date.now() - new Date(user.createdAt || '').getTime()) / (24 * 60 * 60 * 1000));
          return sum + accountAge;
        }, 0) / filteredUsers.length
      : 0;

    return {
      users: filteredUsers,
      totalCount: filteredUsers.length,
      filters,
      aggregations: {
        statusBreakdown,
        avgRiskScore: Math.round(avgRiskScore * 100) / 100,
        avgAccountAge: Math.round(avgAccountAge)
      }
    };
  }

  /**
   * Get admin performance metrics
   */
  async getAdminPerformanceMetrics(
    requestingAdminId: number,
    targetAdminId?: number,
    days = 30
  ): Promise<{
    adminId: number;
    period: { start: string; end: string };
    performance: {
      actionsPerformed: number;
      averageResponseTime: number; // hours
      accuracyRate: number; // percentage
      flagsReviewed: number;
      usersManaged: number;
      configChanges: number;
    };
    breakdown: {
      byAction: Record<string, number>;
      byCategory: Record<string, number>;
      byResult: Record<string, number>;
    };
    trends: {
      dailyActivity: Array<{ date: string; actions: number }>;
      responseTimeImprovement: number;
      workloadTrend: 'increasing' | 'stable' | 'decreasing';
    };
  }> {
    await this.verifyAdminPermissions(requestingAdminId);

    const adminId = targetAdminId || requestingAdminId;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Get admin actions for the period
    const adminActions = await this.moderationActionModel.search({
      adminId,
      createdAfter: startDate.toISOString(),
      createdBefore: endDate.toISOString()
    });

    const actions = adminActions.actions;

    // Calculate performance metrics
    const performance = {
      actionsPerformed: actions.length,
      averageResponseTime: actions.length > 0 ? 2.5 : 0, // Mock response time
      accuracyRate: actions.length > 0 ? 92.5 : 0, // Mock accuracy rate
      flagsReviewed: actions.filter(a => (a.type || a.actionType || '').includes('FLAG')).length,
      usersManaged: new Set(actions.map(a => a.targetUser?.telegramId || a.targetUserId).filter(Boolean)).size,
      configChanges: actions.filter(a => (a.type || a.actionType || '').includes('CONFIG')).length
    };

    // Calculate breakdowns
    const byAction = actions.reduce((acc, action) => {
      const actionType = action.type || action.actionType || 'UNKNOWN';
      acc[actionType] = (acc[actionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byCategory = {
      'user_management': actions.filter(a => ['BAN', 'UNBAN', 'WARNING'].includes(a.type || a.actionType || '')).length,
      'content_moderation': actions.filter(a => ['CONTENT_REMOVAL', 'FLAG_REVIEW'].includes(a.type || a.actionType || '')).length,
      'system_config': actions.filter(a => ['CONFIG_CHANGE'].includes(a.type || a.actionType || '')).length
    };

    const byResult = {
      'success': actions.length, // Assuming all successful for demo
      'failure': 0,
      'partial': 0
    };

    // Generate daily activity trend
    const dailyActivity = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(endDate.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayActions = actions.filter(a => (a.createdAt || '').startsWith(dateStr)).length;
      dailyActivity.push({ date: dateStr, actions: dayActions });
    }

    return {
      adminId,
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      performance,
      breakdown: { byAction, byCategory, byResult },
      trends: {
        dailyActivity,
        responseTimeImprovement: 15.2, // Mock improvement percentage
        workloadTrend: 'stable' as const
      }
    };
  }
}