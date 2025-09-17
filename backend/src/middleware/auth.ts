import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { UserService } from '../services/user-service';
import { KVCacheService } from '../services/kv-cache-service';

/**
 * Auth Middleware - T097
 *
 * Provides authentication and session validation for protected routes.
 * Supports JWT tokens, session management, and user context injection.
 */

export interface AuthContext {
  user: {
    id: number;
    telegramId: number;
    username?: string;
    firstName: string;
    lastName?: string;
    isAdmin: boolean;
    isBanned: boolean;
  };
  sessionId: string;
  tokenExp: number;
}

export interface AuthMiddlewareOptions {
  jwtSecret: string;
  adminId?: number;
  cache?: KVCacheService;
  userService?: UserService;
  skipPaths?: string[];
  requireAdmin?: boolean;
  allowBanned?: boolean;
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  return async (c: Context, next: Next) => {
    // Skip authentication for certain paths
    if (options.skipPaths?.some(path => c.req.path.startsWith(path))) {
      return next();
    }

    try {
      // Extract token from Authorization header
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Authorization token required' }, 401);
      }

      const token = authHeader.substring(7);

      // Check if token is blacklisted (if cache is available)
      if (options.cache) {
        const blacklistKey = `blacklist:${token}`;
        const isBlacklisted = await options.cache.has(blacklistKey);
        if (isBlacklisted) {
          return c.json({ error: 'Token has been revoked' }, 401);
        }
      }

      // Verify JWT token
      const payload = await verify(token, options.jwtSecret);
      if (!payload || typeof payload !== 'object') {
        return c.json({ error: 'Invalid token' }, 401);
      }

      // Extract user information from token
      const { userId, telegramId, sessionId, exp, iat } = payload as any;

      if (!userId || !telegramId) {
        return c.json({ error: 'Invalid token payload' }, 401);
      }

      // Check token expiration
      const now = Math.floor(Date.now() / 1000);
      if (exp && exp < now) {
        return c.json({ error: 'Token expired' }, 401);
      }

      // Get user details (use cache if available)
      let user;
      if (options.cache && options.userService) {
        const userKey = options.cache.generateKey('user', userId);
        user = await options.cache.get(
          userKey,
          () => options.userService!.findByTelegramId(telegramId),
          { ttl: 3600 } // Cache for 1 hour
        );
      } else if (options.userService) {
        user = await options.userService.findByTelegramId(telegramId);
      } else {
        // Fallback - create user object from token
        user = {
          id: userId,
          telegramId,
          isAdmin: telegramId === options.adminId,
          isBanned: false,
        };
      }

      if (!user) {
        return c.json({ error: 'User not found' }, 401);
      }

      // Check if user is banned (unless explicitly allowed)
      if (user.isBanned && !options.allowBanned) {
        return c.json({ error: 'User account is banned' }, 403);
      }

      // Check admin requirement
      if (options.requireAdmin && !user.isAdmin) {
        return c.json({ error: 'Admin access required' }, 403);
      }

      // Validate session if sessionId is provided
      if (sessionId && options.userService) {
        const sessionValid = await options.userService.validateSession(sessionId, userId);
        if (!sessionValid) {
          return c.json({ error: 'Invalid session' }, 401);
        }
      }

      // Create auth context
      const authContext: AuthContext = {
        user: {
          id: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName || '',
          lastName: user.lastName,
          isAdmin: user.isAdmin || telegramId === options.adminId,
          isBanned: user.isBanned || false,
        },
        sessionId: sessionId || '',
        tokenExp: exp || 0,
      };

      // Attach auth context to request
      c.set('auth', authContext);
      c.set('user', authContext.user);

      // Update last activity (if cache is available)
      if (options.cache) {
        const activityKey = options.cache.generateKey('activity', userId);
        await options.cache.set(activityKey, Date.now(), { ttl: 86400 }); // 24 hours
      }

      return next();
    } catch (error) {
      console.error('Auth middleware error:', error);

      if (error instanceof Error) {
        if (error.message.includes('expired') || error.message.includes('invalid')) {
          return c.json({ error: 'Authentication failed' }, 401);
        }
      }

      return c.json({ error: 'Internal authentication error' }, 500);
    }
  };
}

/**
 * Optional authentication middleware (doesn't require auth but extracts if present)
 */
export function createOptionalAuthMiddleware(options: AuthMiddlewareOptions) {
  return async (c: Context, next: Next) => {
    try {
      const authHeader = c.req.header('Authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No auth provided, continue without user context
        return next();
      }

      // Try to authenticate, but don't fail if invalid
      const authMiddleware = createAuthMiddleware(options);
      try {
        return await authMiddleware(c, next);
      } catch {
        // Auth failed, continue without user context
        return next();
      }
    } catch {
      // Any error, continue without user context
      return next();
    }
  };
}

/**
 * Admin-only middleware
 */
export function createAdminMiddleware(options: AuthMiddlewareOptions) {
  return createAuthMiddleware({
    ...options,
    requireAdmin: true,
  });
}

/**
 * Rate limiting middleware for authentication attempts
 */
export function createAuthRateLimitMiddleware(
  cache: KVCacheService,
  maxAttempts = 5,
  windowMs = 300000
) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const key = cache.generateKey('auth_attempts', ip);

    try {
      const attempts = (await cache.get<number>(key)) || 0;

      if (attempts >= maxAttempts) {
        return c.json(
          {
            error: 'Too many authentication attempts',
            retryAfter: Math.ceil(windowMs / 1000),
          },
          429
        );
      }

      // Continue with request
      await next();

      // If we get here and the response is 401, increment attempts
      if (c.res.status === 401) {
        await cache.set(key, attempts + 1, { ttl: Math.ceil(windowMs / 1000) });
      }
    } catch (error) {
      console.error('Auth rate limit error:', error);
      // Don't block request on rate limit errors
      return next();
    }
  };
}

/**
 * Token blacklist middleware
 */
export function createTokenBlacklistMiddleware(cache: KVCacheService) {
  return {
    /**
     * Blacklist a token
     */
    async blacklistToken(token: string, reason = 'revoked'): Promise<void> {
      const key = cache.generateKey('blacklist', token);
      await cache.set(key, { reason, blacklistedAt: Date.now() }, { ttl: 86400 * 7 }); // 7 days
    },

    /**
     * Check if token is blacklisted
     */
    async isTokenBlacklisted(token: string): Promise<boolean> {
      const key = cache.generateKey('blacklist', token);
      return await cache.has(key);
    },

    /**
     * Clear blacklist for user (e.g., on password change)
     */
    async clearUserTokens(userId: number): Promise<void> {
      const pattern = cache.generateKey('blacklist', '*');
      await cache.invalidatePattern(pattern);
    },
  };
}

/**
 * Session management utilities
 */
export class SessionManager {
  private cache: KVCacheService;
  private sessionTTL: number;

  constructor(cache: KVCacheService, sessionTTL = 86400 * 7) {
    // 7 days default
    this.cache = cache;
    this.sessionTTL = sessionTTL;
  }

  /**
   * Create a new session
   */
  async createSession(userId: number, metadata: any = {}): Promise<string> {
    const sessionId = this.generateSessionId();
    const sessionKey = this.cache.generateKey('session', sessionId);

    const sessionData = {
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      metadata,
    };

    await this.cache.set(sessionKey, sessionData, { ttl: this.sessionTTL });
    return sessionId;
  }

  /**
   * Validate and refresh session
   */
  async validateSession(sessionId: string, userId: number): Promise<boolean> {
    const sessionKey = this.cache.generateKey('session', sessionId);
    const sessionData = await this.cache.get<any>(sessionKey);

    if (!sessionData || sessionData.userId !== userId) {
      return false;
    }

    // Update last activity
    sessionData.lastActivity = Date.now();
    await this.cache.set(sessionKey, sessionData, { ttl: this.sessionTTL });

    return true;
  }

  /**
   * Destroy session
   */
  async destroySession(sessionId: string): Promise<void> {
    const sessionKey = this.cache.generateKey('session', sessionId);
    await this.cache.delete(sessionKey);
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<any | null> {
    const sessionKey = this.cache.generateKey('session', sessionId);
    return await this.cache.get(sessionKey);
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

/**
 * Helper to get authenticated user from context
 */
export function getAuthenticatedUser(c: Context): AuthContext['user'] | null {
  return c.get('user') || null;
}

/**
 * Helper to get full auth context
 */
export function getAuthContext(c: Context): AuthContext | null {
  return c.get('auth') || null;
}

/**
 * Helper to check if user is admin
 */
export function isAdmin(c: Context): boolean {
  const user = getAuthenticatedUser(c);
  return user?.isAdmin || false;
}

/**
 * Helper to require authentication
 */
export function requireAuth(c: Context): AuthContext['user'] {
  const user = getAuthenticatedUser(c);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}
