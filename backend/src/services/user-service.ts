import { UserModel } from '../db/models/user';
import { UserSessionModel } from '../db/models/user-session';
import { ListingModel } from '../db/models/listing';
import { ModerationActionModel } from '../db/models/moderation-action';
import { PremiumFeatureModel } from '../db/models/premium-feature';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { CreateUser, UpdateUser, UserWithStats } from '../db/models/user';

/**
 * UserService - T052
 *
 * Provides business logic for user profile management, statistics, and account operations.
 * Handles user CRUD, profile updates, account status, and user analytics.
 */

export interface UserProfile extends UserWithStats {
  sessionCount: number;
  lastSessionAt?: string;
  accountAge: number;
  joinedDate: string;
  profileCompleteness: number;
  reputationScore: number;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  notifications: {
    listingUpdates: boolean;
    messages: boolean;
    premiumExpiry: boolean;
    moderationActions: boolean;
  };
  privacy: {
    showUsername: boolean;
    showOnlineStatus: boolean;
    allowDirectContact: boolean;
  };
  display: {
    language: string;
    timezone: string;
    currency: string;
  };
}

export interface UserActivity {
  totalListings: number;
  activeListings: number;
  soldListings: number;
  totalViews: number;
  averageViewsPerListing: number;
  premiumFeaturesUsed: number;
  moderationActions: number;
  lastActive: string;
  joinDate: string;
  daysSinceJoined: number;
}

export interface UserModerationInfo {
  warningCount: number;
  isBanned: boolean;
  banReason?: string | null;
  bannedAt?: string | null;
  moderationHistory: any[];
  canAppeal: boolean;
  restrictionLevel: 'none' | 'warned' | 'restricted' | 'banned';
}

export class UserService {
  private userModel: UserModel;
  private sessionModel: UserSessionModel;
  private listingModel: ListingModel;
  private moderationModel: ModerationActionModel;
  private premiumModel: PremiumFeatureModel;

  constructor(db: DrizzleD1Database) {
    this.userModel = new UserModel(db);
    this.sessionModel = new UserSessionModel(db);
    this.listingModel = new ListingModel(db);
    this.moderationModel = new ModerationActionModel(db);
    this.premiumModel = new PremiumFeatureModel(db);
  }

  /**
   * Get comprehensive user profile
   */
  async getProfile(telegramId: number): Promise<UserProfile | null> {
    const user = await this.userModel.getWithStats(telegramId);
    if (!user) return null;

    // Get additional profile data
    const [sessions, activity, moderation] = await Promise.all([
      this.sessionModel.getUserSessions(telegramId, true),
      this.getUserActivity(telegramId),
      this.getUserModerationInfo(telegramId),
    ]);

    const lastSession = sessions.length > 0 ? sessions[0] : null;
    const joinedDate = new Date(user.createdAt);
    const accountAge = Math.floor((Date.now() - joinedDate.getTime()) / (24 * 60 * 60 * 1000));

    // Calculate profile completeness
    const completeness = this.calculateProfileCompleteness(user);

    // Calculate reputation score
    const reputationScore = this.calculateReputationScore(user, activity, moderation);

    const profile: UserProfile = {
      ...user,
      sessionCount: sessions.length,
      lastSessionAt: lastSession?.lastUsed,
      accountAge,
      joinedDate: user.createdAt,
      profileCompleteness: completeness,
      reputationScore,
      preferences: await this.getUserPreferences(telegramId),
    };

    return profile;
  }

  /**
   * Update user profile
   */
  async updateProfile(
    telegramId: number,
    updates: Partial<UpdateUser>
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      // Validate updates
      const validationErrors = this.validateProfileUpdates(updates);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: `Validation failed: ${validationErrors.join(', ')}`,
        };
      }

      const updatedUser = await this.userModel.update(telegramId, updates);
      if (!updatedUser) {
        return {
          success: false,
          error: 'User not found or update failed',
        };
      }

      return {
        success: true,
        user: updatedUser,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Profile update failed',
      };
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivity(telegramId: number): Promise<UserActivity> {
    const user = await this.userModel.findByTelegramId(telegramId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user's listings
    const listings = await this.listingModel.getUserListings(telegramId);
    const activeListings = listings.filter(l => l.status === 'active');
    const soldListings = listings.filter(l => l.status === 'sold');

    // Calculate views
    const totalViews = listings.reduce((sum, listing) => sum + listing.viewCount, 0);
    const averageViewsPerListing = listings.length > 0 ? totalViews / listings.length : 0;

    // Get premium features
    const premiumFeatures = await this.premiumModel.getUserFeatures(telegramId);

    // Get moderation actions
    const moderationActions = await this.moderationModel.getUserActions(telegramId);

    const joinDate = new Date(user.createdAt);
    const daysSinceJoined = Math.floor((Date.now() - joinDate.getTime()) / (24 * 60 * 60 * 1000));

    return {
      totalListings: listings.length,
      activeListings: activeListings.length,
      soldListings: soldListings.length,
      totalViews,
      averageViewsPerListing: Math.round(averageViewsPerListing * 100) / 100,
      premiumFeaturesUsed: premiumFeatures.length,
      moderationActions: moderationActions.length,
      lastActive: user.lastActive,
      joinDate: user.createdAt,
      daysSinceJoined,
    };
  }

  /**
   * Get user moderation information
   */
  async getUserModerationInfo(telegramId: number): Promise<UserModerationInfo> {
    const user = await this.userModel.findByTelegramId(telegramId);
    if (!user) {
      throw new Error('User not found');
    }

    const moderationHistory = await this.moderationModel.getUserActions(telegramId);
    const activeBan = await this.moderationModel.getActiveBan(telegramId);

    // Determine restriction level
    let restrictionLevel: 'none' | 'warned' | 'restricted' | 'banned' = 'none';
    if (user.isBanned) {
      restrictionLevel = 'banned';
    } else if (user.warningCount >= 3) {
      restrictionLevel = 'restricted';
    } else if (user.warningCount > 0) {
      restrictionLevel = 'warned';
    }

    // Check if user can appeal
    const canAppeal = activeBan ? this.moderationModel.canAppeal(activeBan) : false;

    return {
      warningCount: user.warningCount,
      isBanned: user.isBanned,
      banReason: user.banReason,
      bannedAt: user.bannedAt,
      moderationHistory,
      canAppeal,
      restrictionLevel,
    };
  }

  /**
   * Delete user account (GDPR compliance)
   */
  async deleteAccount(
    telegramId: number,
    reason = 'User requested deletion'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Archive user's listings first
      const userListings = await this.listingModel.getUserListings(telegramId);
      for (const listing of userListings) {
        await this.listingModel.archive(listing.id, telegramId);
      }

      // Revoke all sessions
      await this.sessionModel.revokeAllUserSessions(telegramId);

      // Soft delete user (mark as deleted but keep for referential integrity)
      await this.userModel.update(telegramId, {
        username: null,
        firstName: 'Deleted User',
        lastName: null,
        profilePhotoUrl: null,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Account deletion failed',
      };
    }
  }

  /**
   * Export user data (GDPR compliance)
   */
  async exportUserData(telegramId: number): Promise<{
    user: any;
    listings: any[];
    sessions: any[];
    premiumFeatures: any[];
    moderationHistory: any[];
  }> {
    const [user, listings, sessions, premiumFeatures, moderationHistory] = await Promise.all([
      this.userModel.findByTelegramId(telegramId),
      this.listingModel.getUserListings(telegramId),
      this.sessionModel.getUserSessions(telegramId, false),
      this.premiumModel.getUserFeatures(telegramId),
      this.moderationModel.getUserActions(telegramId),
    ]);

    return {
      user: user || {},
      listings,
      sessions,
      premiumFeatures,
      moderationHistory,
    };
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(telegramId: number): Promise<UserPreferences> {
    // For now, return default preferences
    // In a real implementation, this would be stored in a separate preferences table
    return {
      notifications: {
        listingUpdates: true,
        messages: true,
        premiumExpiry: true,
        moderationActions: true,
      },
      privacy: {
        showUsername: true,
        showOnlineStatus: true,
        allowDirectContact: true,
      },
      display: {
        language: 'en',
        timezone: 'UTC',
        currency: 'USD',
      },
    };
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    telegramId: number,
    preferences: Partial<UserPreferences>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // In a real implementation, this would update a preferences table
      // For now, just validate that the user exists
      const user = await this.userModel.findByTelegramId(telegramId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Simulate saving preferences
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update preferences',
      };
    }
  }

  /**
   * Check if username is available
   */
  async isUsernameAvailable(username: string, excludeUserId?: number): Promise<boolean> {
    const existingUser = await this.userModel.findByUsername(username);
    if (!existingUser) return true;

    return excludeUserId ? existingUser.telegramId === excludeUserId : false;
  }

  /**
   * Search users (admin function)
   */
  async searchUsers(filters: any = {}, page = 1, limit = 50): Promise<any> {
    return await this.userModel.search(filters, page, limit);
  }

  /**
   * Get user statistics for admin
   */
  async getUserStats(): Promise<any> {
    return await this.userModel.getStats();
  }

  /**
   * Block/unblock user communication
   */
  async updateCommunicationStatus(
    telegramId: number,
    blocked: boolean,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // In a real implementation, this would update communication settings
      const user = await this.userModel.findByTelegramId(telegramId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Simulate updating communication status
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update communication status',
      };
    }
  }

  /**
   * Get user's contact information (for verified interactions)
   */
  async getContactInfo(telegramId: number): Promise<{
    username?: string;
    canContact: boolean;
    lastVerified?: string;
    restrictions: string[];
  }> {
    const user = await this.userModel.findByTelegramId(telegramId);
    if (!user) {
      throw new Error('User not found');
    }

    const moderation = await this.getUserModerationInfo(telegramId);
    const restrictions: string[] = [];

    if (user.isBanned) {
      restrictions.push('User is banned');
    }
    if (moderation.warningCount >= 3) {
      restrictions.push('User has multiple warnings');
    }

    const canContact = !user.isBanned && restrictions.length === 0;

    return {
      username: user.username || undefined,
      canContact,
      lastVerified: user.usernameVerifiedAt || undefined,
      restrictions,
    };
  }

  /**
   * Calculate profile completeness percentage
   */
  private calculateProfileCompleteness(user: any): number {
    let completeness = 0;
    const fields = [
      user.username, // 20%
      user.firstName, // 20%
      user.lastName, // 15%
      user.profilePhotoUrl, // 15%
      user.usernameVerifiedAt, // 30%
    ];

    const weights = [20, 20, 15, 15, 30];

    fields.forEach((field, index) => {
      if (field) {
        completeness += weights[index];
      }
    });

    return Math.min(100, completeness);
  }

  /**
   * Calculate reputation score
   */
  private calculateReputationScore(
    user: any,
    activity: UserActivity,
    moderation: UserModerationInfo
  ): number {
    let score = 50; // Base score

    // Positive factors
    score += Math.min(20, activity.totalListings * 2); // Up to 20 points for listings
    score += Math.min(15, activity.soldListings * 3); // Up to 15 points for sales
    score += Math.min(10, activity.premiumFeaturesUsed * 2); // Up to 10 points for premium usage
    score += Math.min(5, Math.floor(activity.daysSinceJoined / 30)); // Account age bonus

    // Negative factors
    score -= moderation.warningCount * 10; // -10 per warning
    if (moderation.isBanned) score -= 30; // -30 for ban
    score -= moderation.moderationHistory.length * 5; // -5 per moderation action

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Validate profile update data
   */
  private validateProfileUpdates(updates: Partial<UpdateUser>): string[] {
    const errors: string[] = [];

    if (updates.username !== undefined) {
      if (updates.username && updates.username.length > 32) {
        errors.push('Username cannot exceed 32 characters');
      }
      if (updates.username && !/^[a-zA-Z0-9_]+$/.test(updates.username)) {
        errors.push('Username can only contain letters, numbers, and underscores');
      }
    }

    if (updates.firstName !== undefined) {
      if (!updates.firstName || updates.firstName.trim().length === 0) {
        errors.push('First name is required');
      }
      if (updates.firstName && updates.firstName.length > 64) {
        errors.push('First name cannot exceed 64 characters');
      }
    }

    if (updates.lastName !== undefined && updates.lastName) {
      if (updates.lastName.length > 64) {
        errors.push('Last name cannot exceed 64 characters');
      }
    }

    return errors;
  }

  /**
   * Check if user exists
   */
  async exists(telegramId: number): Promise<boolean> {
    return await this.userModel.exists(telegramId);
  }

  /**
   * Get user by ID
   */
  async findById(telegramId: number): Promise<any> {
    return await this.userModel.findByTelegramId(telegramId);
  }

  /**
   * Get user by username
   */
  async findByUsername(username: string): Promise<any> {
    return await this.userModel.findByUsername(username);
  }
}
