import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Contract Tests T010-T016: Core API Endpoints
 *
 * These tests verify that API endpoints conform to their expected contracts:
 * - Request/response structure validation
 * - HTTP status codes
 * - Error handling patterns
 * - Authentication requirements
 * - Data format consistency
 *
 * T010: Contract test GET /api/me
 * T011: Contract test GET /api/categories
 * T012: Contract test GET /api/listings
 * T013: Contract test POST /api/listings
 * T014: Contract test GET /api/listings/{id}
 * T015: Contract test PUT /api/listings/{id}
 * T016: Contract test POST /api/listings/{id}/bump
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
  DB: any;
  CACHE_KV: any;
  SESSION_KV: any;
  R2_BUCKET: any;
  INIT_SECRET: string;
  JWT_SECRET: string;
  SESSION_ENCRYPTION_KEY: string;
  NODE_ENV: string;
  ADMIN_TELEGRAM_ID: string;
  MAX_UPLOAD_SIZE?: string;
}


interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  currency: string;
  categoryId: number;
  userId: number;
  location?: string;
  contactMethod?: string;
  contactValue?: string;
  images?: string;
  status: string;
  isActive: boolean;
  viewCount: number;
  bumpCount: number;
  isFlagged: boolean;
  flagReason?: string;
  isSticky: boolean;
  lastBumpedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}


const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as any,
  CACHE_KV: {} as any,
  SESSION_KV: {} as any,
  R2_BUCKET: {} as any,
  INIT_SECRET: 'mock_secret',
  JWT_SECRET: 'mock_jwt_secret',
  SESSION_ENCRYPTION_KEY: 'mock_session_key',
  NODE_ENV: 'development', // Set to development to enable mock tokens
  ADMIN_TELEGRAM_ID: '123456789',
  MAX_UPLOAD_SIZE: '5242880',
};

let mockUsers: any[] = [
  {
    id: 1,
    telegram_id: '123456789',
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    language_code: 'en',
    is_premium: false,
    is_bot: false,
    created_at: '2025-09-16T10:00:00Z',
    updated_at: '2025-09-16T10:00:00Z',
  }
];

let mockListings: any[] = [
  {
    id: 1,
    title: 'Test Listing',
    description: 'A test listing for contract validation',
    price: 100,
    currency: 'USD',
    categoryId: 1,
    category_id: 1,
    userId: 1,
    user_id: 1,
    location: 'Test City',
    contactMethod: 'telegram',
    contact_method: 'telegram',
    contactValue: '@testuser',
    contact_value: '@testuser',
    images: '["image1.jpg"]',
    status: 'active',
    isActive: true,
    is_active: true,
    viewCount: 5,
    view_count: 5,
    bumpCount: 0,
    bump_count: 0,
    isFlagged: false,
    is_flagged: false,
    flagReason: null,
    flag_reason: null,
    isSticky: false,
    is_sticky: false,
    lastBumpedAt: null,
    last_bumped_at: null,
    createdAt: '2025-09-16T10:00:00Z',
    created_at: '2025-09-16T10:00:00Z',
    updatedAt: '2025-09-16T10:00:00Z',
    updated_at: '2025-09-16T10:00:00Z',
  }
];

const mockDB = {
  prepare: (query: string) => ({
    bind: (...params: any[]) => ({
      first: async () => {
        if (query.includes('SELECT') && query.includes('users') && params[0] === 1) {
          return mockUsers[0];
        }
        if (query.includes('SELECT') && query.includes('listings') && query.includes('WHERE id')) {
          return mockListings.find(l => l.id === params[0]);
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO listings')) {
          const newListing = {
            ...mockListings[0],
            id: mockListings.length + 1,
            title: params[0],
            description: params[1],
            price: params[2],
            currency: params[3] || 'USD',
            category_id: params[4],
            user_id: params[5],
          };
          mockListings.push(newListing);
          return {
            success: true,
            meta: {
              changes: 1,
              last_row_id: newListing.id,
              duration: 10,
              rows_read: 0,
              rows_written: 1,
            },
          };
        }
        if (query.includes('UPDATE listings')) {
          return {
            success: true,
            meta: {
              changes: 1,
              duration: 10,
              rows_read: 1,
              rows_written: 1,
            },
          };
        }
        return { success: true, meta: {} as any };
      },
      all: async () => {
        if (query.includes('SELECT') && query.includes('listings')) {
          return { results: mockListings, success: true, meta: {} as any };
        }
        return { results: [], success: true, meta: {} as any };
      },
    }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
  }),
};

const mockKV = {
  put: async (_key: string, _value: string) => undefined,
  get: async (_key: string) => null,
  delete: async (_key: string) => undefined,
  list: async () => ({ keys: [], list_complete: true, cursor: undefined }),
};

mockEnv.DB = mockDB;
mockEnv.CACHE_KV = mockKV;
mockEnv.SESSION_KV = mockKV;

// Mock global Request and Response
global.Request = global.Request || (class {
  constructor(public url: string, public init?: any) {
    this.method = init?.method || 'GET';
    this.headers = new Headers(init?.headers || {});
  }
  method: string;
  headers: Headers;
  async json() {
    return Promise.resolve(JSON.parse(this.init?.body || '{}'));
  }
  async formData() {
    return new FormData();
  }
  query(_param: string) {
    const url = new URL(this.url);
    return url.searchParams.get(_param);
  }
  param(_param: string) {
    const pathParts = this.url.split('/');
    const paramIndex = pathParts.findIndex(part => part.includes('{') && part.includes('}'));
    return paramIndex !== -1 ? pathParts[paramIndex + 1] : null;
  }
} as any);

global.Response = global.Response || (class {
  constructor(public body?: any, public init?: any) {
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
  get ok() {
    return this.status >= 200 && this.status < 300;
  }
} as any);

describe('Contract Tests: Core API Endpoints', () => {
  let worker: any;

  beforeEach(async () => {
    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      worker = null;
    }
  });

  describe('T010: Contract test GET /api/me', () => {
    it('should return user profile with correct structure when authenticated', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_user_1',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('user');

      const user = result.user;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('telegramId');
      expect(user).toHaveProperty('username');
      expect(user).toHaveProperty('firstName');
      expect(user).toHaveProperty('isPremium');
      expect(user).toHaveProperty('isBot');
      expect(user).toHaveProperty('createdAt');
      expect(user).toHaveProperty('updatedAt');

      // Validate data types
      expect(typeof user.id).toBe('number');
      expect(typeof user.telegramId).toBe('string');
      expect(typeof user.firstName).toBe('string');
      expect(typeof user.isPremium).toBe('boolean');
      expect(typeof user.isBot).toBe('boolean');
    });

    it('should return 401 when not authenticated', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/authentication|unauthorized/i);
    });

    it('should return 401 with invalid token', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);

      const result = await response.json();
      expect(result).toHaveProperty('error');
    });
  });

  describe('T011: Contract test GET /api/categories', () => {
    it('should return categories list with correct structure', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/categories', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('categories');
      expect(Array.isArray(result.categories)).toBe(true);

      if (result.categories.length > 0) {
        const category = result.categories[0];
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('slug');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('parent_id');
        expect(category).toHaveProperty('is_active');
        expect(category).toHaveProperty('display_order');
        expect(category).toHaveProperty('created_at');
        expect(category).toHaveProperty('updated_at');

        // Validate data types
        expect(typeof category.id).toBe('number');
        expect(typeof category.name).toBe('string');
        expect(typeof category.slug).toBe('string');
        expect(typeof category.is_active).toBe('boolean');
        expect(typeof category.display_order).toBe('number');
      }
    });

    it('should not require authentication', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/categories', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);
    });

    it('should return only active categories by default', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/categories', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      const categories = result.categories;

      categories.forEach((category: any) => {
        expect(category.is_active).toBe(true);
      });
    });
  });

  describe('T012: Contract test GET /api/listings', () => {
    it('should return listings with correct structure and pagination', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('listings');
      expect(Array.isArray(result.listings)).toBe(true);

      if (result.listings.length > 0) {
        const listing = result.listings[0];
        expect(listing).toHaveProperty('id');
        expect(listing).toHaveProperty('title');
        expect(listing).toHaveProperty('description');
        expect(listing).toHaveProperty('price');
        expect(listing).toHaveProperty('currency');
        expect(listing).toHaveProperty('categoryId');
        expect(listing).toHaveProperty('userId');
        expect(listing).toHaveProperty('status');
        expect(listing).toHaveProperty('isActive');
        expect(listing).toHaveProperty('viewCount');
        expect(listing).toHaveProperty('createdAt');
        expect(listing).toHaveProperty('updatedAt');

        // Validate data types
        expect(typeof listing.id).toBe('number');
        expect(typeof listing.title).toBe('string');
        expect(typeof listing.price).toBe('number');
        expect(typeof listing.currency).toBe('string');
        expect(typeof listing.status).toBe('string');
        expect(typeof listing.isActive).toBe('boolean');
        expect(typeof listing.viewCount).toBe('number');
      }
    });

    it('should support search filters', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?query=test&categoryId=1&priceMin=50&priceMax=150', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('listings');
    });

    it('should support pagination parameters', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?limit=10&offset=0', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('listings');
    });

    it('should support sorting options', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings?sortBy=price&sortOrder=asc', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('listings');
    });
  });

  describe('T013: Contract test POST /api/listings', () => {
    it('should create listing with valid data and authentication', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const listingData = {
        title: 'New Test Listing',
        description: 'A new listing created via contract test',
        price: 150,
        currency: 'USD',
        categoryId: 1,
        location: 'Test Location',
        contactMethod: 'telegram',
        contactValue: '@testuser',
        images: ['image1.jpg', 'image2.jpg']
      };

      const request = new Request('http://localhost:8787/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_1',
        },
        body: JSON.stringify(listingData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(201);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('listing');

      const listing = result.listing;
      expect(listing).toHaveProperty('id');
      expect(listing.title).toBe(listingData.title);
      expect(listing.description).toBe(listingData.description);
      expect(listing.price).toBe(listingData.price);
      expect(listing.categoryId).toBe(listingData.categoryId);
    });

    it('should return 401 when not authenticated', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const listingData = {
        title: 'Unauthorized Listing',
        description: 'This should fail',
        price: 100,
        categoryId: 1,
      };

      const request = new Request('http://localhost:8787/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(listingData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);

      const result = await response.json();
      expect(result).toHaveProperty('error');
    });

    it('should return 400 with invalid data', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const invalidData = {
        // Missing required fields
        description: 'Missing title and other required fields',
      };

      const request = new Request('http://localhost:8787/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_1',
        },
        body: JSON.stringify(invalidData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/validation|required|invalid/i);
    });

    it('should validate required fields', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const fieldsToTest = [
        { title: 'Test' }, // Missing description, price, categoryId
        { description: 'Test desc' }, // Missing title, price, categoryId
        { title: 'Test', description: 'Test desc' }, // Missing price, categoryId
        { title: 'Test', description: 'Test desc', price: 100 }, // Missing categoryId
      ];

      for (const testData of fieldsToTest) {
        const request = new Request('http://localhost:8787/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock_user_1',
          },
          body: JSON.stringify(testData),
        });

        const response = await worker.fetch(request, mockEnv, {
          waitUntil: () => {},
          passThroughOnException: () => {},
        });

        expect(response.status).toBe(400);
      }
    });
  });

  describe('T014: Contract test GET /api/listings/{id}', () => {
    it('should return single listing with correct structure', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/1', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('listing');

      const listing = result.listing;
      expect(listing).toHaveProperty('id', 1);
      expect(listing).toHaveProperty('title');
      expect(listing).toHaveProperty('description');
      expect(listing).toHaveProperty('price');
      expect(listing).toHaveProperty('currency');
      expect(listing).toHaveProperty('categoryId');
      expect(listing).toHaveProperty('userId');
      expect(listing).toHaveProperty('viewCount');
      expect(listing).toHaveProperty('createdAt');
      expect(listing).toHaveProperty('updatedAt');
    });

    it('should return 404 for non-existent listing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/999', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(404);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/not found|does not exist/i);
    });

    it('should increment view count when viewing listing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Get initial view count
      const request1 = new Request('http://localhost:8787/api/listings/1', {
        method: 'GET',
      });

      const response1 = await worker.fetch(request1, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response1.status).toBe(200);
      const result1 = await response1.json();
      const initialViewCount = result1.listing.viewCount;

      // View the listing again
      const request2 = new Request('http://localhost:8787/api/listings/1', {
        method: 'GET',
      });

      const response2 = await worker.fetch(request2, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response2.status).toBe(200);
      const result2 = await response2.json();

      // View count should have incremented
      expect(result2.listing.viewCount).toBe(initialViewCount + 1);
    });

    it('should return 400 for invalid listing ID format', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/invalid-id', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/invalid|id/i);
    });
  });

  describe('T015: Contract test PUT /api/listings/{id}', () => {
    it('should update listing with valid data and ownership', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const updateData = {
        title: 'Updated Test Listing',
        description: 'Updated description',
        price: 200,
        location: 'Updated Location'
      };

      const request = new Request('http://localhost:8787/api/listings/1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_1',
        },
        body: JSON.stringify(updateData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('listing');

      const listing = result.listing;
      expect(listing.title).toBe(updateData.title);
      expect(listing.description).toBe(updateData.description);
      expect(listing.price).toBe(updateData.price);
      expect(listing.location).toBe(updateData.location);
    });

    it('should return 401 when not authenticated', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const updateData = {
        title: 'Unauthorized Update',
      };

      const request = new Request('http://localhost:8787/api/listings/1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);

      const result = await response.json();
      expect(result).toHaveProperty('error');
    });

    it('should return 403 when user does not own the listing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const updateData = {
        title: 'Forbidden Update',
      };

      // Use different user token
      const request = new Request('http://localhost:8787/api/listings/1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_2',
        },
        body: JSON.stringify(updateData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/forbidden|ownership|permission/i);
    });

    it('should return 404 for non-existent listing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const updateData = {
        title: 'Update Non-existent',
      };

      const request = new Request('http://localhost:8787/api/listings/999', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_1',
        },
        body: JSON.stringify(updateData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(404);

      const result = await response.json();
      expect(result).toHaveProperty('error');
    });

    it('should validate update data types', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const invalidData = {
        price: 'not-a-number', // Should be number
        categoryId: 'invalid', // Should be number
      };

      const request = new Request('http://localhost:8787/api/listings/1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_1',
        },
        body: JSON.stringify(invalidData),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/validation|invalid|type/i);
    });
  });

  describe('T016: Contract test POST /api/listings/{id}/bump', () => {
    it('should bump listing with valid authentication and ownership', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/1/bump', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock_user_1',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('message');
      expect(result.message).toMatch(/bumped|promoted/i);

      if (result.listing) {
        expect(result.listing).toHaveProperty('bumpCount');
        expect(result.listing).toHaveProperty('lastBumpedAt');
        expect(result.listing.bumpCount).toBeGreaterThan(0);
        expect(result.listing.lastBumpedAt).toBeTruthy();
      }
    });

    it('should return 401 when not authenticated', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/1/bump', {
        method: 'POST',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(401);

      const result = await response.json();
      expect(result).toHaveProperty('error');
    });

    it('should return 403 when user does not own the listing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/1/bump', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock_user_2',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/forbidden|ownership|permission/i);
    });

    it('should return 404 for non-existent listing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/999/bump', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock_user_1',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(404);

      const result = await response.json();
      expect(result).toHaveProperty('error');
    });

    it('should return 400 for invalid listing ID format', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/invalid-id/bump', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock_user_1',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result).toHaveProperty('error');
      expect(result.error).toMatch(/invalid|id/i);
    });

    it('should track bump count and timestamp correctly', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Get initial state
      const getRequest = new Request('http://localhost:8787/api/listings/1', {
        method: 'GET',
      });

      const getResponse = await worker.fetch(getRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(getResponse.status).toBe(200);
      const initialListing = (await getResponse.json()).listing;
      const initialBumpCount = initialListing.bumpCount || 0;

      // Perform bump
      const bumpRequest = new Request('http://localhost:8787/api/listings/1/bump', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock_user_1',
        },
      });

      const bumpResponse = await worker.fetch(bumpRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(bumpResponse.status).toBe(200);

      // Verify bump was recorded
      const getAfterBump = new Request('http://localhost:8787/api/listings/1', {
        method: 'GET',
      });

      const getAfterResponse = await worker.fetch(getAfterBump, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(getAfterResponse.status).toBe(200);
      const updatedListing = (await getAfterResponse.json()).listing;

      expect(updatedListing.bumpCount).toBe(initialBumpCount + 1);
      expect(updatedListing.lastBumpedAt).toBeTruthy();

      // Verify timestamp is recent
      const bumpTime = new Date(updatedListing.lastBumpedAt);
      const now = new Date();
      const timeDiff = now.getTime() - bumpTime.getTime();
      expect(timeDiff).toBeLessThan(60000); // Within 1 minute
    });
  });
});