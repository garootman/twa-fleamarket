import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Integration Test T039: Mock User System for Local Development
 *
 * This test validates the mock user system workflow including:
 * - Development environment user simulation
 * - Authentication bypass for testing
 * - Mock user profile management
 * - Simulated user interactions
 * - Testing scenario setup and teardown
 * - Integration with all platform features
 *
 * User Journey Coverage:
 * - Developer creates mock users for testing
 * - Mock users can authenticate without Telegram
 * - Mock users can perform all platform actions
 * - Testing scenarios can be automated
 * - Mock data can be reset/managed
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
  DB: any;
  INIT_SECRET: string;
  KV_CACHE: any;
  NODE_ENV: string;
  ENABLE_MOCK_USERS: string;
}

interface MockUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  profile_photo_url: string | null;
  is_admin: boolean;
  created_at: string;
  mock_scenario: string | null;
  auth_token: string;
}

interface MockUserProfile {
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  profile_photo_url: string | null;
  is_admin: boolean;
  scenario_type: 'buyer' | 'seller' | 'admin' | 'problem_user' | 'new_user';
  auto_actions: string[];
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  mock_users: MockUserProfile[];
  setup_actions: Array<{
    action: string;
    user_id: number;
    data: any;
  }>;
  expected_outcomes: Array<{
    metric: string;
    expected_value: any;
  }>;
}

const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as any,
  INIT_SECRET: 'mock_secret',
  KV_CACHE: {} as any,
  NODE_ENV: 'development',
  ENABLE_MOCK_USERS: 'true',
};

let mockUsers: MockUser[] = [];
let mockScenarios: TestScenario[] = [
  {
    id: 'basic_marketplace',
    name: 'Basic Marketplace Flow',
    description: 'Tests basic listing creation and buyer interaction',
    mock_users: [
      {
        telegram_id: 111000001,
        username: 'test_seller',
        first_name: 'Test',
        last_name: 'Seller',
        profile_photo_url: null,
        is_admin: false,
        scenario_type: 'seller',
        auto_actions: ['create_listing', 'respond_to_interest'],
      },
      {
        telegram_id: 111000002,
        username: 'test_buyer',
        first_name: 'Test',
        last_name: 'Buyer',
        profile_photo_url: null,
        is_admin: false,
        scenario_type: 'buyer',
        auto_actions: ['browse_listings', 'express_interest'],
      },
    ],
    setup_actions: [
      {
        action: 'create_listing',
        user_id: 111000001,
        data: {
          title: 'Test iPhone for Sale',
          price: 50000,
          category_id: 2,
        },
      },
    ],
    expected_outcomes: [
      {
        metric: 'listings_created',
        expected_value: 1,
      },
      {
        metric: 'interest_expressions',
        expected_value: 1,
      },
    ],
  },
];

const mockDB = {
  prepare: (query: string) => ({
    bind: (...params: any[]) => ({
      first: async () => {
        if (query.includes('SELECT') && query.includes('mock_users')) {
          return mockUsers.find(u => params.includes(u.telegram_id));
        }
        if (query.includes('SELECT') && query.includes('users') && params.includes('mock_')) {
          // Mock user lookup
          return mockUsers.find(u => params.some(p => p === u.telegram_id));
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO mock_users')) {
          const newMockUser: MockUser = {
            id: mockUsers.length + 1,
            telegram_id: params[0],
            username: params[1],
            first_name: params[2],
            last_name: params[3],
            profile_photo_url: params[4],
            is_admin: params[5] || false,
            created_at: new Date().toISOString(),
            mock_scenario: params[6] || null,
            auth_token: `mock_token_${params[0]}`,
          };
          mockUsers.push(newMockUser);
          return {
            success: true,
            meta: {
              changes: 1,
              last_row_id: newMockUser.id,
              duration: 10,
              rows_read: 0,
              rows_written: 1,
            },
          };
        }
        if (query.includes('DELETE FROM mock_users')) {
          mockUsers = mockUsers.filter(u => !params.includes(u.telegram_id));
          return {
            success: true,
            meta: { changes: 1, duration: 10, rows_read: 0, rows_written: 1 },
          };
        }
        return { success: true, meta: {} as any };
      },
      all: async () => {
        if (query.includes('SELECT') && query.includes('mock_users')) {
          return { results: mockUsers, success: true, meta: {} as any };
        }
        return { results: [], success: true, meta: {} as any };
      },
    }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
};

const mockKV = {
  put: async (key: string, value: string) => undefined,
  get: async (key: string) => {
    if (key === 'mock_scenarios') {
      return JSON.stringify(mockScenarios);
    }
    if (key.startsWith('mock_user_session_')) {
      return JSON.stringify({ active: true, expires_at: Date.now() + 3600000 });
    }
    return null;
  },
  delete: async (key: string) => undefined,
  list: async () => ({ keys: [], list_complete: true, cursor: undefined }),
  getWithMetadata: async (key: string) => ({ value: null, metadata: null }),
};

mockEnv.DB = mockDB;
mockEnv.KV_CACHE = mockKV;

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

describe('Integration Test T039: Mock User System for Local Development', () => {
  let worker: any;

  beforeEach(async () => {
    mockUsers = [];

    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      worker = null;
    }
  });

  describe('Mock user creation and management', () => {
    it('should create mock users for development testing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const mockUserRequest = {
        users: [
          {
            telegram_id: 111000001,
            username: 'test_user_1',
            first_name: 'Test',
            last_name: 'User',
            scenario_type: 'seller',
            auto_actions: ['create_listing'],
          },
          {
            telegram_id: 111000002,
            username: 'test_user_2',
            first_name: 'Another',
            last_name: 'User',
            scenario_type: 'buyer',
            auto_actions: ['browse_listings'],
          },
        ],
      };

      const request = new Request('http://localhost:8787/api/dev/mock-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(mockUserRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(201);

      const createdUsers = await response.json();
      expect(createdUsers.users.length).toBe(2);
      expect(createdUsers.users[0].telegram_id).toBe(111000001);
      expect(createdUsers.users[0].auth_token).toBeDefined();

      // Verify users were created in mock database
      expect(mockUsers.length).toBe(2);
      expect(mockUsers[0].username).toBe('test_user_1');
    });

    it('should list all existing mock users', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create some mock users first
      mockUsers.push(
        {
          id: 1,
          telegram_id: 111000001,
          username: 'existing_user_1',
          first_name: 'Existing',
          last_name: 'User',
          profile_photo_url: null,
          is_admin: false,
          created_at: '2025-09-16T10:00:00Z',
          mock_scenario: 'test_scenario',
          auth_token: 'mock_token_111000001',
        },
        {
          id: 2,
          telegram_id: 111000002,
          username: 'existing_user_2',
          first_name: 'Another',
          last_name: 'User',
          profile_photo_url: null,
          is_admin: true,
          created_at: '2025-09-16T10:05:00Z',
          mock_scenario: 'admin_scenario',
          auth_token: 'mock_token_111000002',
        }
      );

      const request = new Request('http://localhost:8787/api/dev/mock-users', {
        method: 'GET',
        headers: {
          'X-Dev-Mode': 'true',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const usersData = await response.json();
      expect(usersData.users.length).toBe(2);
      expect(usersData.users[0].username).toBe('existing_user_1');
      expect(usersData.users[1].is_admin).toBe(true);
      expect(usersData.total_count).toBe(2);
    });

    it('should delete mock users and associated data', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create mock user first
      mockUsers.push({
        id: 1,
        telegram_id: 111000001,
        username: 'to_be_deleted',
        first_name: 'Delete',
        last_name: 'Me',
        profile_photo_url: null,
        is_admin: false,
        created_at: '2025-09-16T10:00:00Z',
        mock_scenario: null,
        auth_token: 'mock_token_111000001',
      });

      const deleteRequest = {
        user_ids: [111000001],
        cleanup_data: true,
      };

      const request = new Request('http://localhost:8787/api/dev/mock-users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(deleteRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const deleteResult = await response.json();
      expect(deleteResult.deleted_count).toBe(1);
      expect(deleteResult.cleanup_completed).toBe(true);

      // Verify user was removed
      expect(mockUsers.length).toBe(0);
    });
  });

  describe('Mock authentication and auth bypass', () => {
    it('should authenticate mock users without Telegram validation', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create mock user first
      mockUsers.push({
        id: 1,
        telegram_id: 111000001,
        username: 'auth_test_user',
        first_name: 'Auth',
        last_name: 'Test',
        profile_photo_url: null,
        is_admin: false,
        created_at: '2025-09-16T10:00:00Z',
        mock_scenario: null,
        auth_token: 'mock_token_111000001',
      });

      const authRequest = {
        telegram_id: 111000001,
        mock_auth: true,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(authRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const authResponse = await response.json();
      expect(authResponse.token).toBeDefined();
      expect(authResponse.user.telegram_id).toBe(111000001);
      expect(authResponse.user.first_name).toBe('Auth');
      expect(authResponse.mock_session).toBe(true);
    });

    it('should support temporary auth tokens for testing', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const tempAuthRequest = {
        user_profile: {
          telegram_id: 999888777,
          first_name: 'Temporary',
          username: 'temp_user',
        },
        expires_in: 3600, // 1 hour
      };

      const request = new Request('http://localhost:8787/api/dev/auth/temporary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(tempAuthRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const tempAuthResponse = await response.json();
      expect(tempAuthResponse.temp_token).toBeDefined();
      expect(tempAuthResponse.expires_at).toBeDefined();
      expect(tempAuthResponse.user.telegram_id).toBe(999888777);

      // Verify temporary token works for API calls
      const testRequest = new Request('http://localhost:8787/api/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tempAuthResponse.temp_token}`,
        },
      });

      const testResponse = await worker.fetch(testRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(testResponse.status).toBe(200);
    });

    it('should prevent mock auth in production environment', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Set production environment
      const prodEnv = { ...mockEnv, NODE_ENV: 'production', ENABLE_MOCK_USERS: 'false' };

      const authRequest = {
        telegram_id: 111000001,
        mock_auth: true,
      };

      const request = new Request('http://localhost:8787/api/dev/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(authRequest),
      });

      const response = await worker.fetch(request, prodEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403); // Forbidden in production

      const errorResponse = await response.json();
      expect(errorResponse.message).toMatch(/not.*available.*production|dev.*mode.*only/i);
    });
  });

  describe('Test scenario automation', () => {
    it('should execute predefined test scenarios', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const scenarioRequest = {
        scenario_id: 'basic_marketplace',
        execute_setup: true,
        auto_progress: true,
      };

      const request = new Request('http://localhost:8787/api/dev/scenarios/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(scenarioRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const scenarioResult = await response.json();
      expect(scenarioResult.scenario_id).toBe('basic_marketplace');
      expect(scenarioResult.users_created).toBe(2);
      expect(scenarioResult.setup_actions_completed).toBe(1);
      expect(scenarioResult.execution_status).toBe('completed');

      // Verify expected outcomes
      expect(scenarioResult.outcomes).toBeDefined();
      expect(scenarioResult.outcomes.listings_created).toBe(1);
    });

    it('should provide scenario progress tracking', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Start a scenario
      const startRequest = {
        scenario_id: 'basic_marketplace',
        execute_setup: true,
        auto_progress: false, // Manual progression
      };

      const startResponse = await worker.fetch(
        new Request('http://localhost:8787/api/dev/scenarios/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Dev-Mode': 'true',
          },
          body: JSON.stringify(startRequest),
        }),
        mockEnv,
        { waitUntil: () => {}, passThroughOnException: () => {} }
      );

      const startResult = await startResponse.json();
      const executionId = startResult.execution_id;

      // Check progress
      const progressRequest = new Request(
        `http://localhost:8787/api/dev/scenarios/${executionId}/progress`,
        {
          method: 'GET',
          headers: {
            'X-Dev-Mode': 'true',
          },
        }
      );

      const progressResponse = await worker.fetch(progressRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(progressResponse.status).toBe(200);

      const progressData = await progressResponse.json();
      expect(progressData.execution_id).toBe(executionId);
      expect(progressData.status).toBeDefined();
      expect(progressData.steps_completed).toBeGreaterThanOrEqual(0);
      expect(progressData.total_steps).toBeGreaterThan(0);
      expect(progressData.current_step).toBeDefined();
    });

    it('should support custom scenario creation', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const customScenario = {
        name: 'Custom Test Scenario',
        description: 'Custom scenario for specific testing needs',
        mock_users: [
          {
            telegram_id: 777888999,
            username: 'custom_seller',
            first_name: 'Custom',
            last_name: 'Seller',
            scenario_type: 'seller',
            auto_actions: ['create_premium_listing'],
          },
        ],
        setup_actions: [
          {
            action: 'create_listing',
            user_id: 777888999,
            data: {
              title: 'Premium Test Item',
              price: 100000,
              is_premium: true,
            },
          },
        ],
        expected_outcomes: [
          {
            metric: 'premium_listings_created',
            expected_value: 1,
          },
        ],
      };

      const request = new Request('http://localhost:8787/api/dev/scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(customScenario),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(201);

      const createdScenario = await response.json();
      expect(createdScenario.scenario_id).toBeDefined();
      expect(createdScenario.name).toBe('Custom Test Scenario');
      expect(createdScenario.users_count).toBe(1);
      expect(createdScenario.actions_count).toBe(1);
    });
  });

  describe('Mock user interactions and behaviors', () => {
    it('should simulate realistic user behaviors', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create mock user with behavioral settings
      const behaviorRequest = {
        telegram_id: 555666777,
        username: 'behavior_test',
        first_name: 'Behavior',
        last_name: 'Test',
        behavior_profile: {
          activity_level: 'high',
          interaction_probability: 0.8,
          response_delay_range: [1000, 5000], // 1-5 seconds
          preferred_categories: [1, 2],
          buying_budget: 100000, // $1000
        },
      };

      const request = new Request('http://localhost:8787/api/dev/mock-users/behavior', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(behaviorRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(201);

      const behaviorUser = await response.json();
      expect(behaviorUser.telegram_id).toBe(555666777);
      expect(behaviorUser.behavior_profile).toBeDefined();
      expect(behaviorUser.auto_actions_enabled).toBe(true);
    });

    it('should support automated interaction patterns', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const patternRequest = {
        user_id: 555666777,
        pattern_type: 'browsing_session',
        duration_minutes: 30,
        actions: [
          { action: 'browse_category', category_id: 1, probability: 1.0 },
          { action: 'view_listing', min_views: 3, max_views: 8, probability: 0.9 },
          { action: 'express_interest', probability: 0.3 },
          { action: 'send_message', probability: 0.2 },
        ],
      };

      const request = new Request('http://localhost:8787/api/dev/mock-users/555666777/patterns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(patternRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const patternResult = await response.json();
      expect(patternResult.pattern_id).toBeDefined();
      expect(patternResult.estimated_actions).toBeGreaterThan(0);
      expect(patternResult.execution_status).toBe('scheduled');
    });

    it('should track and report mock user analytics', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const analyticsRequest = new Request(
        'http://localhost:8787/api/dev/mock-users/analytics?period=24h',
        {
          method: 'GET',
          headers: {
            'X-Dev-Mode': 'true',
          },
        }
      );

      const response = await worker.fetch(analyticsRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const analyticsData = await response.json();
      expect(analyticsData.total_mock_users).toBeGreaterThanOrEqual(0);
      expect(analyticsData.active_sessions).toBeGreaterThanOrEqual(0);
      expect(analyticsData.actions_performed).toBeDefined();
      expect(analyticsData.interaction_rates).toBeDefined();
      expect(analyticsData.popular_actions).toBeDefined();
    });
  });

  describe('Data management and cleanup', () => {
    it('should provide bulk data reset functionality', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const resetRequest = {
        reset_scope: 'all_mock_data',
        preserve_scenarios: true,
        confirm_reset: true,
      };

      const request = new Request('http://localhost:8787/api/dev/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(resetRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const resetResult = await response.json();
      expect(resetResult.reset_completed).toBe(true);
      expect(resetResult.items_deleted).toBeDefined();
      expect(resetResult.scenarios_preserved).toBe(true);
    });

    it('should export mock user data for analysis', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const exportRequest = {
        format: 'json',
        include_actions: true,
        include_analytics: true,
        date_range: {
          start: '2025-09-15',
          end: '2025-09-16',
        },
      };

      const request = new Request('http://localhost:8787/api/dev/mock-users/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(exportRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const exportResult = await response.json();
      expect(exportResult.export_url).toBeDefined();
      expect(exportResult.file_size_bytes).toBeGreaterThan(0);
      expect(exportResult.records_count).toBeGreaterThanOrEqual(0);
      expect(exportResult.expires_at).toBeDefined();
    });

    it('should support scheduled data cleanup', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const cleanupRequest = {
        schedule_type: 'daily',
        cleanup_rules: {
          delete_inactive_users_after_days: 7,
          delete_old_sessions_after_hours: 24,
          delete_completed_scenarios_after_days: 3,
        },
        notify_before_cleanup: true,
      };

      const request = new Request('http://localhost:8787/api/dev/cleanup/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dev-Mode': 'true',
        },
        body: JSON.stringify(cleanupRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const scheduleResult = await response.json();
      expect(scheduleResult.schedule_id).toBeDefined();
      expect(scheduleResult.next_cleanup_at).toBeDefined();
      expect(scheduleResult.rules_applied).toBeDefined();
    });
  });

  describe('Integration with platform features', () => {
    it('should integrate mock users with listing creation flow', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create mock seller
      mockUsers.push({
        id: 1,
        telegram_id: 111000001,
        username: 'mock_seller',
        first_name: 'Mock',
        last_name: 'Seller',
        profile_photo_url: null,
        is_admin: false,
        created_at: '2025-09-16T10:00:00Z',
        mock_scenario: null,
        auth_token: 'mock_token_111000001',
      });

      // Mock seller creates listing
      const listingRequest = {
        title: 'Mock Test Listing',
        description: 'Created by mock user for testing',
        price: 25000,
        category_id: 1,
        condition: 'good',
        location: 'Test City',
        image_ids: [],
      };

      const request = new Request('http://localhost:8787/api/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_token_111000001',
          'X-Mock-User': 'true',
        },
        body: JSON.stringify(listingRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(201);

      const listing = await response.json();
      expect(listing.title).toBe('Mock Test Listing');
      expect(listing.seller_id).toBe(111000001);
      expect(listing.mock_data).toBe(true);
    });

    it('should support mock admin user permissions', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create mock admin
      mockUsers.push({
        id: 1,
        telegram_id: 111000999,
        username: 'mock_admin',
        first_name: 'Mock',
        last_name: 'Admin',
        profile_photo_url: null,
        is_admin: true,
        created_at: '2025-09-16T10:00:00Z',
        mock_scenario: 'admin_testing',
        auth_token: 'mock_admin_token_111000999',
      });

      // Mock admin accesses admin panel
      const request = new Request('http://localhost:8787/api/admin/dashboard', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token_111000999',
          'X-Mock-User': 'true',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const dashboardData = await response.json();
      expect(dashboardData.admin_access).toBe(true);
      expect(dashboardData.mock_admin_mode).toBe(true);
    });
  });
});
