import type { Context, Next } from 'hono';
import { getAuthenticatedUser } from './auth';

/**
 * Admin Middleware - T098
 *
 * Provides admin access control with ADMIN_ID environment variable check.
 * Includes admin validation, action logging, and permission management.
 */

export interface AdminContext {
  adminId: number;
  adminLevel: 'super' | 'admin' | 'moderator';
  permissions: string[];
  sessionStart: number;
}

export interface AdminMiddlewareOptions {
  adminId?: number;
  allowedAdminIds?: number[];
  requiredPermissions?: string[];
  logActions?: boolean;
  strictMode?: boolean;
}

/**
 * Admin permissions enum
 */
export const AdminPermissions = {
  // User management
  BAN_USERS: 'ban_users',
  UNBAN_USERS: 'unban_users',
  VIEW_USER_DETAILS: 'view_user_details',

  // Content moderation
  MODERATE_LISTINGS: 'moderate_listings',
  DELETE_LISTINGS: 'delete_listings',
  FEATURE_LISTINGS: 'feature_listings',

  // Content filtering
  MANAGE_BLOCKED_WORDS: 'manage_blocked_words',
  VIEW_FLAGS: 'view_flags',
  RESOLVE_FLAGS: 'resolve_flags',

  // System administration
  VIEW_ANALYTICS: 'view_analytics',
  MANAGE_CATEGORIES: 'manage_categories',
  SYSTEM_CONFIG: 'system_config',

  // Super admin only
  MANAGE_ADMINS: 'manage_admins',
  DATABASE_ACCESS: 'database_access',
  AUDIT_LOGS: 'audit_logs',
} as const;

/**
 * Default permission sets by admin level
 */
export const AdminLevelPermissions = {
  moderator: [
    AdminPermissions.VIEW_FLAGS,
    AdminPermissions.RESOLVE_FLAGS,
    AdminPermissions.MODERATE_LISTINGS,
    AdminPermissions.VIEW_USER_DETAILS,
  ],
  admin: [
    AdminPermissions.BAN_USERS,
    AdminPermissions.UNBAN_USERS,
    AdminPermissions.VIEW_USER_DETAILS,
    AdminPermissions.MODERATE_LISTINGS,
    AdminPermissions.DELETE_LISTINGS,
    AdminPermissions.FEATURE_LISTINGS,
    AdminPermissions.MANAGE_BLOCKED_WORDS,
    AdminPermissions.VIEW_FLAGS,
    AdminPermissions.RESOLVE_FLAGS,
    AdminPermissions.VIEW_ANALYTICS,
    AdminPermissions.MANAGE_CATEGORIES,
  ],
  super: Object.values(AdminPermissions),
};

/**
 * Create admin middleware with ADMIN_ID validation
 */
export function createAdminMiddleware(options: AdminMiddlewareOptions = {}) {
  return async (c: Context, next: Next) => {
    try {
      const user = getAuthenticatedUser(c);

      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      // Check if user is banned
      if (user.isBanned) {
        return c.json({ error: 'Access denied: User account is banned' }, 403);
      }

      // Get admin configuration from environment or options
      const adminId = options.adminId || parseInt(process.env.ADMIN_ID || '0');
      const allowedAdminIds = options.allowedAdminIds || (adminId ? [adminId] : []);

      // Validate admin access
      const isValidAdmin =
        user.isAdmin || user.telegramId === adminId || allowedAdminIds.includes(user.telegramId);

      if (!isValidAdmin) {
        // Log unauthorized access attempt
        console.warn(
          `Unauthorized admin access attempt by user ${user.telegramId} (${user.username})`
        );

        if (options.logActions) {
          await logAdminAction(c, {
            action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
            userId: user.id,
            telegramId: user.telegramId,
            path: c.req.path,
            method: c.req.method,
            success: false,
            timestamp: Date.now(),
          });
        }

        return c.json({ error: 'Admin access required' }, 403);
      }

      // Determine admin level
      const adminLevel = determineAdminLevel(user.telegramId, adminId, allowedAdminIds);
      const permissions = getAdminPermissions(adminLevel, options);

      // Check specific permissions if required
      if (options.requiredPermissions?.length) {
        const hasRequiredPermissions = options.requiredPermissions.every(permission =>
          permissions.includes(permission)
        );

        if (!hasRequiredPermissions) {
          console.warn(
            `Insufficient permissions for user ${user.telegramId}: required ${options.requiredPermissions}, has ${permissions}`
          );
          return c.json(
            {
              error: 'Insufficient permissions',
              required: options.requiredPermissions,
              current: permissions,
            },
            403
          );
        }
      }

      // Create admin context
      const adminContext: AdminContext = {
        adminId: user.telegramId,
        adminLevel,
        permissions,
        sessionStart: Date.now(),
      };

      // Attach admin context to request
      c.set('admin', adminContext);

      // Log admin action if enabled
      if (options.logActions) {
        await logAdminAction(c, {
          action: 'ADMIN_ACCESS',
          userId: user.id,
          telegramId: user.telegramId,
          adminLevel,
          path: c.req.path,
          method: c.req.method,
          success: true,
          timestamp: Date.now(),
        });
      }

      return next();
    } catch (error) {
      console.error('Admin middleware error:', error);
      return c.json({ error: 'Admin validation failed' }, 500);
    }
  };
}

/**
 * Create permission-specific middleware
 */
export function requirePermission(permission: string) {
  return createAdminMiddleware({
    requiredPermissions: [permission],
    logActions: true,
  });
}

/**
 * Create multiple permission middleware (requires ALL permissions)
 */
export function requirePermissions(permissions: string[]) {
  return createAdminMiddleware({
    requiredPermissions: permissions,
    logActions: true,
  });
}

/**
 * Super admin only middleware
 */
export function requireSuperAdmin() {
  return async (c: Context, next: Next) => {
    const adminMiddleware = createAdminMiddleware({
      strictMode: true,
      logActions: true,
    });

    await adminMiddleware(c, async () => {
      const adminContext = getAdminContext(c);

      if (!adminContext || adminContext.adminLevel !== 'super') {
        return c.json({ error: 'Super admin access required' }, 403);
      }

      return next();
    });
  };
}

/**
 * Determine admin level based on user ID
 */
function determineAdminLevel(
  userTelegramId: number,
  primaryAdminId: number,
  allowedAdminIds: number[]
): AdminContext['adminLevel'] {
  if (userTelegramId === primaryAdminId) {
    return 'super';
  }

  if (allowedAdminIds.includes(userTelegramId)) {
    return 'admin';
  }

  return 'moderator';
}

/**
 * Get permissions for admin level
 */
function getAdminPermissions(
  adminLevel: AdminContext['adminLevel'],
  options: AdminMiddlewareOptions
): string[] {
  const basePermissions = AdminLevelPermissions[adminLevel] || [];

  // In strict mode, only return exact permissions for level
  if (options.strictMode) {
    return basePermissions;
  }

  // Otherwise, include all permissions up to this level
  switch (adminLevel) {
    case 'super':
      return AdminLevelPermissions.super;
    case 'admin':
      return [...AdminLevelPermissions.moderator, ...AdminLevelPermissions.admin];
    case 'moderator':
      return AdminLevelPermissions.moderator;
    default:
      return [];
  }
}

/**
 * Log admin actions for audit trail
 */
async function logAdminAction(c: Context, actionData: any): Promise<void> {
  try {
    // In production, this would write to a dedicated audit log
    const logEntry = {
      ...actionData,
      ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For'),
      userAgent: c.req.header('User-Agent'),
      requestId: c.req.header('CF-Ray') || Math.random().toString(36),
    };

    console.log('Admin Action:', JSON.stringify(logEntry));

    // TODO: Store in database or external logging service
    // await storeAuditLog(logEntry);
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

/**
 * Admin action decorator for automatic logging
 */
export function logAdminAction(actionName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (c: Context, ...args: any[]) {
      const user = getAuthenticatedUser(c);
      const adminContext = getAdminContext(c);

      const startTime = Date.now();
      let success = false;
      let error = null;

      try {
        const result = await originalMethod.apply(this, [c, ...args]);
        success = true;
        return result;
      } catch (err) {
        error = err;
        throw err;
      } finally {
        // Log the action
        await logAdminAction(c, {
          action: actionName,
          userId: user?.id,
          telegramId: user?.telegramId,
          adminLevel: adminContext?.adminLevel,
          duration: Date.now() - startTime,
          success,
          error: error ? error.message : null,
          timestamp: Date.now(),
        });
      }
    };

    return descriptor;
  };
}

/**
 * Helper to get admin context from request
 */
export function getAdminContext(c: Context): AdminContext | null {
  return c.get('admin') || null;
}

/**
 * Helper to check if user has specific permission
 */
export function hasPermission(c: Context, permission: string): boolean {
  const adminContext = getAdminContext(c);
  return adminContext?.permissions?.includes(permission) || false;
}

/**
 * Helper to check if user has any of the specified permissions
 */
export function hasAnyPermission(c: Context, permissions: string[]): boolean {
  const adminContext = getAdminContext(c);
  if (!adminContext?.permissions) return false;

  return permissions.some(permission => adminContext.permissions.includes(permission));
}

/**
 * Helper to check if user has all specified permissions
 */
export function hasAllPermissions(c: Context, permissions: string[]): boolean {
  const adminContext = getAdminContext(c);
  if (!adminContext?.permissions) return false;

  return permissions.every(permission => adminContext.permissions.includes(permission));
}

/**
 * Helper to require admin context
 */
export function requireAdmin(c: Context): AdminContext {
  const adminContext = getAdminContext(c);
  if (!adminContext) {
    throw new Error('Admin context required');
  }
  return adminContext;
}

/**
 * Admin statistics and monitoring
 */
export class AdminMonitor {
  private static instance: AdminMonitor;
  private actionCounts = new Map<string, number>();
  private lastReset = Date.now();

  static getInstance(): AdminMonitor {
    if (!AdminMonitor.instance) {
      AdminMonitor.instance = new AdminMonitor();
    }
    return AdminMonitor.instance;
  }

  /**
   * Track admin action
   */
  trackAction(action: string): void {
    const current = this.actionCounts.get(action) || 0;
    this.actionCounts.set(action, current + 1);
  }

  /**
   * Get action statistics
   */
  getStats(): {
    actionCounts: Record<string, number>;
    totalActions: number;
    periodStart: Date;
  } {
    const actionCounts: Record<string, number> = {};
    let totalActions = 0;

    for (const [action, count] of this.actionCounts) {
      actionCounts[action] = count;
      totalActions += count;
    }

    return {
      actionCounts,
      totalActions,
      periodStart: new Date(this.lastReset),
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.actionCounts.clear();
    this.lastReset = Date.now();
  }
}

/**
 * Validate admin environment configuration
 */
export function validateAdminConfig(): {
  valid: boolean;
  warnings: string[];
  adminId?: number;
} {
  const warnings: string[] = [];
  const adminIdStr = process.env.ADMIN_ID;

  if (!adminIdStr) {
    warnings.push('ADMIN_ID environment variable not set');
    return { valid: false, warnings };
  }

  const adminId = parseInt(adminIdStr);
  if (isNaN(adminId) || adminId <= 0) {
    warnings.push('ADMIN_ID must be a positive integer');
    return { valid: false, warnings };
  }

  // Check for additional security recommendations
  if (adminId < 100000) {
    warnings.push('ADMIN_ID appears to be too low - consider using actual Telegram user ID');
  }

  return {
    valid: true,
    warnings,
    adminId,
  };
}
