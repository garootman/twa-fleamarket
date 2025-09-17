import { describe, it, expect, beforeEach } from 'vitest';

// T011: Contract test GET /api/categories
// This is a TDD contract test that MUST fail initially before implementation
// Tests the GET /api/categories endpoint according to the OpenAPI contract

// Polyfill for Request/Response in test environment
global.Request =
  global.Request ||
  (class {
    constructor(
      public url: string,
      public init?: any
    ) {}
  } as any);

global.Response =
  global.Response ||
  (class {
    constructor(
      public body?: any,
      public init?: any
    ) {}
    text() {
      return Promise.resolve(this.body || '');
    }
    json() {
      return Promise.resolve(JSON.parse(this.body || '{}'));
    }
    status = this.init?.status || 200;
    headers = new Map(Object.entries(this.init?.headers || {}));
    get(key: string) {
      return this.headers.get(key);
    }
  } as any);

// Mock the worker environment
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
}

const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  TELEGRAM_USE_TEST_API: 'false',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as D1Database,
  INIT_SECRET: 'mock_secret',
};

// Mock D1Database implementation for testing categories
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => null,
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({
        results: [
          {
            id: 1,
            name: 'Electronics',
            parent_id: null,
            description: 'Electronic devices and gadgets',
            created_at: '2023-01-01T00:00:00.000Z',
            is_active: true,
          },
          {
            id: 2,
            name: 'Smartphones',
            parent_id: 1,
            description: 'Mobile phones and accessories',
            created_at: '2023-01-01T00:00:00.000Z',
            is_active: true,
          },
          {
            id: 3,
            name: 'Clothing',
            parent_id: null,
            description: 'Apparel and fashion items',
            created_at: '2023-01-01T00:00:00.000Z',
            is_active: true,
          },
        ],
        success: true,
        meta: {} as any,
      }),
    }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({
      results: [
        {
          id: 1,
          name: 'Electronics',
          parent_id: null,
          description: 'Electronic devices and gadgets',
          created_at: '2023-01-01T00:00:00.000Z',
          is_active: true,
        },
        {
          id: 2,
          name: 'Smartphones',
          parent_id: 1,
          description: 'Mobile phones and accessories',
          created_at: '2023-01-01T00:00:00.000Z',
          is_active: true,
        },
        {
          id: 3,
          name: 'Clothing',
          parent_id: null,
          description: 'Apparel and fashion items',
          created_at: '2023-01-01T00:00:00.000Z',
          is_active: true,
        },
      ],
      success: true,
      meta: {} as any,
    }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
} as any;

mockEnv.DB = mockDB;

// Category type based on OpenAPI schema
interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  description: string | null;
  is_active: boolean;
}

describe('T011: GET /api/categories Contract Test', () => {
  let worker: any;

  beforeEach(async () => {
    // Import the worker module
    const workerModule = await import('../../src/index');
    worker = workerModule.default;
  });

  it('should return 200 status for GET /api/categories', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
  });

  it('should return JSON content-type for GET /api/categories', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });

  it('should return an array of categories', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    const categories = await response.json();

    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('should return categories with correct schema structure', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    const categories: Category[] = await response.json();

    // Validate each category has required properties according to OpenAPI schema
    categories.forEach((category, index) => {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('name');
      expect(category).toHaveProperty('parent_id');
      expect(category).toHaveProperty('description');
      expect(category).toHaveProperty('is_active');

      // Validate types according to schema
      expect(typeof category.id).toBe('number');
      expect(typeof category.name).toBe('string');
      expect(category.parent_id === null || typeof category.parent_id === 'number').toBe(true);
      expect(category.description === null || typeof category.description === 'string').toBe(true);
      expect(typeof category.is_active).toBe('boolean');

      // Validate constraints
      expect(category.name.length).toBeGreaterThan(0);
      expect(category.id).toBeGreaterThan(0);
    });
  });

  it('should return parent and child categories with correct hierarchy', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    const categories: Category[] = await response.json();

    // Find parent categories (parent_id is null)
    const parentCategories = categories.filter(cat => cat.parent_id === null);
    expect(parentCategories.length).toBeGreaterThan(0);

    // Find child categories (parent_id is not null)
    const childCategories = categories.filter(cat => cat.parent_id !== null);

    if (childCategories.length > 0) {
      // Validate that child categories reference valid parent categories
      childCategories.forEach(child => {
        const parent = categories.find(cat => cat.id === child.parent_id);
        expect(parent).toBeDefined();
        expect(parent!.parent_id).toBe(null); // Parent should be a root category
      });
    }
  });

  it('should return only active categories', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    const categories: Category[] = await response.json();

    // All returned categories should be active
    categories.forEach(category => {
      expect(category.is_active).toBe(true);
    });
  });

  it('should handle CORS correctly for GET /api/categories', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
      headers: {
        Origin: 'http://localhost:5173',
      },
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('should handle OPTIONS preflight request for /api/categories', async () => {
    const request = new Request('http://localhost/api/categories', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
      },
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  });

  it('should not require authentication for GET /api/categories', async () => {
    // According to OpenAPI schema, /categories endpoint has security: []
    const request = new Request('http://localhost/api/categories', {
      method: 'GET',
      // No Authorization header
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    // Should return 200, not 401 Unauthorized
    expect(response.status).toBe(200);
  });
});
