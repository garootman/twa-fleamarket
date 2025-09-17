import { Hono } from 'hono';
import { setupAuthRoutes } from './auth';
import { setupMeRoutes } from './me';
import { setupCategoriesRoutes } from './categories';
import { setupListingsRoutes } from './listings';
import { setupUploadRoutes } from './upload';
import { setupAdminRoutes } from './admin';
import { setupDevRoutes } from './dev';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Main API Router
 *
 * Integrates all API endpoints for the Telegram marketplace application:
 * - Authentication endpoints
 * - User profile endpoints
 * - Category management endpoints
 * - Listing management endpoints
 * - File upload endpoints
 * - Admin management endpoints
 * - Development/testing endpoints
 */

export interface APIContext {
  db: DrizzleD1Database;
  kv: any;
  r2: any;
  botToken: string;
  isDevMode: boolean;
}

/**
 * Setup all API routes with proper context
 */
export function setupAPIRoutes(
  app: Hono,
  db: DrizzleD1Database,
  kv: any,
  r2: any,
  botToken: string,
  isDevMode = false
): void {
  // Authentication routes
  setupAuthRoutes(app, db, botToken);

  // User profile routes
  setupMeRoutes(app, db, botToken);

  // Categories routes
  setupCategoriesRoutes(app, db, kv, botToken);

  // Listings routes
  setupListingsRoutes(app, db, kv, botToken);

  // Upload routes
  setupUploadRoutes(app, db, r2, botToken);

  // Admin routes
  setupAdminRoutes(app, db, botToken);

  // Development routes (only in development mode)
  if (isDevMode) {
    setupDevRoutes(app, db, botToken, isDevMode);
  }
}

/**
 * Create a separate API app that can be mounted
 */
export function createAPIApp(
  db: DrizzleD1Database,
  kv: any,
  r2: any,
  botToken: string,
  isDevMode = false
): Hono {
  const apiApp = new Hono();

  // Setup all routes
  setupAPIRoutes(apiApp, db, kv, r2, botToken, isDevMode);

  // 404 handler for API routes
  apiApp.all('*', c => {
    return c.json(
      {
        success: false,
        error: 'API endpoint not found',
        availableEndpoints: [
          'POST /api/auth',
          'GET /api/me',
          'GET /api/categories',
          'GET /api/listings',
          'POST /api/listings',
          'POST /api/upload',
          'GET /api/admin/listings',
          'GET /api/dev/mock-users (dev mode only)',
        ],
      },
      404
    );
  });

  return apiApp;
}
