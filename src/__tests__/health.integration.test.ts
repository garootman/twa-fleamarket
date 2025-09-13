import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Integration test for health endpoint using real local services
// Skip in CI environments or when SKIP_INTEGRATION_TESTS is set
const shouldSkip =
  process.env.CI || process.env.GITHUB_ACTIONS || process.env.SKIP_INTEGRATION_TESTS;

// Skip if we're in CI or integration tests are disabled
if (shouldSkip) {
  describe.skip('Health Endpoint Integration (Skipped in CI)', () => {
    it('skipped', () => {});
  });
} else {
  describe('Health Endpoint Integration', () => {
    const WORKER_PORT = 8787;
    const BASE_URL = `http://localhost:${WORKER_PORT}`;

    beforeAll(async () => {
      // Note: This test assumes the worker is running with real D1/KV/R2 services
      // Run with: npm run dev (or make health)

      // Wait a bit for services to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    afterAll(async () => {
      // Cleanup if needed
    });

    it('should return health status from real services', async () => {
      try {
        const response = await fetch(`${BASE_URL}/health`);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/json');

        const healthData = (await response.json()) as any;

        // Basic structure validation
        expect(healthData).toHaveProperty('timestamp');
        expect(healthData).toHaveProperty('overall');
        expect(healthData).toHaveProperty('services');

        // Should have all three services
        expect(healthData.services).toHaveProperty('database');
        expect(healthData.services).toHaveProperty('kv');
        expect(healthData.services).toHaveProperty('r2');

        // Each service should have required properties
        ['database', 'kv', 'r2'].forEach(service => {
          expect(healthData.services[service]).toHaveProperty('status');
          expect(healthData.services[service]).toHaveProperty('message');
          expect(healthData.services[service]).toHaveProperty('timestamp');
        });

        // Log the actual response for debugging
        console.log('Health check response:', JSON.stringify(healthData, null, 2));

        // Overall status should be ok, degraded, or error
        expect(['ok', 'degraded', 'error']).toContain(healthData.overall);
      } catch (error) {
        console.error('Health endpoint test failed:', error);
        console.log(`Make sure the worker is running on ${BASE_URL}`);
        console.log('Run: npm run dev (or make worker-start)');
        throw error;
      }
    }, 30000); // 30 second timeout for integration test

    it('should handle database connectivity', async () => {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        const healthData = (await response.json()) as any;

        // Database should either be ok or have a specific error
        const dbStatus = healthData.services.database.status;
        expect(['ok', 'error']).toContain(dbStatus);

        if (dbStatus === 'ok') {
          expect(healthData.services.database.message).toBe('Database connection successful');
          // Database timestamp format: "2025-09-13 02:18:25" (space instead of T)
          expect(healthData.services.database.timestamp).toMatch(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
          );
        }
      } catch (error) {
        console.error('Database health test failed:', error);
        throw error;
      }
    });

    it('should handle KV storage connectivity', async () => {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        const healthData = (await response.json()) as any;

        // KV should either be ok or have a specific error
        const kvStatus = healthData.services.kv.status;
        expect(['ok', 'error']).toContain(kvStatus);

        if (kvStatus === 'ok') {
          expect(healthData.services.kv.message).toBe('KV storage read/write successful');
          expect(healthData.services.kv.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
        }
      } catch (error) {
        console.error('KV health test failed:', error);
        throw error;
      }
    });

    it('should handle R2 storage connectivity', async () => {
      try {
        const response = await fetch(`${BASE_URL}/health`);
        const healthData = (await response.json()) as any;

        // R2 should either be ok or have a specific error
        const r2Status = healthData.services.r2.status;
        expect(['ok', 'error']).toContain(r2Status);

        if (r2Status === 'ok') {
          expect(healthData.services.r2.message).toBe('R2 storage upload/retrieve successful');
          expect(healthData.services.r2.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
          expect(healthData.services.r2).toHaveProperty('imageUrl');
        }
      } catch (error) {
        console.error('R2 health test failed:', error);
        throw error;
      }
    });
  });
}
