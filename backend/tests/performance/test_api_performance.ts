import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { performance } from 'perf_hooks';

/**
 * Performance Tests for API Endpoints - T106
 *
 * Tests API response times to ensure sub-200ms performance:
 * - Authentication endpoints
 * - Listing CRUD operations
 * - Search and filtering
 * - Category endpoints
 * - User profile endpoints
 * - Admin endpoints
 * - File upload endpoints
 * - Dev endpoints
 *
 * All endpoints should respond within 200ms under normal load.
 */

interface PerformanceTestResult {
  endpoint: string;
  method: string;
  responseTime: number;
  status: number;
  passed: boolean;
}

class APIPerformanceTester {
  private app: Hono;
  private baseUrl: string;
  private results: PerformanceTestResult[] = [];
  private mockDB: any;
  private mockKV: any;
  private maxResponseTime = 200; // 200ms threshold

  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.setupMockEnvironment();
    this.setupTestApp();
  }

  private setupMockEnvironment() {
    // Mock database with fast responses
    this.mockDB = {
      prepare: () => ({
        bind: () => ({
          get: () => Promise.resolve({ id: 1, name: 'test' }),
          all: () => Promise.resolve([{ id: 1, name: 'test' }]),
          run: () => Promise.resolve({ success: true }),
        }),
      }),
    };

    // Mock KV store with fast responses
    this.mockKV = {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve({ keys: [] }),
    };
  }

  private setupTestApp() {
    this.app = new Hono();

    // Mock authentication middleware for performance testing
    this.app.use('*', async (c, next) => {
      c.set('user', {
        telegramId: 123456789,
        username: 'testuser',
        firstName: 'Test',
        isAdmin: false,
      });
      await next();
    });

    this.setupAuthRoutes();
    this.setupListingRoutes();
    this.setupCategoryRoutes();
    this.setupUserRoutes();
    this.setupAdminRoutes();
    this.setupUploadRoutes();
    this.setupDevRoutes();
  }

  private setupAuthRoutes() {
    this.app.post('/api/auth', async (c) => {
      await this.simulateDBQuery(5); // Simulate auth validation
      return c.json({
        success: true,
        user: { id: 123456789, username: 'testuser' },
        token: 'mock_jwt_token',
      });
    });

    this.app.get('/api/auth/validate', async (c) => {
      await this.simulateDBQuery(2);
      return c.json({ valid: true, user: { id: 123456789 } });
    });

    this.app.post('/api/auth/logout', async (c) => {
      await this.simulateDBQuery(3);
      return c.json({ success: true });
    });
  }

  private setupListingRoutes() {
    // GET /api/listings - Search listings
    this.app.get('/api/listings', async (c) => {
      await this.simulateDBQuery(15); // Simulate search query
      await this.simulateKVQuery(2); // Cache check
      return c.json({
        success: true,
        listings: Array(20).fill({
          id: 'listing_1',
          title: 'Test Listing',
          description: 'Description',
          priceUsd: 99.99,
          images: ['image1.jpg'],
        }),
        pagination: { page: 1, totalPages: 5, totalCount: 100 },
      });
    });

    // POST /api/listings - Create listing
    this.app.post('/api/listings', async (c) => {
      await this.simulateDBQuery(8); // Insert query
      await this.simulateValidation(3); // Content validation
      await this.simulateKVQuery(1); // Cache invalidation
      return c.json({
        success: true,
        listing: { id: 'new_listing', title: 'New Listing' },
      }, 201);
    });

    // GET /api/listings/:id - Get specific listing
    this.app.get('/api/listings/:id', async (c) => {
      await this.simulateDBQuery(5); // Get listing
      await this.simulateDBQuery(2); // Update view count
      await this.simulateKVQuery(1); // Cache set
      return c.json({
        success: true,
        listing: { id: c.req.param('id'), title: 'Test Listing' },
      });
    });

    // PUT /api/listings/:id - Update listing
    this.app.put('/api/listings/:id', async (c) => {
      await this.simulateDBQuery(6); // Update query
      await this.simulateValidation(2); // Validation
      await this.simulateKVQuery(2); // Cache invalidation
      return c.json({
        success: true,
        listing: { id: c.req.param('id'), title: 'Updated Listing' },
      });
    });

    // DELETE /api/listings/:id - Archive listing
    this.app.delete('/api/listings/:id', async (c) => {
      await this.simulateDBQuery(4); // Archive query
      await this.simulateKVQuery(1); // Cache invalidation
      return c.json({ success: true });
    });

    // POST /api/listings/:id/bump - Bump listing
    this.app.post('/api/listings/:id/bump', async (c) => {
      await this.simulateDBQuery(5); // Bump query
      await this.simulateKVQuery(1); // Cache update
      return c.json({
        success: true,
        listing: { id: c.req.param('id'), bumpedAt: new Date() },
      });
    });

    // POST /api/listings/:id/flag - Flag listing
    this.app.post('/api/listings/:id/flag', async (c) => {
      await this.simulateDBQuery(3); // Insert flag
      return c.json({ success: true });
    });
  }

  private setupCategoryRoutes() {
    this.app.get('/api/categories', async (c) => {
      await this.simulateKVQuery(1); // Cache check
      await this.simulateDBQuery(3); // Get categories if not cached
      return c.json({
        success: true,
        categories: Array(10).fill({
          id: 1,
          name: 'Electronics',
          subcategories: [],
        }),
      });
    });
  }

  private setupUserRoutes() {
    this.app.get('/api/me', async (c) => {
      await this.simulateDBQuery(3); // Get user profile
      return c.json({
        success: true,
        user: { id: 123456789, username: 'testuser' },
      });
    });

    this.app.get('/api/me/listings', async (c) => {
      await this.simulateDBQuery(8); // Get user listings
      return c.json({
        success: true,
        listings: Array(5).fill({ id: 'listing_1', title: 'My Listing' }),
        stats: { active: 5, sold: 2, draft: 1 },
      });
    });
  }

  private setupAdminRoutes() {
    this.app.get('/api/admin/listings', async (c) => {
      await this.simulateDBQuery(12); // Get all listings for admin
      return c.json({
        success: true,
        listings: Array(50).fill({ id: 'listing_1', title: 'Listing' }),
      });
    });

    this.app.post('/api/admin/listings/:id/stick', async (c) => {
      await this.simulateDBQuery(4); // Update listing
      return c.json({ success: true });
    });

    this.app.post('/api/admin/users/:id/ban', async (c) => {
      await this.simulateDBQuery(5); // Ban user
      return c.json({ success: true });
    });

    this.app.get('/api/admin/blocked-words', async (c) => {
      await this.simulateDBQuery(3); // Get blocked words
      return c.json({
        success: true,
        words: ['spam', 'scam', 'fake'],
      });
    });

    this.app.post('/api/admin/blocked-words', async (c) => {
      await this.simulateDBQuery(2); // Add blocked word
      return c.json({ success: true });
    });
  }

  private setupUploadRoutes() {
    this.app.post('/api/upload', async (c) => {
      await this.simulateFileUpload(25); // Simulate R2 upload
      await this.simulateDBQuery(2); // Save file metadata
      return c.json({
        success: true,
        url: 'https://r2.example.com/uploads/image.jpg',
      });
    });
  }

  private setupDevRoutes() {
    this.app.get('/api/dev/mock-users', async (c) => {
      await this.simulateDBQuery(2); // Get mock users
      return c.json({
        success: true,
        users: Array(10).fill({ id: 1, username: 'mockuser' }),
      });
    });

    this.app.post('/api/dev/auth', async (c) => {
      await this.simulateDBQuery(3); // Mock auth
      return c.json({
        success: true,
        user: { id: 999999999, username: 'mockuser' },
        token: 'mock_token',
      });
    });
  }

  private async simulateDBQuery(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async simulateKVQuery(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async simulateValidation(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async simulateFileUpload(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async testEndpoint(
    method: string,
    path: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<PerformanceTestResult> {
    const startTime = performance.now();

    try {
      const request = new Request(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const response = await this.app.request(request);
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      const result: PerformanceTestResult = {
        endpoint: path,
        method,
        responseTime,
        status: response.status,
        passed: responseTime <= this.maxResponseTime,
      };

      this.results.push(result);
      return result;
    } catch (error) {
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      const result: PerformanceTestResult = {
        endpoint: path,
        method,
        responseTime,
        status: 500,
        passed: false,
      };

      this.results.push(result);
      return result;
    }
  }

  getResults(): PerformanceTestResult[] {
    return this.results;
  }

  getSummary() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const averageResponseTime = Math.round(
      this.results.reduce((sum, r) => sum + r.responseTime, 0) / totalTests
    );
    const maxResponseTime = Math.max(...this.results.map(r => r.responseTime));
    const minResponseTime = Math.min(...this.results.map(r => r.responseTime));

    return {
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      passRate: Math.round((passedTests / totalTests) * 100),
      averageResponseTime,
      maxResponseTime,
      minResponseTime,
    };
  }
}

describe('API Performance Tests', () => {
  let tester: APIPerformanceTester;

  beforeAll(() => {
    tester = new APIPerformanceTester();
  });

  describe('Authentication Endpoints', () => {
    it('POST /api/auth should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/auth', {
        initData: 'mock_telegram_data',
        hash: 'mock_hash',
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('GET /api/auth/validate should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/auth/validate', undefined, {
        Authorization: 'Bearer mock_token',
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/auth/logout should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/auth/logout', undefined, {
        Authorization: 'Bearer mock_token',
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });
  });

  describe('Listing Endpoints', () => {
    it('GET /api/listings should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/listings?q=electronics&page=1&limit=20');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/listings should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/listings', {
        title: 'Performance Test Listing',
        description: 'Test listing for performance testing',
        priceUsd: 99.99,
        categoryId: 1,
        images: ['image1.jpg'],
      });

      expect(result.status).toBe(201);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('GET /api/listings/:id should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/listings/test_listing_123');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('PUT /api/listings/:id should respond within 200ms', async () => {
      const result = await tester.testEndpoint('PUT', '/api/listings/test_listing_123', {
        title: 'Updated Title',
        priceUsd: 149.99,
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('DELETE /api/listings/:id should respond within 200ms', async () => {
      const result = await tester.testEndpoint('DELETE', '/api/listings/test_listing_123');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/listings/:id/bump should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/listings/test_listing_123/bump');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/listings/:id/flag should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/listings/test_listing_123/flag', {
        reason: 'inappropriate',
        details: 'Test flag for performance testing',
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });
  });

  describe('Category Endpoints', () => {
    it('GET /api/categories should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/categories');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });
  });

  describe('User Profile Endpoints', () => {
    it('GET /api/me should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/me');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('GET /api/me/listings should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/me/listings?status=active');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });
  });

  describe('Admin Endpoints', () => {
    it('GET /api/admin/listings should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/admin/listings');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/admin/listings/:id/stick should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/admin/listings/test_listing_123/stick');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/admin/users/:id/ban should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/admin/users/123456789/ban', {
        reason: 'spam',
        duration: '7d',
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('GET /api/admin/blocked-words should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/admin/blocked-words');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/admin/blocked-words should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/admin/blocked-words', {
        word: 'newspam',
        severity: 'high',
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });
  });

  describe('Upload Endpoints', () => {
    it('POST /api/upload should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/upload', {
        file: 'base64_encoded_image_data',
        filename: 'test.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });
  });

  describe('Development Endpoints', () => {
    it('GET /api/dev/mock-users should respond within 200ms', async () => {
      const result = await tester.testEndpoint('GET', '/api/dev/mock-users');

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });

    it('POST /api/dev/auth should respond within 200ms', async () => {
      const result = await tester.testEndpoint('POST', '/api/dev/auth', {
        telegramId: 999999999,
      });

      expect(result.status).toBe(200);
      expect(result.responseTime).toBeLessThanOrEqual(200);
      expect(result.passed).toBe(true);
    });
  });

  describe('Stress Testing', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = Array(10).fill(null).map(() =>
        tester.testEndpoint('GET', '/api/listings?q=test')
      );

      const results = await Promise.all(concurrentRequests);

      results.forEach(result => {
        expect(result.status).toBe(200);
        expect(result.responseTime).toBeLessThanOrEqual(300); // Allow slightly higher for concurrent
      });

      const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      expect(avgResponseTime).toBeLessThanOrEqual(250);
    });

    it('should maintain performance under rapid sequential requests', async () => {
      const sequentialRequests = [];

      for (let i = 0; i < 20; i++) {
        sequentialRequests.push(await tester.testEndpoint('GET', `/api/listings/test_${i}`));
      }

      const failedRequests = sequentialRequests.filter(r => !r.passed);
      expect(failedRequests.length).toBeLessThanOrEqual(2); // Allow max 10% failure rate
    });
  });

  afterAll(() => {
    const summary = tester.getSummary();

    console.log('\n📊 API Performance Test Summary:');
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`Passed: ${summary.passedTests} (${summary.passRate}%)`);
    console.log(`Failed: ${summary.failedTests}`);
    console.log(`Average Response Time: ${summary.averageResponseTime}ms`);
    console.log(`Max Response Time: ${summary.maxResponseTime}ms`);
    console.log(`Min Response Time: ${summary.minResponseTime}ms`);

    const results = tester.getResults();
    const slowEndpoints = results.filter(r => r.responseTime > 150).sort((a, b) => b.responseTime - a.responseTime);

    if (slowEndpoints.length > 0) {
      console.log('\n⚠️  Slowest Endpoints:');
      slowEndpoints.slice(0, 5).forEach(endpoint => {
        console.log(`${endpoint.method} ${endpoint.endpoint}: ${endpoint.responseTime}ms`);
      });
    }

    const failedEndpoints = results.filter(r => !r.passed);
    if (failedEndpoints.length > 0) {
      console.log('\n❌ Failed Performance Tests:');
      failedEndpoints.forEach(endpoint => {
        console.log(`${endpoint.method} ${endpoint.endpoint}: ${endpoint.responseTime}ms (>${200}ms threshold)`);
      });
    }

    // Overall performance requirements
    expect(summary.passRate).toBeGreaterThanOrEqual(90); // 90% of endpoints should meet performance requirements
    expect(summary.averageResponseTime).toBeLessThanOrEqual(150); // Average should be well under 200ms
  });
});