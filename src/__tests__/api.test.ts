import { describe, it, expect, beforeEach } from 'vitest';

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

// Mock D1Database implementation for testing
const mockDB: D1Database = {
  prepare: () => ({
    bind: () => ({
      first: async () => null,
      run: async () => ({ success: true, meta: {} as any }),
      all: async () => ({ results: [], success: true, meta: {} as any }),
    }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
} as any;

mockEnv.DB = mockDB;

describe('Worker API Endpoints', () => {
  let worker: any;

  beforeEach(async () => {
    // Import the worker module
    const workerModule = await import('../index');
    worker = workerModule.default;
  });

  it('should return health check message for root endpoint', async () => {
    const request = new Request('http://localhost/', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('This telegram bot is deployed correctly');
  });

  it('should return 404 for unknown endpoints', async () => {
    const request = new Request('http://localhost/unknown-endpoint', {
      method: 'GET',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toContain('404, not found!');
  });

  it('should handle CORS preflight requests', async () => {
    const request = new Request('http://localhost/miniApp/test', {
      method: 'OPTIONS',
    });

    const response = await worker.fetch(request, mockEnv, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(mockEnv.FRONTEND_URL);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  });
});
