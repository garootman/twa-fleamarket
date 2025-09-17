import { Context } from 'hono';
import { AdminService } from '../services/admin-service';
import { ModerationService } from '../services/moderation-service';
import { AuthService } from '../services/auth-service';
import { UserService } from '../services/user-service';
import { ListingService } from '../services/listing-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Admin API Endpoints - T078-T083
 *
 * Comprehensive admin management API:
 * - GET /api/admin/listings - Get all listings with moderation info
 * - POST /api/admin/listings/{id}/stick - Stick/pin listing
 * - POST /api/admin/users/{id}/ban - Ban user account
 * - POST /api/admin/users/{id}/unban - Unban user account
 * - GET /api/admin/blocked-words - Get blocked words list
 * - POST /api/admin/blocked-words - Add blocked word
 * - DELETE /api/admin/blocked-words/{id} - Remove blocked word
 * - GET /api/admin/dashboard - Get admin dashboard data
 * - GET /api/admin/flags - Get content moderation flags
 * - POST /api/admin/flags/{id}/resolve - Resolve moderation flag
 */

export interface AdminListingsResponse {
  success: boolean;
  listings?: Array<{
    id: string;
    title: string;
    description: string;
    priceUsd: number;
    status: string;
    categoryName: string;
    viewCount: number;
    flagCount: number;
    isSticky: boolean;
    isFeatured: boolean;
    createdAt: string;
    user: {
      id: string;
      firstName: string;
      username?: string;
      telegramId: string;
      isBanned: boolean;
    };
    moderationInfo: {
      autoModerationScore: number;
      requiresReview: boolean;
      flagReasons: string[];
      lastReviewedAt?: string;
      reviewedBy?: string;
    };
  }>;
  pagination?: {
    page: number;
    limit: number;
    totalPages: number;
    totalCount: number;
  };
  filters?: {
    status?: string;
    flagged?: boolean;
    sticky?: boolean;
    category?: number;
  };
  error?: string;
}

export interface BanUserRequest {
  reason: string;
  duration?: number; // days, permanent if not specified
  deleteContent?: boolean;
  notifyUser?: boolean;
}

export interface BlockedWordsResponse {
  success: boolean;
  words?: Array<{
    id: number;
    word: string;
    category: 'PROFANITY' | 'SPAM' | 'SCAM' | 'INAPPROPRIATE' | 'CUSTOM';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    isActive: boolean;
    createdAt: string;
    createdBy: string;
  }>;
  totalCount?: number;
  categories?: Record<string, number>;
  error?: string;
}

export interface AddBlockedWordRequest {
  word: string;
  category: 'PROFANITY' | 'SPAM' | 'SCAM' | 'INAPPROPRIATE' | 'CUSTOM';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description?: string;
}

export interface AdminDashboardResponse {
  success: boolean;
  dashboard?: {
    stats: {
      totalUsers: number;
      activeUsers24h: number;
      totalListings: number;
      activeListings: number;
      flaggedContent: number;
      bannedUsers: number;
      pendingReviews: number;
      systemHealth: 'GOOD' | 'WARNING' | 'CRITICAL';
    };
    recentActivity: Array<{
      id: string;
      type: 'USER_REGISTERED' | 'LISTING_CREATED' | 'CONTENT_FLAGGED' | 'USER_BANNED' | 'LISTING_APPROVED';
      description: string;
      timestamp: string;
      userId?: string;
      listingId?: string;
    }>;
    moderationQueue: Array<{
      id: string;
      type: 'LISTING' | 'USER' | 'MESSAGE';
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      reason: string;
      createdAt: string;
      reportedBy?: string;
    }>;
    systemAlerts: Array<{
      id: string;
      level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
      message: string;
      timestamp: string;
      resolved: boolean;
    }>;
  };
  error?: string;
}

export class AdminAPI {
  private adminService: AdminService;
  private moderationService: ModerationService;
  private authService: AuthService;
  private userService: UserService;
  private listingService: ListingService;

  constructor(db: DrizzleD1Database, botToken: string) {
    this.adminService = new AdminService(db);
    this.moderationService = new ModerationService(db);
    this.authService = new AuthService(db, botToken);
    this.userService = new UserService(db);
    this.listingService = new ListingService(db);
  }

  /**
   * GET /api/admin/listings - Get all listings with moderation info
   */
  async getAllListings(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20')));
      const status = c.req.query('status'); // all, active, flagged, draft, archived
      const flagged = c.req.query('flagged') === 'true';
      const sticky = c.req.query('sticky') === 'true';
      const categoryId = c.req.query('category') ? parseInt(c.req.query('category')!) : undefined;

      const filters = {
        status: status || 'all',
        flagged,
        sticky,
        categoryId,
      };

      // Get listings with admin context
      const listingsResult = await this.adminService.getAllListings(filters, page, limit);

      if (!listingsResult.success) {
        return c.json({
          success: false,
          error: listingsResult.error || 'Failed to fetch listings'
        }, 500);
      }

      const response: AdminListingsResponse = {
        success: true,
        listings: listingsResult.listings?.map(listing => ({
          id: listing.id,
          title: listing.title,
          description: listing.description.substring(0, 200) + (listing.description.length > 200 ? '...' : ''),
          priceUsd: listing.priceUsd,
          status: listing.status,
          categoryName: listing.category?.name || 'Unknown',
          viewCount: listing.viewCount,
          flagCount: listing.flags?.length || 0,
          isSticky: listing.isSticky || false,
          isFeatured: !!listing.featuredUntil && new Date(listing.featuredUntil) > new Date(),
          createdAt: listing.createdAt,
          user: {
            id: listing.user?.id || '',
            firstName: listing.user?.firstName || 'User',
            username: listing.user?.username,
            telegramId: listing.user?.telegramId || '',
            isBanned: listing.user?.banned || false,
          },
          moderationInfo: {
            autoModerationScore: listing.moderationScore || 0,
            requiresReview: (listing.flags?.length || 0) > 0 || (listing.moderationScore || 0) > 0.7,
            flagReasons: listing.flags?.map(flag => flag.reason) || [],
            lastReviewedAt: listing.lastReviewedAt,
            reviewedBy: listing.reviewedBy,
          },
        })),
        pagination: {
          page,
          limit,
          totalPages: Math.ceil((listingsResult.totalCount || 0) / limit),
          totalCount: listingsResult.totalCount || 0,
        },
        filters,
      };

      return c.json(response);

    } catch (error) {
      console.error('Admin get all listings error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * POST /api/admin/listings/{id}/stick - Stick/pin listing
   */
  async stickListing(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      const listingId = c.req.param('id');
      const body = await c.req.json() as { stick: boolean; reason?: string };

      if (!listingId) {
        return c.json({
          success: false,
          error: 'Listing ID is required'
        }, 400);
      }

      const adminUser = await this.getCurrentUser(c);

      // Stick/unstick listing
      const result = await this.adminService.stickListing(
        listingId,
        body.stick,
        parseInt(adminUser!.telegramId),
        body.reason
      );

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error || 'Failed to update listing'
        }, 400);
      }

      return c.json({
        success: true,
        message: body.stick ? 'Listing pinned successfully' : 'Listing unpinned successfully',
        listing: result.listing
      });

    } catch (error) {
      console.error('Admin stick listing error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * POST /api/admin/users/{id}/ban - Ban user account
   */
  async banUser(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      const userId = c.req.param('id');
      const body = await c.req.json() as BanUserRequest;

      if (!userId) {
        return c.json({
          success: false,
          error: 'User ID is required'
        }, 400);
      }

      if (!body.reason || !body.reason.trim()) {
        return c.json({
          success: false,
          error: 'Ban reason is required'
        }, 400);
      }

      const adminUser = await this.getCurrentUser(c);

      // Ban user
      const banResult = await this.adminService.banUser(
        userId,
        body.reason,
        parseInt(adminUser!.telegramId),
        body.duration,
        body.deleteContent || false
      );

      if (!banResult.success) {
        return c.json({
          success: false,
          error: banResult.error || 'Failed to ban user'
        }, 400);
      }

      // Notify user if requested
      if (body.notifyUser !== false) {
        await this.notifyUserBanned(userId, body.reason, body.duration);
      }

      return c.json({
        success: true,
        message: body.duration ?
          `User banned for ${body.duration} days` :
          'User permanently banned',
        user: banResult.user
      });

    } catch (error) {
      console.error('Admin ban user error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * POST /api/admin/users/{id}/unban - Unban user account
   */
  async unbanUser(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      const userId = c.req.param('id');
      const body = await c.req.json() as { reason?: string; notifyUser?: boolean };

      if (!userId) {
        return c.json({
          success: false,
          error: 'User ID is required'
        }, 400);
      }

      const adminUser = await this.getCurrentUser(c);

      // Unban user
      const unbanResult = await this.adminService.unbanUser(
        userId,
        parseInt(adminUser!.telegramId),
        body.reason || 'Ban lifted by admin'
      );

      if (!unbanResult.success) {
        return c.json({
          success: false,
          error: unbanResult.error || 'Failed to unban user'
        }, 400);
      }

      // Notify user if requested
      if (body.notifyUser !== false) {
        await this.notifyUserUnbanned(userId);
      }

      return c.json({
        success: true,
        message: 'User unbanned successfully',
        user: unbanResult.user
      });

    } catch (error) {
      console.error('Admin unban user error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * GET /api/admin/blocked-words - Get blocked words list
   */
  async getBlockedWords(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      const category = c.req.query('category');
      const isActive = c.req.query('active') !== 'false';
      const page = Math.max(1, parseInt(c.req.query('page') || '1'));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50')));

      // Get blocked words
      const wordsResult = await this.moderationService.getBlockedWords({
        category,
        isActive,
        page,
        limit,
      });

      if (!wordsResult.success) {
        return c.json({
          success: false,
          error: wordsResult.error || 'Failed to fetch blocked words'
        }, 500);
      }

      const response: BlockedWordsResponse = {
        success: true,
        words: wordsResult.words,
        totalCount: wordsResult.totalCount,
        categories: wordsResult.categories,
      };

      return c.json(response);

    } catch (error) {
      console.error('Admin get blocked words error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * POST /api/admin/blocked-words - Add blocked word
   */
  async addBlockedWord(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      const body = await c.req.json() as AddBlockedWordRequest;

      // Validate input
      if (!body.word || !body.word.trim()) {
        return c.json({
          success: false,
          error: 'Word is required'
        }, 400);
      }

      if (!body.category || !body.severity) {
        return c.json({
          success: false,
          error: 'Category and severity are required'
        }, 400);
      }

      const adminUser = await this.getCurrentUser(c);

      // Add blocked word
      const addResult = await this.moderationService.addBlockedWord(
        body.word.trim().toLowerCase(),
        body.category,
        body.severity,
        parseInt(adminUser!.telegramId),
        body.description
      );

      if (!addResult.success) {
        return c.json({
          success: false,
          error: addResult.error || 'Failed to add blocked word'
        }, 400);
      }

      return c.json({
        success: true,
        message: 'Blocked word added successfully',
        word: addResult.word
      }, 201);

    } catch (error) {
      console.error('Admin add blocked word error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * DELETE /api/admin/blocked-words/{id} - Remove blocked word
   */
  async removeBlockedWord(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      const wordId = parseInt(c.req.param('id'));

      if (isNaN(wordId)) {
        return c.json({
          success: false,
          error: 'Invalid word ID'
        }, 400);
      }

      const adminUser = await this.getCurrentUser(c);

      // Remove blocked word
      const removeResult = await this.moderationService.removeBlockedWord(
        wordId,
        parseInt(adminUser!.telegramId)
      );

      if (!removeResult.success) {
        return c.json({
          success: false,
          error: removeResult.error || 'Failed to remove blocked word'
        }, 400);
      }

      return c.json({
        success: true,
        message: 'Blocked word removed successfully'
      });

    } catch (error) {
      console.error('Admin remove blocked word error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * GET /api/admin/dashboard - Get admin dashboard data
   */
  async getDashboard(c: Context): Promise<Response> {
    try {
      if (!await this.validateAdmin(c)) {
        return this.unauthorizedResponse(c);
      }

      // Get dashboard data
      const dashboardData = await this.adminService.getDashboardData();

      if (!dashboardData.success) {
        return c.json({
          success: false,
          error: dashboardData.error || 'Failed to fetch dashboard data'
        }, 500);
      }

      const response: AdminDashboardResponse = {
        success: true,
        dashboard: dashboardData.dashboard,
      };

      return c.json(response);

    } catch (error) {
      console.error('Admin get dashboard error:', error);
      return c.json({
        success: false,
        error: 'Internal server error'
      }, 500);
    }
  }

  /**
   * Private helper methods
   */
  private async validateAdmin(c: Context): Promise<boolean> {
    const user = await this.getCurrentUser(c);
    if (!user) return false;

    // Check if user is admin
    const isAdmin = await this.adminService.isAdmin(parseInt(user.telegramId));
    return isAdmin;
  }

  private async getCurrentUser(c: Context): Promise<{ telegramId: string } | null> {
    const authHeader = c.req.header('Authorization');
    const cookieToken = c.req.cookie('auth-token');

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) return null;

    const validation = await this.authService.validateSession(token);
    return validation.success ? validation.user : null;
  }

  private unauthorizedResponse(c: Context): Response {
    return c.json({
      success: false,
      error: 'Admin access required'
    }, 403);
  }

  private async notifyUserBanned(userId: string, reason: string, duration?: number): Promise<void> {
    try {
      // In real implementation, this would send a notification via bot
      console.log(`User ${userId} banned: ${reason}${duration ? ` for ${duration} days` : ' permanently'}`);
    } catch (error) {
      console.error('Error notifying banned user:', error);
    }
  }

  private async notifyUserUnbanned(userId: string): Promise<void> {
    try {
      // In real implementation, this would send a notification via bot
      console.log(`User ${userId} unbanned`);
    } catch (error) {
      console.error('Error notifying unbanned user:', error);
    }
  }
}

/**
 * Setup admin routes with Hono
 */
export function setupAdminRoutes(app: any, db: DrizzleD1Database, botToken: string) {
  const adminAPI = new AdminAPI(db, botToken);

  app.get('/api/admin/listings', (c: Context) => adminAPI.getAllListings(c));
  app.post('/api/admin/listings/:id/stick', (c: Context) => adminAPI.stickListing(c));
  app.post('/api/admin/users/:id/ban', (c: Context) => adminAPI.banUser(c));
  app.post('/api/admin/users/:id/unban', (c: Context) => adminAPI.unbanUser(c));
  app.get('/api/admin/blocked-words', (c: Context) => adminAPI.getBlockedWords(c));
  app.post('/api/admin/blocked-words', (c: Context) => adminAPI.addBlockedWord(c));
  app.delete('/api/admin/blocked-words/:id', (c: Context) => adminAPI.removeBlockedWord(c));
  app.get('/api/admin/dashboard', (c: Context) => adminAPI.getDashboard(c));
}