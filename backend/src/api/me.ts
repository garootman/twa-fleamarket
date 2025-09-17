import { Context } from 'hono';
import { UserService } from '../services/user-service';
import { ListingService } from '../services/listing-service';
import { PremiumService } from '../services/premium-service';
import { AuthService } from '../services/auth-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * User Profile API Endpoints - T065 & T074
 *
 * Handles user profile and personal data endpoints:
 * - GET /api/me - Get current user profile with stats
 * - PUT /api/me - Update user profile
 * - GET /api/me/listings - Get user's listings with detailed stats
 * - DELETE /api/me - Delete user account (GDPR compliance)
 */

export interface UserProfileResponse {
  success: boolean;
  user?: {
    id: string;
    telegramId: string;
    firstName: string;
    lastName?: string;
    username?: string;
    profilePhotoUrl?: string;
    languageCode: string;
    isPremium: boolean;
    isAdmin: boolean;
    isBanned: boolean;
    banReason?: string;
    warningCount: number;
    verifiedAt?: string;
    createdAt: string;
    lastActiveAt: string;
  };
  stats?: {
    totalListings: number;
    activeListings: number;
    viewsReceived: number;
    messagesReceived: number;
    successfulSales: number;
    averageRating: number;
    membershipDays: number;
    premiumFeatures: number;
  };
  error?: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  profilePhotoUrl?: string;
}

export interface UserListingsResponse {
  success: boolean;
  listings?: Array<{
    id: string;
    title: string;
    description: string;
    priceUsd: number;
    status: string;
    categoryId: number;
    categoryName: string;
    images: string[];
    viewCount: number;
    messageCount: number;
    flagCount: number;
    createdAt: string;
    updatedAt: string;
    bumpedAt?: string;
    featuredUntil?: string;
    isPremium: boolean;
  }>;
  stats?: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    flagged: number;
    featured: number;
    totalViews: number;
    totalMessages: number;
  };
  error?: string;
}

export class MeAPI {
  private userService: UserService;
  private listingService: ListingService;
  private premiumService: PremiumService;
  private authService: AuthService;

  constructor(db: DrizzleD1Database, botToken: string) {
    this.userService = new UserService(db);
    this.listingService = new ListingService(db);
    this.premiumService = new PremiumService(db);
    this.authService = new AuthService(db, botToken);
  }

  /**
   * GET /api/me - Get current user profile with comprehensive stats
   */
  async getUserProfile(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      // Get user profile
      const profile = await this.userService.getProfile(parseInt(user.telegramId));
      if (!profile) {
        return c.json({
          success: false,
          error: 'User profile not found'
        }, 404);
      }

      // Get user statistics
      const userStats = await this.getUserStats(parseInt(user.telegramId));

      const response: UserProfileResponse = {
        success: true,
        user: {
          id: profile.id,
          telegramId: user.telegramId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          username: profile.username,
          profilePhotoUrl: profile.profilePhotoUrl,
          languageCode: profile.languageCode,
          isPremium: profile.isPremium,
          isAdmin: profile.isAdmin,
          isBanned: profile.isBanned,
          banReason: profile.banReason,
          warningCount: profile.warningCount,
          verifiedAt: profile.usernameVerifiedAt,
          createdAt: profile.createdAt,
          lastActiveAt: profile.lastActiveAt,
        },
        stats: userStats,
      };

      return c.json(response);

    } catch (error) {
      console.error('Get user profile error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * PUT /api/me - Update user profile
   */
  async updateUserProfile(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      const body = await c.req.json() as UpdateProfileRequest;

      // Validate input
      const validationErrors: string[] = [];

      if (body.firstName !== undefined) {
        if (!body.firstName.trim() || body.firstName.length > 64) {
          validationErrors.push('First name must be 1-64 characters');
        }
      }

      if (body.lastName !== undefined && body.lastName && body.lastName.length > 64) {
        validationErrors.push('Last name must be 64 characters or less');
      }

      if (body.languageCode !== undefined && body.languageCode && !/^[a-z]{2}(-[A-Z]{2})?$/.test(body.languageCode)) {
        validationErrors.push('Invalid language code format');
      }

      if (body.profilePhotoUrl !== undefined && body.profilePhotoUrl && !this.isValidUrl(body.profilePhotoUrl)) {
        validationErrors.push('Invalid profile photo URL');
      }

      if (validationErrors.length > 0) {
        return c.json({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        }, 400);
      }

      // Update profile
      const updateResult = await this.userService.updateProfile(parseInt(user.telegramId), body);

      if (!updateResult.success) {
        return c.json({
          success: false,
          error: updateResult.error || 'Failed to update profile'
        }, 400);
      }

      // Return updated profile
      return this.getUserProfile(c);

    } catch (error) {
      console.error('Update user profile error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * GET /api/me/listings - Get user's listings with detailed stats
   */
  async getUserListings(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      const page = parseInt(c.req.query('page') || '1');
      const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
      const status = c.req.query('status'); // active, draft, archived, all

      // Get user's listings
      const listingsResult = await this.listingService.getUserListings(
        parseInt(user.telegramId),
        page,
        limit,
        status
      );

      if (!listingsResult.success) {
        return c.json({
          success: false,
          error: listingsResult.error || 'Failed to fetch listings'
        }, 400);
      }

      // Calculate detailed stats
      const stats = await this.calculateListingStats(parseInt(user.telegramId));

      const response: UserListingsResponse = {
        success: true,
        listings: listingsResult.listings?.map(listing => ({
          id: listing.id,
          title: listing.title,
          description: listing.description,
          priceUsd: listing.priceUsd,
          status: listing.status,
          categoryId: listing.categoryId,
          categoryName: listing.category?.name || 'Unknown',
          images: listing.images || [],
          viewCount: listing.viewCount,
          messageCount: listing.messageCount || 0,
          flagCount: listing.flags?.length || 0,
          createdAt: listing.createdAt,
          updatedAt: listing.updatedAt,
          bumpedAt: listing.bumpedAt,
          featuredUntil: listing.featuredUntil,
          isPremium: !!listing.featuredUntil || !!listing.bumpedAt,
        })),
        stats,
      };

      return c.json(response);

    } catch (error) {
      console.error('Get user listings error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * DELETE /api/me - Delete user account (GDPR compliance)
   */
  async deleteUserAccount(c: Context): Promise<Response> {
    try {
      const user = await this.getCurrentUser(c);
      if (!user) {
        return c.json({
          success: false,
          error: 'Authentication required'
        }, 401);
      }

      const body = await c.req.json() as { confirmation: string; reason?: string };

      if (body.confirmation !== 'DELETE_MY_ACCOUNT') {
        return c.json({
          success: false,
          error: 'Account deletion requires confirmation string: DELETE_MY_ACCOUNT'
        }, 400);
      }

      // Delete user account
      const deleteResult = await this.userService.deleteAccount(
        parseInt(user.telegramId),
        body.reason || 'User requested account deletion'
      );

      if (!deleteResult.success) {
        return c.json({
          success: false,
          error: deleteResult.error || 'Failed to delete account'
        }, 400);
      }

      // Invalidate all user sessions
      await this.authService.invalidateAllUserSessions(parseInt(user.telegramId));

      return c.json({
        success: true,
        message: 'Account deleted successfully'
      });

    } catch (error) {
      console.error('Delete user account error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * Private helper methods
   */
  private async getCurrentUser(c: Context): Promise<{ telegramId: string } | null> {
    const authHeader = c.req.header('Authorization');
    const cookieToken = c.req.cookie('auth-token');

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) return null;

    const validation = await this.authService.validateSession(token);
    return validation.success ? validation.user : null;
  }

  private async getUserStats(telegramId: number): Promise<{
    totalListings: number;
    activeListings: number;
    viewsReceived: number;
    messagesReceived: number;
    successfulSales: number;
    averageRating: number;
    membershipDays: number;
    premiumFeatures: number;
  }> {
    try {
      // Get listing stats
      const listingStats = await this.listingService.getUserStats(telegramId);

      // Get premium features count
      const premiumProfile = await this.premiumService.getUserPremiumProfile(telegramId);

      // Get user profile for membership calculation
      const profile = await this.userService.getProfile(telegramId);
      const membershipDays = profile ?
        Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

      return {
        totalListings: listingStats.totalListings || 0,
        activeListings: listingStats.activeListings || 0,
        viewsReceived: listingStats.totalViews || 0,
        messagesReceived: listingStats.totalMessages || 0,
        successfulSales: listingStats.successfulSales || 0,
        averageRating: listingStats.averageRating || 0,
        membershipDays,
        premiumFeatures: premiumProfile.activeFeatures.length,
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return {
        totalListings: 0,
        activeListings: 0,
        viewsReceived: 0,
        messagesReceived: 0,
        successfulSales: 0,
        averageRating: 0,
        membershipDays: 0,
        premiumFeatures: 0,
      };
    }
  }

  private async calculateListingStats(telegramId: number) {
    try {
      const stats = await this.listingService.getUserStats(telegramId);

      return {
        total: stats.totalListings || 0,
        active: stats.activeListings || 0,
        draft: stats.draftListings || 0,
        archived: stats.archivedListings || 0,
        flagged: stats.flaggedListings || 0,
        featured: stats.featuredListings || 0,
        totalViews: stats.totalViews || 0,
        totalMessages: stats.totalMessages || 0,
      };
    } catch (error) {
      console.error('Error calculating listing stats:', error);
      return {
        total: 0,
        active: 0,
        draft: 0,
        archived: 0,
        flagged: 0,
        featured: 0,
        totalViews: 0,
        totalMessages: 0,
      };
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('https://') && url.length <= 2048;
    } catch {
      return false;
    }
  }
}

/**
 * Setup me routes with Hono
 */
export function setupMeRoutes(app: any, db: DrizzleD1Database, botToken: string) {
  const meAPI = new MeAPI(db, botToken);

  app.get('/api/me', (c: Context) => meAPI.getUserProfile(c));
  app.put('/api/me', (c: Context) => meAPI.updateUserProfile(c));
  app.get('/api/me/listings', (c: Context) => meAPI.getUserListings(c));
  app.delete('/api/me', (c: Context) => meAPI.deleteUserAccount(c));
}