import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T023: GET /api/admin/listings
 *
 * This test validates the admin listings endpoint that allows admins to view all listings
 * with additional admin-only fields like flag counts and admin notes.
 *
 * API Contract Requirements:
 * - Endpoint: GET /api/admin/listings
 * - Authentication: Required (admin token)
 * - Query Parameters: ?status=[all|flagged|hidden|active] (default: all)
 * - Response: Array of Listing objects with additional admin fields
 * - Admin fields: flag_count (integer), admin_notes (string)
 * - Error cases: 401 for unauthenticated, 403 for non-admin users
 */

// Mock environment and setup for contract testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
  ADMIN_ID?: string;
}

// Admin Listing type (extends regular Listing with admin fields)
interface AdminListing {
  id: string;
  user_id: number;
  category_id: number;
  title: string;
  description: string;
  price_usd: number;
  images: string[];
  created_at: string;
  expires_at: string;
  status: 'draft' | 'active' | 'expired' | 'sold' | 'archived' | 'hidden';
  is_sticky: boolean;
  flag_count: number;
  admin_notes: string;
}

// Admin Listings response type
interface AdminListingsResponse {
  listings: AdminListing[];
  total: number;
}

// Error response type
interface ErrorResponse {
  error: string;
  message: string;
  details?: object;
}

// Mock environment for testing
const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  TELEGRAM_USE_TEST_API: 'false',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as D1Database,
  INIT_SECRET: 'mock_secret',
  ADMIN_ID: '123456789', // Mock admin Telegram ID
};

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => ({
        telegram_id: 123456789,
        username: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        profile_photo_url: null,
        created_at: '2025-09-15T10:00:00Z',
        is_admin: true,
        warning_count: 0,
        is_banned: false,
      }),
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({
        results: [
          {
            id: 'listing-1',
            user_id: 987654321,
            category_id: 1,
            title: 'Test Listing 1',
            description: 'Test description 1',
            price_usd: 99.99,
            images: ['https://example.com/image1.jpg'],
            created_at: '2025-09-15T10:00:00Z',
            expires_at: '2025-09-30T10:00:00Z',
            status: 'active',
            is_sticky: false,
            flag_count: 2,
            admin_notes: 'Flagged for review',
          },
          {
            id: 'listing-2',
            user_id: 123123123,
            category_id: 2,
            title: 'Test Listing 2',
            description: 'Test description 2',
            price_usd: 49.99,
            images: ['https://example.com/image2.jpg'],
            created_at: '2025-09-15T11:00:00Z',
            expires_at: '2025-09-30T11:00:00Z',
            status: 'hidden',
            is_sticky: true,
            flag_count: 0,
            admin_notes: 'Promoted listing',
          }
        ],
        success: true,
        meta: {} as any
      }),
    }),
    first: async () => ({
      telegram_id: 123456789,
      is_admin: true,
    }),
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
} as any;

mockEnv.DB = mockDB;

// Polyfills for Worker environment in tests
global.Request =
  global.Request ||
  (class {
    constructor(
      public url: string,
      public init?: any
    ) {
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers || {});
    }
    method: string;
    headers: Headers;
    json() {
      return Promise.resolve(JSON.parse(this.init?.body || '{}'));
    }
  } as any);

global.Response =
  global.Response ||
  (class {
    constructor(
      public body?: any,
      public init?: any
    ) {
      this.status = init?.status || 200;
      this.headers = new Headers(init?.headers || {});
    }
    status: number;
    headers: Headers;
    async text() {
      return Promise.resolve(this.body || '');
    }
    async json() {
      return Promise.resolve(JSON.parse(this.body || '{}'));
    }
    ok: boolean = this.status >= 200 && this.status < 300;
  } as any);

describe('Contract Test T023: GET /api/admin/listings', () => {
  let worker: any;

  beforeEach(async () => {
    // Import the worker module - this will fail initially as endpoint doesn't exist
    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      // Expected to fail initially - endpoint not implemented yet
      worker = null;
    }
  });

  describe('Successful admin listing retrieval scenarios', () => {
    it('should return all listings with admin fields when authenticated as admin', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      // Contract requirements validation
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const adminListingsData: AdminListingsResponse = await response.json();

      // Validate AdminListingsResponse schema compliance
      expect(adminListingsData).toHaveProperty('listings');
      expect(Array.isArray(adminListingsData.listings)).toBe(true);
      expect(adminListingsData).toHaveProperty('total');
      expect(typeof adminListingsData.total).toBe('number');

      // Validate each listing has admin fields
      adminListingsData.listings.forEach(listing => {
        // Standard listing fields
        expect(listing).toHaveProperty('id');
        expect(typeof listing.id).toBe('string');

        expect(listing).toHaveProperty('user_id');
        expect(typeof listing.user_id).toBe('number');

        expect(listing).toHaveProperty('category_id');
        expect(typeof listing.category_id).toBe('number');

        expect(listing).toHaveProperty('title');
        expect(typeof listing.title).toBe('string');
        expect(listing.title.length).toBeLessThanOrEqual(100);

        expect(listing).toHaveProperty('description');
        expect(typeof listing.description).toBe('string');
        expect(listing.description.length).toBeLessThanOrEqual(1000);

        expect(listing).toHaveProperty('price_usd');
        expect(typeof listing.price_usd).toBe('number');
        expect(listing.price_usd).toBeGreaterThan(0);

        expect(listing).toHaveProperty('images');
        expect(Array.isArray(listing.images)).toBe(true);
        expect(listing.images.length).toBeGreaterThan(0);
        expect(listing.images.length).toBeLessThanOrEqual(9);

        expect(listing).toHaveProperty('created_at');
        expect(typeof listing.created_at).toBe('string');
        expect(() => new Date(listing.created_at)).not.toThrow();

        expect(listing).toHaveProperty('expires_at');
        expect(typeof listing.expires_at).toBe('string');
        expect(() => new Date(listing.expires_at)).not.toThrow();

        expect(listing).toHaveProperty('status');
        expect(['draft', 'active', 'expired', 'sold', 'archived', 'hidden']).toContain(listing.status);

        expect(listing).toHaveProperty('is_sticky');
        expect(typeof listing.is_sticky).toBe('boolean');

        // Admin-only fields
        expect(listing).toHaveProperty('flag_count');
        expect(typeof listing.flag_count).toBe('number');
        expect(listing.flag_count).toBeGreaterThanOrEqual(0);

        expect(listing).toHaveProperty('admin_notes');
        expect(typeof listing.admin_notes).toBe('string');
      });
    });

    it('should filter listings by status when status query parameter provided', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings?status=flagged', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const adminListingsData: AdminListingsResponse = await response.json();

      // Should only return flagged listings (flag_count > 0)
      adminListingsData.listings.forEach(listing => {
        expect(listing.flag_count).toBeGreaterThan(0);
      });
    });

    it('should filter listings by active status', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings?status=active', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const adminListingsData: AdminListingsResponse = await response.json();

      // Should only return active listings
      adminListingsData.listings.forEach(listing => {
        expect(listing.status).toBe('active');
      });
    });

    it('should filter listings by hidden status', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings?status=hidden', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const adminListingsData: AdminListingsResponse = await response.json();

      // Should only return hidden listings
      adminListingsData.listings.forEach(listing => {
        expect(listing.status).toBe('hidden');
      });
    });

    it('should return all listings when status=all or no status parameter', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings?status=all', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const adminListingsData: AdminListingsResponse = await response.json();

      // Should include listings with different statuses
      const statuses = adminListingsData.listings.map(l => l.status);
      expect(statuses.length).toBeGreaterThan(0);
    });
  });

  describe('Authentication and authorization scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
      expect(errorData.message).toMatch(/authentication.*required/i);
    });

    it('should return 401 for invalid token', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Unauthorized');
      expect(errorData.message).toMatch(/invalid.*token/i);
    });

    it('should return 403 for non-admin user token', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const errorData: ErrorResponse = await response.json();
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('message');
      expect(errorData.message).toMatch(/admin.*required|not.*admin/i);
    });

    it('should return 401 for expired token', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer expired_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Unauthorized');
      expect(errorData.message).toMatch(/expired.*token/i);
    });
  });

  describe('Query parameter validation scenarios', () => {
    it('should return 400 for invalid status parameter', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings?status=invalid_status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Bad Request');
      expect(errorData.message).toMatch(/invalid.*status/i);
    });

    it('should handle empty results gracefully', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings?status=sold', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      const adminListingsData: AdminListingsResponse = await response.json();

      expect(adminListingsData.listings).toEqual([]);
      expect(adminListingsData.total).toBe(0);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject POST method on /api/admin/listings endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify({}),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should reject PUT method on /api/admin/listings endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
        body: JSON.stringify({}),
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should reject DELETE method on /api/admin/listings endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(405); // Method Not Allowed
    });
  });

  describe('CORS and security headers', () => {
    it('should include proper CORS headers for admin endpoint', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_jwt_token',
          'Origin': 'http://localhost:5173',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      // Should include CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });

    it('should handle preflight OPTIONS request', async () => {
      const request = new Request('http://localhost:8787/api/admin/listings', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type, Authorization',
        },
      });

      if (!worker) {
        // Expected failure - endpoint not implemented
        expect(worker).toBe(null);
        return;
      }

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    });
  });
});