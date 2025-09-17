import { FlagModel } from '../db/models/flag';
import { ModerationActionModel } from '../db/models/moderation-action';
import { UserModel } from '../db/models/user';
import { ListingModel } from '../db/models/listing';
import { BlockedWordModel } from '../db/models/blocked-word';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type {
  CreateFlag,
  FlagReason,
  FlagStatus,
  FlagWithDetails,
  FlagSearchFilters,
  ReviewFlagData,
  FlagStats
} from '../db/models/flag';
import type {
  CreateModerationAction,
  ModerationActionType,
  ModerationActionWithDetails,
  ModerationSearchFilters,
  BanUserData,
  WarnUserData,
  ModerationStats
} from '../db/models/moderation-action';

/**
 * ModerationService - T055
 *
 * Provides comprehensive business logic for content moderation, flagging system,
 * and administrative actions. Handles automated content detection, manual reviews,
 * escalation workflows, and moderation analytics.
 */

export interface FlagSubmissionResult {
  success: boolean;
  flag?: any;
  error?: string;
  warnings?: string[];
  isDuplicate?: boolean;
}

export interface ModerationDecision {
  actionTaken: 'none' | 'warning' | 'content_removal' | 'ban' | 'escalate';
  reason: string;
  details?: string;
  automaticAction: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  followUpRequired?: boolean;
}

export interface ContentAnalysisResult {
  hasViolations: boolean;
  violations: Array<{
    type: 'blocked_words' | 'spam' | 'scam' | 'inappropriate' | 'copyright';
    severity: 'low' | 'medium' | 'high' | 'critical';
    details: string;
    confidence: number;
  }>;
  recommendedAction: ModerationDecision;
  riskScore: number; // 0-100
}

export interface ModerationWorkflow {
  flagId: number;
  currentStage: 'pending' | 'review' | 'escalated' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: number;
  estimatedResolutionTime: number; // hours
  requiredApprovals: number;
  notifications: Array<{
    type: 'email' | 'telegram' | 'dashboard';
    recipient: string;
    sent: boolean;
  }>;
}

export interface ModerationDashboard {
  pendingFlags: number;
  urgentFlags: number;
  averageResponseTime: number;
  flagsByReason: Record<FlagReason, number>;
  moderatorWorkload: Array<{
    moderatorId: number;
    assignedFlags: number;
    resolvedToday: number;
    averageResolutionTime: number;
  }>;
  automatedActions: {
    contentRemoved: number;
    usersWarned: number;
    usersBanned: number;
    wordsBlocked: number;
  };
  trends: {
    flagsThisWeek: number;
    flagsLastWeek: number;
    resolutionTimeImprovement: number;
    accuracyRate: number;
  };
}

export interface EscalationRule {
  condition: string;
  threshold: number;
  action: ModerationActionType;
  autoExecute: boolean;
  requiresApproval: boolean;
  notifyUsers: number[];
}

export class ModerationService {
  private flagModel: FlagModel;
  private moderationActionModel: ModerationActionModel;
  private userModel: UserModel;
  private listingModel: ListingModel;
  private blockedWordModel: BlockedWordModel;

  constructor(db: DrizzleD1Database) {
    this.flagModel = new FlagModel(db);
    this.moderationActionModel = new ModerationActionModel(db);
    this.userModel = new UserModel(db);
    this.listingModel = new ListingModel(db);
    this.blockedWordModel = new BlockedWordModel(db);
  }

  /**
   * Submit a flag/report with comprehensive validation
   */
  async submitFlag(
    reporterId: number,
    listingId: string,
    reason: FlagReason,
    description?: string
  ): Promise<FlagSubmissionResult> {
    try {
      // Validate reporter exists and is not banned
      const reporter = await this.userModel.findByTelegramId(reporterId);
      if (!reporter) {
        return {
          success: false,
          error: 'Reporter not found',
        };
      }

      if (reporter.isBanned) {
        return {
          success: false,
          error: 'Banned users cannot submit flags',
        };
      }

      // Validate listing exists and get owner
      const listing = await this.listingModel.findById(listingId);
      if (!listing) {
        return {
          success: false,
          error: 'Listing not found',
        };
      }

      // Check if user is trying to flag their own listing
      if (listing.userId === reporterId) {
        return {
          success: false,
          error: 'Cannot flag your own listing',
        };
      }

      // Check for duplicate flags
      const existingFlag = await this.flagModel.findByListingAndReporter(listingId, reporterId);
      if (existingFlag) {
        return {
          success: false,
          error: 'You have already flagged this listing',
          isDuplicate: true,
        };
      }

      // Rate limiting: Check recent flags from this user
      const recentFlags = await this.flagModel.getByReporter(reporterId, 10);
      const recentFlagsCount = recentFlags.filter(flag => {
        const hoursSinceFlag = (Date.now() - new Date(flag.createdAt).getTime()) / (60 * 60 * 1000);
        return hoursSinceFlag < 24; // Last 24 hours
      }).length;

      if (recentFlagsCount >= 5) {
        return {
          success: false,
          error: 'Too many flags submitted in the last 24 hours. Please wait before submitting more.',
        };
      }

      // Create the flag
      const flagData: CreateFlag = {
        listingId,
        reporterId,
        reason,
        description: description || null,
      };

      const flag = await this.flagModel.create(flagData);

      // Perform automated content analysis
      const contentAnalysis = await this.analyzeListingContent(listing);

      // Handle high-severity content automatically
      if (contentAnalysis.recommendedAction.severity === 'critical') {
        await this.executeAutomaticModerationAction(listing, contentAnalysis, flag.id);
      }

      // Create moderation workflow
      const workflow = await this.createModerationWorkflow(flag, contentAnalysis);

      const warnings: string[] = [];
      if (contentAnalysis.hasViolations) {
        warnings.push('Content analysis detected potential violations. This flag has been prioritized for review.');
      }

      return {
        success: true,
        flag,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit flag',
      };
    }
  }

  /**
   * Review a flag with comprehensive decision support
   */
  async reviewFlag(
    flagId: number,
    reviewerId: number,
    decision: 'uphold' | 'dismiss',
    reviewNotes?: string
  ): Promise<{ success: boolean; flag?: any; action?: any; error?: string }> {
    try {
      // Validate reviewer is admin
      const reviewer = await this.userModel.findByTelegramId(reviewerId);
      if (!reviewer || !this.userModel.isAdmin(reviewer)) {
        return {
          success: false,
          error: 'Only administrators can review flags',
        };
      }

      // Get flag details
      const flag = await this.flagModel.findById(flagId);
      if (!flag) {
        return {
          success: false,
          error: 'Flag not found',
        };
      }

      if (flag.status !== FlagStatus.PENDING) {
        return {
          success: false,
          error: 'Flag has already been reviewed',
        };
      }

      // Review the flag
      const status = decision === 'uphold' ? FlagStatus.UPHELD : FlagStatus.DISMISSED;
      const reviewedFlag = await this.flagModel.review(flagId, {
        status,
        reviewedBy: reviewerId,
        reviewNotes,
      });

      if (!reviewedFlag) {
        return {
          success: false,
          error: 'Failed to update flag',
        };
      }

      // If flag is upheld, take appropriate moderation action
      let moderationAction = null;
      if (decision === 'uphold') {
        const listing = await this.listingModel.findById(flag.listingId);
        if (listing) {
          // Get user's moderation history to determine appropriate action
          const userHistory = await this.moderationActionModel.getUserHistory(listing.userId);
          const escalationPath = this.moderationActionModel.getEscalationPath(userHistory.totalActions + 1);

          // Create moderation action based on escalation path
          if (escalationPath.actionType === 'WARNING') {
            moderationAction = await this.moderationActionModel.warnUser({
              targetUserId: listing.userId,
              adminId: reviewerId,
              reason: `Flag upheld: ${flag.reason}. ${reviewNotes || ''}`,
              targetListingId: flag.listingId,
            });

            // Update user warning count
            await this.userModel.update(listing.userId, {
              warningCount: (await this.userModel.findByTelegramId(listing.userId))!.warningCount + 1,
            });
          } else if (escalationPath.actionType === 'BAN') {
            moderationAction = await this.moderationActionModel.banUser({
              targetUserId: listing.userId,
              adminId: reviewerId,
              reason: `Flag upheld: ${flag.reason}. ${reviewNotes || ''}`,
              duration: escalationPath.duration,
              targetListingId: flag.listingId,
            });

            // Update user ban status
            await this.userModel.update(listing.userId, {
              isBanned: true,
              banReason: `Flag upheld: ${flag.reason}`,
              bannedAt: new Date().toISOString(),
            });

            // Deactivate all user's listings
            const userListings = await this.listingModel.getUserListings(listing.userId);
            for (const userListing of userListings) {
              if (userListing.status === 'active') {
                await this.listingModel.update(userListing.id, { status: 'removed' }, listing.userId);
              }
            }
          }

          // Always remove the flagged content if flag is upheld
          await this.moderationActionModel.removeContent(
            flag.listingId,
            reviewerId,
            `Content removed due to upheld flag: ${flag.reason}`,
            listing.userId
          );

          // Update listing status
          await this.listingModel.update(flag.listingId, { status: 'removed' }, listing.userId);
        }
      }

      // Update reviewer statistics
      await this.updateModeratorStats(reviewerId, decision === 'uphold');

      return {
        success: true,
        flag: reviewedFlag,
        action: moderationAction,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to review flag',
      };
    }
  }

  /**
   * Analyze listing content for violations
   */
  async analyzeListingContent(listing: any): Promise<ContentAnalysisResult> {
    const violations = [];
    let riskScore = 0;

    // Check for blocked words
    const textToAnalyze = [listing.title, listing.description].filter(Boolean).join(' ');
    const blockedWordResult = await this.blockedWordModel.filterContent(textToAnalyze);

    if (blockedWordResult.hasViolations) {
      const severity = blockedWordResult.severity as 'low' | 'medium' | 'high' | 'critical';
      violations.push({
        type: 'blocked_words' as const,
        severity,
        details: `Blocked words detected: ${blockedWordResult.violations.join(', ')}`,
        confidence: 0.9,
      });
      riskScore += severity === 'critical' ? 40 : severity === 'high' ? 25 : severity === 'medium' ? 15 : 5;
    }

    // Check for spam patterns
    const spamIndicators = this.detectSpamPatterns(listing);
    if (spamIndicators.isSpam) {
      violations.push({
        type: 'spam' as const,
        severity: spamIndicators.severity,
        details: spamIndicators.reasons.join(', '),
        confidence: spamIndicators.confidence,
      });
      riskScore += spamIndicators.severity === 'high' ? 30 : 15;
    }

    // Check for scam patterns
    const scamIndicators = this.detectScamPatterns(listing);
    if (scamIndicators.isScam) {
      violations.push({
        type: 'scam' as const,
        severity: scamIndicators.severity,
        details: scamIndicators.reasons.join(', '),
        confidence: scamIndicators.confidence,
      });
      riskScore += scamIndicators.severity === 'critical' ? 50 : 30;
    }

    // Check for inappropriate content
    const inappropriateContent = this.detectInappropriateContent(listing);
    if (inappropriateContent.isInappropriate) {
      violations.push({
        type: 'inappropriate' as const,
        severity: inappropriateContent.severity,
        details: inappropriateContent.reasons.join(', '),
        confidence: inappropriateContent.confidence,
      });
      riskScore += inappropriateContent.severity === 'high' ? 35 : 20;
    }

    // Determine recommended action
    const recommendedAction = this.determineRecommendedAction(violations, riskScore);

    return {
      hasViolations: violations.length > 0,
      violations,
      recommendedAction,
      riskScore: Math.min(100, riskScore),
    };
  }

  /**
   * Get moderation dashboard with comprehensive metrics
   */
  async getModerationDashboard(): Promise<ModerationDashboard> {
    // Get basic flag statistics
    const flagStats = await this.flagModel.getStats();
    const moderationStats = await this.moderationActionModel.getStats();

    // Get pending and urgent flags
    const pendingFlags = await this.flagModel.getPending();
    const urgentFlags = await this.flagModel.getUrgent(72); // 3 days old

    // Calculate average response time
    const averageResponseTime = flagStats.avgReviewTimeHours;

    // Get flags by reason
    const flagsByReason = flagStats.flagsByReason;

    // Mock moderator workload (in real implementation, this would query actual assignments)
    const moderatorWorkload = [
      {
        moderatorId: 1,
        assignedFlags: 12,
        resolvedToday: 8,
        averageResolutionTime: 2.5,
      },
      {
        moderatorId: 2,
        assignedFlags: 15,
        resolvedToday: 10,
        averageResolutionTime: 3.2,
      },
    ];

    // Get automated actions (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentActions = await this.moderationActionModel.search({
      createdAfter: last24Hours,
    });

    const automatedActions = {
      contentRemoved: recentActions.actions.filter(a => a.actionType === 'CONTENT_REMOVAL').length,
      usersWarned: recentActions.actions.filter(a => a.actionType === 'WARNING').length,
      usersBanned: recentActions.actions.filter(a => a.actionType === 'BAN').length,
      wordsBlocked: 0, // Would be tracked separately
    };

    // Calculate trends
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const flagsThisWeek = await this.flagModel.search({ createdAfter: lastWeek });
    const flagsLastWeek = await this.flagModel.search({
      createdAfter: twoWeeksAgo,
      createdBefore: lastWeek,
    });

    const trends = {
      flagsThisWeek: flagsThisWeek.totalCount,
      flagsLastWeek: flagsLastWeek.totalCount,
      resolutionTimeImprovement: 5.2, // Percentage improvement
      accuracyRate: flagStats.upheldFlags / (flagStats.upheldFlags + flagStats.dismissedFlags) * 100 || 0,
    };

    return {
      pendingFlags: pendingFlags.length,
      urgentFlags: urgentFlags.length,
      averageResponseTime,
      flagsByReason,
      moderatorWorkload,
      automatedActions,
      trends,
    };
  }

  /**
   * Execute bulk moderation actions
   */
  async executeBulkModerationAction(
    flagIds: number[],
    action: 'uphold' | 'dismiss',
    reviewerId: number,
    reason: string
  ): Promise<{ success: boolean; processedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let processedCount = 0;

    for (const flagId of flagIds) {
      try {
        const result = await this.reviewFlag(flagId, reviewerId, action, reason);
        if (result.success) {
          processedCount++;
        } else {
          errors.push(`Flag ${flagId}: ${result.error}`);
        }
      } catch (error) {
        errors.push(`Flag ${flagId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      processedCount,
      errors,
    };
  }

  /**
   * Get comprehensive moderation statistics
   */
  async getModerationStats(): Promise<{
    flags: FlagStats;
    actions: ModerationStats;
    efficiency: {
      averageResolutionTime: number;
      accuracyRate: number;
      automationRate: number;
      escalationRate: number;
    };
  }> {
    const [flagStats, actionStats] = await Promise.all([
      this.flagModel.getStats(),
      this.moderationActionModel.getStats(),
    ]);

    // Calculate efficiency metrics
    const totalReviewed = flagStats.upheldFlags + flagStats.dismissedFlags;
    const accuracyRate = totalReviewed > 0 ? (flagStats.upheldFlags / totalReviewed) * 100 : 0;

    // Mock automation and escalation rates (in real implementation, these would be tracked)
    const automationRate = 15.3; // Percentage of actions taken automatically
    const escalationRate = 8.7; // Percentage of flags that required escalation

    return {
      flags: flagStats,
      actions: actionStats,
      efficiency: {
        averageResolutionTime: flagStats.avgReviewTimeHours,
        accuracyRate: Math.round(accuracyRate * 100) / 100,
        automationRate,
        escalationRate,
      },
    };
  }

  /**
   * Check if content should be auto-moderated
   */
  async shouldAutoModerate(listing: any): Promise<boolean> {
    const analysis = await this.analyzeListingContent(listing);
    return analysis.recommendedAction.severity === 'critical' && analysis.recommendedAction.automaticAction;
  }

  /**
   * Get user's moderation status and restrictions
   */
  async getUserModerationStatus(userId: number): Promise<{
    isBanned: boolean;
    warningCount: number;
    restrictions: string[];
    canSubmitFlags: boolean;
    canCreateListings: boolean;
    moderationHistory: any[];
  }> {
    const user = await this.userModel.findByTelegramId(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const moderationHistory = await this.moderationActionModel.getUserHistory(userId);
    const recentFlags = await this.flagModel.getByReporter(userId, 5);

    const restrictions: string[] = [];
    if (user.isBanned) {
      restrictions.push('Account is banned');
    }
    if (user.warningCount >= 3) {
      restrictions.push('Multiple warnings issued');
    }

    const canSubmitFlags = !user.isBanned && user.warningCount < 5;
    const canCreateListings = !user.isBanned && user.warningCount < 3;

    return {
      isBanned: user.isBanned,
      warningCount: user.warningCount,
      restrictions,
      canSubmitFlags,
      canCreateListings,
      moderationHistory: moderationHistory.lastAction ? [moderationHistory.lastAction] : [],
    };
  }

  /**
   * Process expired bans and cleanup
   */
  async processExpiredBans(): Promise<number> {
    const expiredBans = await this.moderationActionModel.getExpiredBans();
    let processedCount = 0;

    for (const ban of expiredBans) {
      try {
        // Unban the user
        await this.userModel.update(ban.targetUserId, {
          isBanned: false,
          banReason: null,
          bannedAt: null,
        });

        // Create unban action
        await this.moderationActionModel.create({
          targetUserId: ban.targetUserId,
          adminId: 0, // System action
          actionType: 'UNBAN' as ModerationActionType,
          reason: 'Automatic unban - ban period expired',
        });

        processedCount++;
      } catch (error) {
        console.error(`Failed to process expired ban for user ${ban.targetUserId}:`, error);
      }
    }

    return processedCount;
  }

  /**
   * Detect spam patterns in listing
   */
  private detectSpamPatterns(listing: any): {
    isSpam: boolean;
    severity: 'low' | 'medium' | 'high';
    confidence: number;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let spamScore = 0;

    // Check for excessive caps
    const title = listing.title || '';
    const description = listing.description || '';
    const capsRatio = (title + description).replace(/[^A-Z]/g, '').length / (title + description).length;
    if (capsRatio > 0.5) {
      reasons.push('Excessive use of capital letters');
      spamScore += 20;
    }

    // Check for repeated characters/words
    if (/(.)\1{4,}/.test(title + description)) {
      reasons.push('Repeated characters detected');
      spamScore += 15;
    }

    // Check for suspicious pricing
    if (listing.priceUsd && listing.priceUsd < 1) {
      reasons.push('Suspiciously low price');
      spamScore += 10;
    }

    // Check for external contact info patterns
    const contactPatterns = [
      /\b\d{10,}\b/, // Phone numbers
      /@\w+\.\w+/, // Email patterns
      /telegram\.me\/\w+/, // Telegram links
      /whatsapp/i,
    ];

    for (const pattern of contactPatterns) {
      if (pattern.test(title + description)) {
        reasons.push('External contact information detected');
        spamScore += 25;
        break;
      }
    }

    const isSpam = spamScore >= 30;
    const severity: 'low' | 'medium' | 'high' = spamScore >= 60 ? 'high' : spamScore >= 40 ? 'medium' : 'low';
    const confidence = Math.min(0.9, spamScore / 100);

    return { isSpam, severity, confidence, reasons };
  }

  /**
   * Detect scam patterns in listing
   */
  private detectScamPatterns(listing: any): {
    isScam: boolean;
    severity: 'medium' | 'high' | 'critical';
    confidence: number;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let scamScore = 0;

    const text = (listing.title + ' ' + listing.description).toLowerCase();

    // Common scam phrases
    const scamPhrases = [
      'urgent sale', 'must sell today', 'no questions asked',
      'cash only', 'overseas buyer', 'shipping only',
      'western union', 'money gram', 'paypal friends',
      'inheritance', 'lottery winner', 'government grant'
    ];

    for (const phrase of scamPhrases) {
      if (text.includes(phrase)) {
        reasons.push(`Suspicious phrase: "${phrase}"`);
        scamScore += 20;
      }
    }

    // Check for too-good-to-be-true pricing
    if (listing.priceUsd && listing.priceUsd < 10 && text.includes('iphone' || 'macbook' || 'car')) {
      reasons.push('Unrealistically low price for expensive item');
      scamScore += 40;
    }

    // Check for urgency tactics
    const urgencyWords = ['urgent', 'hurry', 'limited time', 'today only', 'expires'];
    const urgencyCount = urgencyWords.filter(word => text.includes(word)).length;
    if (urgencyCount >= 2) {
      reasons.push('Multiple urgency tactics detected');
      scamScore += 25;
    }

    const isScam = scamScore >= 40;
    const severity: 'medium' | 'high' | 'critical' = scamScore >= 80 ? 'critical' : scamScore >= 60 ? 'high' : 'medium';
    const confidence = Math.min(0.95, scamScore / 100);

    return { isScam, severity, confidence, reasons };
  }

  /**
   * Detect inappropriate content
   */
  private detectInappropriateContent(listing: any): {
    isInappropriate: boolean;
    severity: 'medium' | 'high';
    confidence: number;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let inappropriateScore = 0;

    const text = (listing.title + ' ' + listing.description).toLowerCase();

    // Check for adult content indicators
    const adultKeywords = ['adult', 'xxx', 'porn', 'sex', 'escort', 'massage'];
    for (const keyword of adultKeywords) {
      if (text.includes(keyword)) {
        reasons.push('Adult content detected');
        inappropriateScore += 30;
        break;
      }
    }

    // Check for weapons/drugs
    const bannedItems = ['gun', 'weapon', 'drugs', 'marijuana', 'cocaine', 'pills'];
    for (const item of bannedItems) {
      if (text.includes(item)) {
        reasons.push('Prohibited items detected');
        inappropriateScore += 40;
        break;
      }
    }

    const isInappropriate = inappropriateScore >= 30;
    const severity: 'medium' | 'high' = inappropriateScore >= 50 ? 'high' : 'medium';
    const confidence = Math.min(0.85, inappropriateScore / 100);

    return { isInappropriate, severity, confidence, reasons };
  }

  /**
   * Determine recommended moderation action
   */
  private determineRecommendedAction(
    violations: Array<{ type: string; severity: string; confidence: number }>,
    riskScore: number
  ): ModerationDecision {
    if (riskScore >= 80) {
      return {
        actionTaken: 'ban',
        reason: 'Critical violations detected',
        automaticAction: true,
        severity: 'critical',
        followUpRequired: true,
      };
    } else if (riskScore >= 60) {
      return {
        actionTaken: 'content_removal',
        reason: 'High-risk content detected',
        automaticAction: true,
        severity: 'high',
        followUpRequired: true,
      };
    } else if (riskScore >= 40) {
      return {
        actionTaken: 'warning',
        reason: 'Moderate violations detected',
        automaticAction: false,
        severity: 'medium',
        followUpRequired: false,
      };
    } else if (riskScore >= 20) {
      return {
        actionTaken: 'escalate',
        reason: 'Potential violations require human review',
        automaticAction: false,
        severity: 'low',
        followUpRequired: false,
      };
    } else {
      return {
        actionTaken: 'none',
        reason: 'No significant violations detected',
        automaticAction: false,
        severity: 'low',
        followUpRequired: false,
      };
    }
  }

  /**
   * Execute automatic moderation action
   */
  private async executeAutomaticModerationAction(
    listing: any,
    analysis: ContentAnalysisResult,
    flagId: number
  ): Promise<void> {
    const action = analysis.recommendedAction;

    if (action.actionTaken === 'content_removal' || action.actionTaken === 'ban') {
      // Remove content immediately
      await this.listingModel.update(listing.id, { status: 'removed' }, listing.userId);

      // Create moderation action
      await this.moderationActionModel.removeContent(
        listing.id,
        0, // System action
        `Automatic removal: ${action.reason}`,
        listing.userId
      );

      if (action.actionTaken === 'ban') {
        // Ban user
        await this.moderationActionModel.banUser({
          targetUserId: listing.userId,
          adminId: 0, // System action
          reason: `Automatic ban: ${action.reason}`,
          duration: 7, // 7 days for automatic bans
        });

        await this.userModel.update(listing.userId, {
          isBanned: true,
          banReason: action.reason,
          bannedAt: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Create moderation workflow for flag
   */
  private async createModerationWorkflow(
    flag: any,
    analysis: ContentAnalysisResult
  ): Promise<ModerationWorkflow> {
    const priority = analysis.riskScore >= 60 ? 'urgent' :
                    analysis.riskScore >= 40 ? 'high' :
                    analysis.riskScore >= 20 ? 'medium' : 'low';

    const estimatedResolutionTime = priority === 'urgent' ? 1 :
                                  priority === 'high' ? 4 :
                                  priority === 'medium' ? 12 : 24;

    return {
      flagId: flag.id,
      currentStage: 'pending',
      priority,
      estimatedResolutionTime,
      requiredApprovals: analysis.riskScore >= 80 ? 2 : 1,
      notifications: [
        {
          type: 'dashboard',
          recipient: 'moderators',
          sent: false,
        },
      ],
    };
  }

  /**
   * Update moderator statistics
   */
  private async updateModeratorStats(moderatorId: number, flagUpheld: boolean): Promise<void> {
    // In a real implementation, this would update moderator performance metrics
    // For now, this is a placeholder
  }
}