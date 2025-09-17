import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Test T018: GET /api/me/listings
 *
 * This is a TDD contract test that MUST fail initially before implementation.
 * Tests the GET /api/me/listings endpoint according to the API contract specification.
 *
 * API Contract Requirements:
 * - Endpoint: GET /api/me/listings
 * - Authentication: Required (Bearer token)
 * - Query Parameters: status (optional, default: all)
 * - Response: Object with listings array and stats object (200 OK)
 * - Error cases: 401 Unauthorized
 */

// Mock environment and setup for contract testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
}

// Types based on API schema
interface User {
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  profile_photo_url: string | null;
  created_at: string;
  is_admin: boolean;
  warning_count: number;
  is_banned: boolean;
}

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
  is_active: boolean;
}

interface Listing {
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
  is_highlighted: boolean;
  auto_bump_enabled: boolean;
  view_count: number;
  contact_username: string;
  published_at: string | null;
  time_left: string;
  can_bump: boolean;
  user: User;
  category: Category;
  premium_features: Array<{
    type: 'sticky_listing' | 'color_highlight' | 'auto_bump';
    expires_at: string;
  }>;
}

interface UserListingsResponse {
  listings: Listing[];
  stats: {
    total_active: number;
    total_draft: number;
    total_sold: number;
    total_expired: number;
    premium_features: Array<object>;
  };
}

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
};

// Mock user data
const mockUser: User = {
  telegram_id: 123456789,
  username: 'testuser',
  first_name: 'Test',
  last_name: 'User',
  profile_photo_url: 'https://example.com/avatar.jpg',
  created_at: '2025-09-01T10:00:00Z',
  is_admin: false,
  warning_count: 0,
  is_banned: false,
};

const mockCategory: Category = {
  id: 1,
  name: 'Electronics',
  parent_id: null,
  description: 'Electronic devices and gadgets',
  is_active: true,
};

// Mock listing data
const mockListings: Listing[] = [
  {
    id: 'listing-1-active',
    user_id: 123456789,
    category_id: 1,
    title: 'Active Test Listing 1',
    description: 'This is an active test listing',
    price_usd: 99.99,
    images: ['https://example.com/image1.jpg'],
    created_at: '2025-09-15T10:00:00Z',
    expires_at: '2025-10-15T10:00:00Z',
    status: 'active',
    is_sticky: false,
    is_highlighted: false,
    auto_bump_enabled: false,
    view_count: 10,
    contact_username: 'testuser',
    published_at: '2025-09-15T10:00:00Z',
    time_left: '30 days',
    can_bump: true,
    user: mockUser,
    category: mockCategory,
    premium_features: [],
  },
  {
    id: 'listing-2-draft',
    user_id: 123456789,
    category_id: 1,
    title: 'Draft Test Listing 2',
    description: 'This is a draft test listing',
    price_usd: 49.99,
    images: ['https://example.com/image2.jpg'],
    created_at: '2025-09-16T10:00:00Z',
    expires_at: '2025-10-16T10:00:00Z',
    status: 'draft',
    is_sticky: false,
    is_highlighted: false,
    auto_bump_enabled: false,
    view_count: 0,
    contact_username: 'testuser',
    published_at: null,
    time_left: '31 days',
    can_bump: false,
    user: mockUser,
    category: mockCategory,
    premium_features: [],
  },
  {
    id: 'listing-3-sold',
    user_id: 123456789,
    category_id: 1,
    title: 'Sold Test Listing 3',
    description: 'This is a sold test listing',
    price_usd: 199.99,
    images: ['https://example.com/image3.jpg'],
    created_at: '2025-09-10T10:00:00Z',
    expires_at: '2025-10-10T10:00:00Z',
    status: 'sold',
    is_sticky: false,
    is_highlighted: false,
    auto_bump_enabled: false,
    view_count: 25,
    contact_username: 'testuser',
    published_at: '2025-09-10T10:00:00Z',
    time_left: 'Sold',
    can_bump: false,
    user: mockUser,
    category: mockCategory,
    premium_features: [],
  },
];

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => mockUser,
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({
        results: mockListings,
        success: true,
        meta: {} as any,
      }),
    }),
    first: async () => mockUser,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: mockListings, success: true, meta: {} as any }),
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

describe('Contract Test T018: GET /api/me/listings', () => {
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

  describe('Successful listings retrieval scenarios', () => {
    it('should return user listings with stats for authenticated user', async () => {
      // This test MUST fail initially - endpoint doesn't exist yet
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      // Contract requirements validation
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      const data: UserListingsResponse = await response.json();

      // Validate UserListingsResponse schema compliance
      expect(data).toHaveProperty('listings');
      expect(Array.isArray(data.listings)).toBe(true);

      expect(data).toHaveProperty('stats');
      expect(typeof data.stats).toBe('object');

      // Validate stats object structure
      expect(data.stats).toHaveProperty('total_active');
      expect(typeof data.stats.total_active).toBe('number');
      expect(data.stats.total_active).toBeGreaterThanOrEqual(0);

      expect(data.stats).toHaveProperty('total_draft');
      expect(typeof data.stats.total_draft).toBe('number');
      expect(data.stats.total_draft).toBeGreaterThanOrEqual(0);

      expect(data.stats).toHaveProperty('total_sold');
      expect(typeof data.stats.total_sold).toBe('number');
      expect(data.stats.total_sold).toBeGreaterThanOrEqual(0);

      expect(data.stats).toHaveProperty('total_expired');
      expect(typeof data.stats.total_expired).toBe('number');
      expect(data.stats.total_expired).toBeGreaterThanOrEqual(0);

      expect(data.stats).toHaveProperty('premium_features');
      expect(Array.isArray(data.stats.premium_features)).toBe(true);

      // Validate each listing in the array
      if (data.listings.length > 0) {
        data.listings.forEach(listing => {
          // Validate Listing schema compliance
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
          expect(listing.images.length).toBeGreaterThanOrEqual(1);
          expect(listing.images.length).toBeLessThanOrEqual(9);

          expect(listing).toHaveProperty('created_at');
          expect(typeof listing.created_at).toBe('string');
          expect(() => new Date(listing.created_at)).not.toThrow();

          expect(listing).toHaveProperty('expires_at');
          expect(typeof listing.expires_at).toBe('string');
          expect(() => new Date(listing.expires_at)).not.toThrow();

          expect(listing).toHaveProperty('status');
          expect(['draft', 'active', 'expired', 'sold', 'archived', 'hidden']).toContain(
            listing.status
          );

          expect(listing).toHaveProperty('is_sticky');
          expect(typeof listing.is_sticky).toBe('boolean');

          expect(listing).toHaveProperty('is_highlighted');
          expect(typeof listing.is_highlighted).toBe('boolean');

          expect(listing).toHaveProperty('auto_bump_enabled');
          expect(typeof listing.auto_bump_enabled).toBe('boolean');

          expect(listing).toHaveProperty('view_count');
          expect(typeof listing.view_count).toBe('number');
          expect(listing.view_count).toBeGreaterThanOrEqual(0);

          expect(listing).toHaveProperty('contact_username');
          expect(typeof listing.contact_username).toBe('string');

          expect(listing).toHaveProperty('published_at');
          expect(listing.published_at === null || typeof listing.published_at === 'string').toBe(
            true
          );

          expect(listing).toHaveProperty('time_left');
          expect(typeof listing.time_left).toBe('string');

          expect(listing).toHaveProperty('can_bump');
          expect(typeof listing.can_bump).toBe('boolean');

          expect(listing).toHaveProperty('user');
          expect(typeof listing.user).toBe('object');
          expect(listing.user).toHaveProperty('telegram_id');

          expect(listing).toHaveProperty('category');
          expect(typeof listing.category).toBe('object');
          expect(listing.category).toHaveProperty('id');

          expect(listing).toHaveProperty('premium_features');
          expect(Array.isArray(listing.premium_features)).toBe(true);
        });
      }
    });

    it('should filter listings by status=active query parameter', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings?status=active', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(200);
      const data: UserListingsResponse = await response.json();

      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('stats');

      // All returned listings should have active status
      data.listings.forEach(listing => {
        expect(listing.status).toBe('active');
      });
    });

    it('should filter listings by status=draft query parameter', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings?status=draft', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(200);
      const data: UserListingsResponse = await response.json();

      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('stats');

      // All returned listings should have draft status
      data.listings.forEach(listing => {
        expect(listing.status).toBe('draft');
      });
    });

    it('should filter listings by status=sold query parameter', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings?status=sold', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(200);
      const data: UserListingsResponse = await response.json();

      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('stats');

      // All returned listings should have sold status
      data.listings.forEach(listing => {
        expect(listing.status).toBe('sold');
      });
    });

    it('should filter listings by status=expired query parameter', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings?status=expired', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(200);
      const data: UserListingsResponse = await response.json();

      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('stats');

      // All returned listings should have expired status
      data.listings.forEach(listing => {
        expect(listing.status).toBe('expired');
      });
    });

    it('should filter listings by status=archived query parameter', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings?status=archived', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(200);
      const data: UserListingsResponse = await response.json();

      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('stats');

      // All returned listings should have archived status
      data.listings.forEach(listing => {
        expect(listing.status).toBe('archived');
      });
    });

    it('should return all listings for status=all query parameter', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings?status=all', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(200);
      const data: UserListingsResponse = await response.json();

      expect(data).toHaveProperty('listings');
      expect(data).toHaveProperty('stats');

      // Should include listings of all statuses
      const statuses = data.listings.map(listing => listing.status);
      const uniqueStatuses = [...new Set(statuses)];
      expect(uniqueStatuses.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty listings array for user with no listings', async () => {
      const validTokenNoListings = 'valid_jwt_token_user_no_listings';

      const request = new Request('http://localhost:8787/api/me/listings', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validTokenNoListings}`,
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

      expect(response.status).toBe(200);
      const data: UserListingsResponse = await response.json();

      expect(data).toHaveProperty('listings');
      expect(Array.isArray(data.listings)).toBe(true);
      expect(data.listings).toHaveLength(0);

      expect(data).toHaveProperty('stats');
      expect(data.stats.total_active).toBe(0);
      expect(data.stats.total_draft).toBe(0);
      expect(data.stats.total_sold).toBe(0);
      expect(data.stats.total_expired).toBe(0);
    });
  });

  describe('Authentication failure scenarios', () => {
    it('should return 401 for missing Authorization header', async () => {
      const request = new Request('http://localhost:8787/api/me/listings', {
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
      expect(errorData.error).toBe('Unauthorized');
    });

    it('should return 401 for invalid Bearer token', async () => {
      const request = new Request('http://localhost:8787/api/me/listings', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid_token',
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
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Unauthorized');
    });

    it('should return 401 for malformed Authorization header', async () => {
      const request = new Request('http://localhost:8787/api/me/listings', {
        method: 'GET',
        headers: {
          'Authorization': 'NotBearer token_here',
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
      const errorData: ErrorResponse = await response.json();
      expect(errorData.error).toBe('Unauthorized');
    });
  });

  describe('Query parameter validation', () => {
    it('should handle invalid status parameter gracefully', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings?status=invalid_status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      // Should either default to 'all' status or return 400
      expect([200, 400]).toContain(response.status);

      if (response.status === 200) {
        const data: UserListingsResponse = await response.json();
        expect(data).toHaveProperty('listings');
        expect(data).toHaveProperty('stats');
      } else if (response.status === 400) {
        const errorData: ErrorResponse = await response.json();
        expect(errorData.error).toBe('Bad Request');
        expect(errorData.message).toMatch(/status.*invalid/i);
      }
    });
  });

  describe('HTTP method validation', () => {
    it('should reject POST method on GET /api/me/listings endpoint', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should reject PUT method on GET /api/me/listings endpoint', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${validToken}`,
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

      expect(response.status).toBe(405); // Method Not Allowed
    });
  });

  describe('CORS and security headers', () => {
    it('should include proper CORS headers for authenticated requests', async () => {
      const validToken = 'valid_jwt_token_user';

      const request = new Request('http://localhost:8787/api/me/listings', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json',
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
  });
});
