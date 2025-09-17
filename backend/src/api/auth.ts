import { Context } from 'hono';
import { AuthService } from '../services/auth-service';
import { UserService } from '../services/user-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Auth API Endpoints - T064
 *
 * Handles Telegram WebApp authentication with comprehensive validation:
 * - POST /api/auth - Authenticate user with Telegram initData
 * - Validates Telegram WebApp authentication data
 * - Creates or updates user profile
 * - Issues session tokens for API access
 * - Handles development mode auth bypass
 */

export interface AuthRequest {
  initData: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    telegramId: string;
    firstName: string;
    lastName?: string;
    username?: string;
    photoUrl?: string;
    isPremium: boolean;
    isAdmin: boolean;
  };
  token?: string;
  expiresIn?: number;
  error?: string;
}

export class AuthAPI {
  private authService: AuthService;
  private userService: UserService;

  constructor(db: DrizzleD1Database, botToken: string) {
    this.authService = new AuthService(db, botToken);
    this.userService = new UserService(db);
  }

  /**
   * POST /api/auth - Authenticate user with Telegram WebApp data
   */
  async authenticateUser(c: Context): Promise<Response> {
    try {
      const body = (await c.req.json()) as AuthRequest;

      if (!body.initData) {
        return c.json(
          {
            success: false,
            error: 'Missing initData parameter',
          },
          400
        );
      }

      // Get request metadata
      const userAgent = c.req.header('User-Agent') || body.userAgent;
      const ipAddress =
        c.req.header('CF-Connecting-IP') ||
        c.req.header('X-Forwarded-For') ||
        body.ipAddress ||
        'unknown';

      // Authenticate with Telegram
      const authResult = await this.authService.authenticateTelegram(
        { initData: body.initData },
        userAgent,
        ipAddress
      );

      if (!authResult.success) {
        return c.json(
          {
            success: false,
            error: authResult.error || 'Authentication failed',
          },
          401
        );
      }

      if (!authResult.user) {
        return c.json(
          {
            success: false,
            error: 'No user data received from authentication',
          },
          500
        );
      }

      // Get full user profile
      const userProfile = await this.userService.getProfile(parseInt(authResult.user.telegramId));

      if (!userProfile) {
        return c.json(
          {
            success: false,
            error: 'Failed to retrieve user profile',
          },
          500
        );
      }

      // Check if user is banned
      if (userProfile.isBanned) {
        return c.json(
          {
            success: false,
            error: 'Account is suspended',
            user: {
              id: userProfile.id,
              telegramId: authResult.user.telegramId,
              firstName: userProfile.firstName,
              lastName: userProfile.lastName,
              username: userProfile.username,
              photoUrl: userProfile.profilePhotoUrl,
              isPremium: userProfile.isPremium,
              isAdmin: userProfile.isAdmin,
            },
          },
          403
        );
      }

      const response: AuthResponse = {
        success: true,
        user: {
          id: userProfile.id,
          telegramId: authResult.user.telegramId,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          username: userProfile.username,
          photoUrl: userProfile.profilePhotoUrl,
          isPremium: userProfile.isPremium,
          isAdmin: userProfile.isAdmin,
        },
        token: authResult.token,
        expiresIn: authResult.expiresIn,
      };

      // Set cookie for browser sessions
      if (authResult.token) {
        c.header(
          'Set-Cookie',
          `auth-token=${authResult.token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${authResult.expiresIn || 86400}`
        );
      }

      return c.json(response);
    } catch (error) {
      console.error('Auth endpoint error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error during authentication',
        },
        500
      );
    }
  }

  /**
   * GET /api/auth/validate - Validate existing session token
   */
  async validateSession(c: Context): Promise<Response> {
    try {
      const authHeader = c.req.header('Authorization');
      const cookieToken = c.req.cookie('auth-token');

      const token = authHeader?.replace('Bearer ', '') || cookieToken;

      if (!token) {
        return c.json(
          {
            success: false,
            error: 'No token provided',
          },
          401
        );
      }

      const validationResult = await this.authService.validateSession(token);

      if (!validationResult.success) {
        return c.json(
          {
            success: false,
            error: validationResult.error || 'Invalid token',
          },
          401
        );
      }

      if (!validationResult.user) {
        return c.json(
          {
            success: false,
            error: 'User not found',
          },
          404
        );
      }

      // Get updated user profile
      const userProfile = await this.userService.getProfile(
        parseInt(validationResult.user.telegramId)
      );

      if (!userProfile) {
        return c.json(
          {
            success: false,
            error: 'User profile not found',
          },
          404
        );
      }

      return c.json({
        success: true,
        user: {
          id: userProfile.id,
          telegramId: validationResult.user.telegramId,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          username: userProfile.username,
          photoUrl: userProfile.profilePhotoUrl,
          isPremium: userProfile.isPremium,
          isAdmin: userProfile.isAdmin,
        },
        remainingTime: validationResult.remainingTime,
      });
    } catch (error) {
      console.error('Session validation error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error during validation',
        },
        500
      );
    }
  }

  /**
   * POST /api/auth/refresh - Refresh session token
   */
  async refreshSession(c: Context): Promise<Response> {
    try {
      const authHeader = c.req.header('Authorization');
      const cookieToken = c.req.cookie('auth-token');

      const token = authHeader?.replace('Bearer ', '') || cookieToken;

      if (!token) {
        return c.json(
          {
            success: false,
            error: 'No token provided',
          },
          401
        );
      }

      const refreshResult = await this.authService.refreshSession(token);

      if (!refreshResult.success) {
        return c.json(
          {
            success: false,
            error: refreshResult.error || 'Token refresh failed',
          },
          401
        );
      }

      // Set new cookie
      if (refreshResult.token) {
        c.header(
          'Set-Cookie',
          `auth-token=${refreshResult.token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${refreshResult.expiresIn || 86400}`
        );
      }

      return c.json({
        success: true,
        token: refreshResult.token,
        expiresIn: refreshResult.expiresIn,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error during token refresh',
        },
        500
      );
    }
  }

  /**
   * POST /api/auth/logout - Logout and invalidate session
   */
  async logout(c: Context): Promise<Response> {
    try {
      const authHeader = c.req.header('Authorization');
      const cookieToken = c.req.cookie('auth-token');

      const token = authHeader?.replace('Bearer ', '') || cookieToken;

      if (token) {
        // Invalidate session in database
        await this.authService.invalidateSession(token);
      }

      // Clear cookie
      c.header('Set-Cookie', 'auth-token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0');

      return c.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('Logout error:', error);
      return c.json(
        {
          success: false,
          error: 'Internal server error during logout',
        },
        500
      );
    }
  }
}

/**
 * Setup auth routes with Hono
 */
export function setupAuthRoutes(app: any, db: DrizzleD1Database, botToken: string) {
  const authAPI = new AuthAPI(db, botToken);

  app.post('/api/auth', (c: Context) => authAPI.authenticateUser(c));
  app.get('/api/auth/validate', (c: Context) => authAPI.validateSession(c));
  app.post('/api/auth/refresh', (c: Context) => authAPI.refreshSession(c));
  app.post('/api/auth/logout', (c: Context) => authAPI.logout(c));
}
