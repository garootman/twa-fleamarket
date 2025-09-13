// Re-export all admin services
export { AdminPanel } from './panel';
export { ContentFilter } from './content-filter';
export { ValidationService } from './validation';

// Re-export types
export type { AdminStats, AdminListingView, AdminUserView } from './panel';

export type { ContentFilterResult, ContentFilterStats } from './content-filter';

export type {
  ValidationResult,
  UsernameValidationResult,
  ListingValidationResult,
} from './validation';

// Admin service factory
import type { Database } from '../db';
import type { KVStorage } from '../kv';
import { AdminPanel } from './panel';
import { ContentFilter } from './content-filter';
import { ValidationService } from './validation';

export interface AdminServices {
  panel: AdminPanel;
  contentFilter: ContentFilter;
  validation: ValidationService;
  isAdmin: (userId: number) => boolean;
}

export function createAdminServices(db: Database, kv: KVStorage, adminId?: string): AdminServices {
  const panel = new AdminPanel(db, kv, adminId);
  const contentFilter = new ContentFilter(db);
  const validation = new ValidationService();

  return {
    panel,
    contentFilter,
    validation,
    isAdmin: (userId: number) => panel.isAdmin(userId),
  };
}

// Admin middleware helper
export function requireAdmin(adminServices: AdminServices, userId: number): void {
  if (!adminServices.isAdmin(userId)) {
    throw new Error('Admin privileges required');
  }
}

// Admin route helper
export function adminOnly<T extends any[], R>(
  adminServices: AdminServices,
  handler: (userId: number, ...args: T) => Promise<R>
) {
  return async (userId: number, ...args: T): Promise<R> => {
    requireAdmin(adminServices, userId);
    return handler(userId, ...args);
  };
}
