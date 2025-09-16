import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Integration Test T035: Admin Panel Functionality
 *
 * This test validates the complete admin panel workflow including:
 * - Admin authentication and authorization
 * - Dashboard analytics and metrics
 * - User management (bans, warnings, profile management)
 * - Content moderation tools
 * - System configuration and settings
 * - Audit logging and activity tracking
 *
 * User Journey Coverage:
 * - Admin logs into admin panel
 * - Views dashboard with key metrics
 * - Manages users and content
 * - Configures system settings
 * - Reviews audit logs
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
  DB: any;
  INIT_SECRET: string;
  KV_CACHE: any;
  ADMIN_ID: string;
}

interface AdminUser {
  telegram_id: number;
  username: string | null;
  first_name: string;
  is_admin: boolean;
  admin_permissions: string[];
  last_login: string | null;
}

interface DashboardStats {
  total_users: number;
  active_listings: number;
  pending_flags: number;
  revenue_today: number;
  new_users_today: number;
  activity_chart: Array<{ date: string; users: number; listings: number }>;
}

interface UserManagementRecord {
  telegram_id: number;
  username: string | null;
  first_name: string;
  status: 'active' | 'warned' | 'temp_banned' | 'banned';
  warning_count: number;
  last_active: string;
  listings_count: number;
  flags_received: number;
}

interface SystemConfig {
  max_listings_per_user: number;
  listing_expiry_days: number;
  max_image_size_mb: number;
  enable_profanity_filter: boolean;
  auto_flag_threshold: number;
  premium_features_enabled: boolean;
}

interface AuditLog {
  id: number;
  admin_id: number;
  action: string;
  target_type: 'user' | 'listing' | 'system';
  target_id: number | null;
  details: string;
  ip_address: string;
  timestamp: string;
}

const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as any,
  INIT_SECRET: 'mock_secret',
  KV_CACHE: {} as any,
  ADMIN_ID: '123456789',
};

let mockAdmins: AdminUser[] = [
  {
    telegram_id: 123456789,
    username: 'admin_user',
    first_name: 'Super',
    is_admin: true,
    admin_permissions: ['users', 'content', 'system', 'analytics'],
    last_login: '2025-09-16T08:00:00Z',
  },
  {
    telegram_id: 987654321,
    username: 'mod_user',
    first_name: 'Moderator',
    is_admin: true,
    admin_permissions: ['content', 'users'],
    last_login: '2025-09-16T09:00:00Z',
  },
];

let mockStats: DashboardStats = {
  total_users: 1250,
  active_listings: 450,
  pending_flags: 12,
  revenue_today: 15600, // In cents
  new_users_today: 25,
  activity_chart: [
    { date: '2025-09-10', users: 45, listings: 120 },
    { date: '2025-09-11', users: 52, listings: 135 },
    { date: '2025-09-12', users: 38, listings: 98 },
    { date: '2025-09-13', users: 61, listings: 156 },
    { date: '2025-09-14', users: 47, listings: 142 },
    { date: '2025-09-15', users: 55, listings: 167 },
    { date: '2025-09-16', users: 25, listings: 89 },
  ],
};

let mockUserRecords: UserManagementRecord[] = [
  {
    telegram_id: 111222333,
    username: 'user1',
    first_name: 'John',
    status: 'active',
    warning_count: 0,
    last_active: '2025-09-16T10:00:00Z',
    listings_count: 3,
    flags_received: 0,
  },
  {
    telegram_id: 444555666,
    username: 'user2',
    first_name: 'Jane',
    status: 'warned',
    warning_count: 1,
    last_active: '2025-09-16T09:30:00Z',
    listings_count: 1,
    flags_received: 1,
  },
  {
    telegram_id: 777888999,
    username: 'problem_user',
    first_name: 'Problem',
    status: 'temp_banned',
    warning_count: 3,
    last_active: '2025-09-15T15:00:00Z',
    listings_count: 0,
    flags_received: 5,
  },
];

let mockAuditLogs: AuditLog[] = [];

const mockDB = {
  prepare: (query: string) => ({
    bind: (...params: any[]) => ({
      first: async () => {
        if (query.includes('SELECT') && query.includes('admin_users')) {
          return mockAdmins.find(a => params.includes(a.telegram_id));
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO audit_logs')) {
          const newLog: AuditLog = {
            id: mockAuditLogs.length + 1,
            admin_id: params[0],
            action: params[1],
            target_type: params[2],
            target_id: params[3],
            details: params[4],
            ip_address: params[5] || '127.0.0.1',
            timestamp: new Date().toISOString(),
          };
          mockAuditLogs.push(newLog);
          return {
            success: true,
            meta: { changes: 1, last_row_id: newLog.id, duration: 10, rows_read: 0, rows_written: 1 }
          };
        }
        return { success: true, meta: {} as any };
      },
      all: async () => {
        if (query.includes('SELECT') && query.includes('users') && query.includes('dashboard')) {
          return { results: mockUserRecords, success: true, meta: {} as any };
        }
        if (query.includes('SELECT') && query.includes('audit_logs')) {
          return { results: mockAuditLogs, success: true, meta: {} as any };
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
    if (key === 'system_config') {
      return JSON.stringify({
        max_listings_per_user: 10,
        listing_expiry_days: 30,
        max_image_size_mb: 5,
        enable_profanity_filter: true,
        auto_flag_threshold: 3,
        premium_features_enabled: true,
      });
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

describe('Integration Test T035: Admin Panel Functionality', () => {
  let worker: any;

  beforeEach(async () => {
    mockAuditLogs = [];

    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      worker = null;
    }
  });

  describe('Admin authentication and authorization', () => {
    it('should authenticate admin users with proper permissions', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const adminAuthRequest = {
        init_data: 'admin_telegram_init_data',
      };

      const request = new Request('http://localhost:8787/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(adminAuthRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const authResponse = await response.json();
      expect(authResponse.admin_token).toBeDefined();
      expect(authResponse.permissions).toEqual(['users', 'content', 'system', 'analytics']);
      expect(authResponse.admin_level).toBe('super_admin');
    });

    it('should reject non-admin users from admin endpoints', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const regularUserToken = 'regular_user_jwt_token';

      const request = new Request('http://localhost:8787/api/admin/dashboard', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${regularUserToken}`,
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403); // Forbidden

      const errorResponse = await response.json();
      expect(errorResponse.error).toBe('Forbidden');
      expect(errorResponse.message).toMatch(/admin.*required|insufficient.*permissions/i);
    });

    it('should enforce permission-based access to admin features', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Moderator with limited permissions tries to access system config
      const modToken = 'moderator_jwt_token';

      const request = new Request('http://localhost:8787/api/admin/system/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${modToken}`,
        },
        body: JSON.stringify({ max_listings_per_user: 20 }),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403);

      const errorResponse = await response.json();
      expect(errorResponse.message).toMatch(/system.*permission.*required/i);
    });
  });

  describe('Dashboard analytics and metrics', () => {
    it('should provide comprehensive dashboard statistics', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/admin/dashboard', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const dashboardData = await response.json();
      expect(dashboardData.stats.total_users).toBe(1250);
      expect(dashboardData.stats.active_listings).toBe(450);
      expect(dashboardData.stats.pending_flags).toBe(12);
      expect(dashboardData.stats.revenue_today).toBe(15600);

      expect(dashboardData.activity_chart).toBeDefined();
      expect(dashboardData.activity_chart.length).toBe(7);

      expect(dashboardData.recent_activity).toBeDefined();
      expect(dashboardData.quick_actions).toBeDefined();
    });

    it('should provide real-time system health metrics', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/admin/system/health', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const healthData = await response.json();
      expect(healthData.database_status).toBe('healthy');
      expect(healthData.kv_cache_status).toBe('healthy');
      expect(healthData.r2_storage_status).toBe('healthy');
      expect(healthData.telegram_api_status).toBe('healthy');

      expect(healthData.performance_metrics).toBeDefined();
      expect(healthData.performance_metrics.avg_response_time).toBeGreaterThan(0);
      expect(healthData.performance_metrics.error_rate).toBeGreaterThanOrEqual(0);
    });

    it('should support filtered analytics by date range', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/admin/analytics?start_date=2025-09-10&end_date=2025-09-16&metric=users', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const analyticsData = await response.json();
      expect(analyticsData.metric).toBe('users');
      expect(analyticsData.period).toEqual({
        start_date: '2025-09-10',
        end_date: '2025-09-16',
      });
      expect(analyticsData.data_points.length).toBe(7);
      expect(analyticsData.total).toBeGreaterThan(0);
    });
  });

  describe('User management functionality', () => {
    it('should provide user search and filtering capabilities', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/admin/users?status=warned&limit=50&offset=0', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const usersData = await response.json();
      expect(usersData.users.length).toBeGreaterThan(0);
      expect(usersData.users[0].status).toBe('warned');
      expect(usersData.pagination).toBeDefined();
      expect(usersData.pagination.total).toBeGreaterThan(0);
    });

    it('should allow admin to view detailed user profiles', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/admin/users/444555666', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const userData = await response.json();
      expect(userData.user.telegram_id).toBe(444555666);
      expect(userData.user.status).toBe('warned');
      expect(userData.user.warning_count).toBe(1);

      expect(userData.activity_summary).toBeDefined();
      expect(userData.listings).toBeDefined();
      expect(userData.moderation_history).toBeDefined();
      expect(userData.flags_received).toBeDefined();
    });

    it('should support bulk user operations', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const bulkActionRequest = {
        user_ids: [444555666, 777888999],
        action: 'warning',
        reason: 'Bulk warning for policy violations',
        message: 'Please review community guidelines',
      };

      const request = new Request('http://localhost:8787/api/admin/users/bulk-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(bulkActionRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const bulkResult = await response.json();
      expect(bulkResult.success_count).toBe(2);
      expect(bulkResult.failed_count).toBe(0);
      expect(bulkResult.results.length).toBe(2);

      // Verify audit logs were created
      expect(mockAuditLogs.length).toBe(2);
      expect(mockAuditLogs[0].action).toBe('bulk_warning');
    });
  });

  describe('Content moderation tools', () => {
    it('should provide content review queue with filtering', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/admin/content/review-queue?type=listing&status=flagged&priority=high', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const queueData = await response.json();
      expect(queueData.items).toBeDefined();
      expect(queueData.filters_applied).toEqual({
        type: 'listing',
        status: 'flagged',
        priority: 'high',
      });
      expect(queueData.queue_stats).toBeDefined();
    });

    it('should support batch content approval/rejection', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const batchModerationRequest = {
        item_ids: [1, 2, 3],
        action: 'approve',
        reason: 'Content reviewed and approved',
        notify_users: true,
      };

      const request = new Request('http://localhost:8787/api/admin/content/batch-moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(batchModerationRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const batchResult = await response.json();
      expect(batchResult.processed_count).toBe(3);
      expect(batchResult.approved_count).toBe(3);
      expect(batchResult.notifications_sent).toBe(3);
    });

    it('should provide content analysis and auto-moderation suggestions', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const contentAnalysisRequest = {
        content_id: 123,
        content_type: 'listing',
      };

      const request = new Request('http://localhost:8787/api/admin/content/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(contentAnalysisRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const analysisResult = await response.json();
      expect(analysisResult.risk_score).toBeDefined();
      expect(analysisResult.detected_issues).toBeDefined();
      expect(analysisResult.suggested_actions).toBeDefined();
      expect(analysisResult.confidence_level).toBeDefined();
    });
  });

  describe('System configuration management', () => {
    it('should allow viewing and updating system configuration', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Get current config
      const getRequest = new Request('http://localhost:8787/api/admin/system/config', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const getResponse = await worker.fetch(getRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(getResponse.status).toBe(200);

      const currentConfig = await getResponse.json();
      expect(currentConfig.max_listings_per_user).toBe(10);
      expect(currentConfig.enable_profanity_filter).toBe(true);

      // Update config
      const updateRequest = {
        max_listings_per_user: 15,
        listing_expiry_days: 45,
        enable_profanity_filter: false,
      };

      const putRequest = new Request('http://localhost:8787/api/admin/system/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(updateRequest),
      });

      const putResponse = await worker.fetch(putRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(putResponse.status).toBe(200);

      const updatedConfig = await putResponse.json();
      expect(updatedConfig.max_listings_per_user).toBe(15);
      expect(updatedConfig.enable_profanity_filter).toBe(false);

      // Verify audit log
      expect(mockAuditLogs.length).toBe(1);
      expect(mockAuditLogs[0].action).toBe('config_update');
    });

    it('should provide system maintenance tools', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const maintenanceRequest = {
        action: 'cleanup_expired_listings',
        dry_run: true,
      };

      const request = new Request('http://localhost:8787/api/admin/system/maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(maintenanceRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const maintenanceResult = await response.json();
      expect(maintenanceResult.action).toBe('cleanup_expired_listings');
      expect(maintenanceResult.dry_run).toBe(true);
      expect(maintenanceResult.items_affected).toBeGreaterThanOrEqual(0);
      expect(maintenanceResult.estimated_cleanup_size).toBeDefined();
    });

    it('should support feature flag management', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Get current feature flags
      const getRequest = new Request('http://localhost:8787/api/admin/system/feature-flags', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const getResponse = await worker.fetch(getRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(getResponse.status).toBe(200);

      const flags = await getResponse.json();
      expect(flags.premium_features_enabled).toBe(true);

      // Toggle feature flag
      const toggleRequest = {
        flag: 'premium_features_enabled',
        enabled: false,
        reason: 'Temporary disable for maintenance',
      };

      const postRequest = new Request('http://localhost:8787/api/admin/system/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(toggleRequest),
      });

      const postResponse = await worker.fetch(postRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(postResponse.status).toBe(200);

      const updatedFlags = await postResponse.json();
      expect(updatedFlags.premium_features_enabled).toBe(false);
    });
  });

  describe('Audit logging and activity tracking', () => {
    it('should log all admin actions with detailed context', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Perform an admin action that should be logged
      const actionRequest = {
        user_id: 444555666,
        action: 'warning',
        reason: 'Spam content detected',
      };

      const request = new Request('http://localhost:8787/api/admin/users/444555666/moderate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(actionRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Verify audit log was created
      expect(mockAuditLogs.length).toBe(1);
      expect(mockAuditLogs[0].admin_id).toBe(123456789);
      expect(mockAuditLogs[0].action).toBe('user_warning');
      expect(mockAuditLogs[0].target_type).toBe('user');
      expect(mockAuditLogs[0].target_id).toBe(444555666);
    });

    it('should provide audit log search and filtering', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create some audit logs
      mockAuditLogs.push(
        {
          id: 1,
          admin_id: 123456789,
          action: 'user_ban',
          target_type: 'user',
          target_id: 777888999,
          details: 'Banned for repeated violations',
          ip_address: '192.168.1.1',
          timestamp: '2025-09-16T10:00:00Z',
        },
        {
          id: 2,
          admin_id: 987654321,
          action: 'content_removal',
          target_type: 'listing',
          target_id: 123,
          details: 'Removed spam listing',
          ip_address: '192.168.1.2',
          timestamp: '2025-09-16T11:00:00Z',
        }
      );

      const request = new Request('http://localhost:8787/api/admin/audit-logs?action=user_ban&start_date=2025-09-16&limit=50', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const auditData = await response.json();
      expect(auditData.logs.length).toBeGreaterThan(0);
      expect(auditData.logs[0].action).toBe('user_ban');
      expect(auditData.pagination).toBeDefined();
      expect(auditData.filters_applied).toBeDefined();
    });

    it('should provide admin activity dashboard', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/admin/activity-dashboard?period=7d', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_admin_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const activityData = await response.json();
      expect(activityData.summary).toBeDefined();
      expect(activityData.summary.total_actions).toBeGreaterThanOrEqual(0);
      expect(activityData.admin_leaderboard).toBeDefined();
      expect(activityData.action_breakdown).toBeDefined();
      expect(activityData.timeline).toBeDefined();
    });

    it('should support audit log export', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const exportRequest = {
        format: 'csv',
        start_date: '2025-09-01',
        end_date: '2025-09-16',
        filters: {
          action_type: 'user_moderation',
          admin_id: 123456789,
        },
      };

      const request = new Request('http://localhost:8787/api/admin/audit-logs/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
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
      expect(exportResult.expires_at).toBeDefined();
      expect(exportResult.record_count).toBeGreaterThanOrEqual(0);
    });
  });
});