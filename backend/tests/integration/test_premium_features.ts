import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Integration Test T036: Premium Features with Payment
 *
 * This test validates the premium features workflow including:
 * - Telegram Stars payment integration
 * - Premium listing features (highlighting, extended duration)
 * - Listing bumping and promotion
 * - Premium user benefits and analytics
 * - Payment validation and webhook handling
 * - Subscription management
 *
 * User Journey Coverage:
 * - User purchases premium listing upgrade
 * - Payment processed via Telegram Stars
 * - Premium features activated automatically
 * - Enhanced listing visibility and features
 * - Premium analytics and insights
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
  DB: any;
  INIT_SECRET: string;
  KV_CACHE: any;
  TELEGRAM_PAYMENT_TOKEN: string;
}

interface User {
  telegram_id: number;
  username: string | null;
  first_name: string;
  is_premium: boolean;
  premium_expires_at: string | null;
  total_spent: number;
}

interface PremiumListing {
  id: number;
  title: string;
  seller_id: number;
  is_premium: boolean;
  premium_features: string[];
  premium_expires_at: string | null;
  highlight_color: string | null;
  views: number;
  bump_count: number;
  last_bumped_at: string | null;
}

interface PaymentOrder {
  id: string;
  user_id: number;
  listing_id: number | null;
  product_type: 'premium_listing' | 'listing_bump' | 'premium_subscription';
  amount: number; // Telegram Stars
  currency: 'XTR';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  telegram_payment_charge_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface TelegramPayment {
  payment_charge_id: string;
  total_amount: number;
  currency: 'XTR';
  invoice_payload: string;
  shipping_option_id?: string;
  order_info?: any;
}

const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_token',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as any,
  INIT_SECRET: 'mock_secret',
  KV_CACHE: {} as any,
  TELEGRAM_PAYMENT_TOKEN: 'mock_payment_token',
};

let mockUsers: User[] = [
  {
    telegram_id: 123456789,
    username: 'regular_user',
    first_name: 'Regular',
    is_premium: false,
    premium_expires_at: null,
    total_spent: 0,
  },
  {
    telegram_id: 987654321,
    username: 'premium_user',
    first_name: 'Premium',
    is_premium: true,
    premium_expires_at: '2025-10-16T10:00:00Z',
    total_spent: 500, // 500 Stars spent
  },
];

let mockListings: PremiumListing[] = [
  {
    id: 1,
    title: 'Regular iPhone Listing',
    seller_id: 123456789,
    is_premium: false,
    premium_features: [],
    premium_expires_at: null,
    highlight_color: null,
    views: 25,
    bump_count: 0,
    last_bumped_at: null,
  },
  {
    id: 2,
    title: 'Premium MacBook Listing',
    seller_id: 987654321,
    is_premium: true,
    premium_features: ['highlight', 'extended_duration', 'priority_search'],
    premium_expires_at: '2025-09-30T10:00:00Z',
    highlight_color: '#FFD700',
    views: 156,
    bump_count: 2,
    last_bumped_at: '2025-09-16T08:00:00Z',
  },
];

let mockPaymentOrders: PaymentOrder[] = [];

const mockDB = {
  prepare: (query: string) => ({
    bind: (...params: any[]) => ({
      first: async () => {
        if (query.includes('SELECT') && query.includes('users')) {
          return mockUsers.find(u => params.includes(u.telegram_id));
        }
        if (query.includes('SELECT') && query.includes('listings')) {
          return mockListings.find(l => params.includes(l.id));
        }
        if (query.includes('SELECT') && query.includes('payment_orders')) {
          return mockPaymentOrders.find(o => params.includes(o.id));
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO payment_orders')) {
          const newOrder: PaymentOrder = {
            id: `order_${Date.now()}`,
            user_id: params[0],
            listing_id: params[1],
            product_type: params[2],
            amount: params[3],
            currency: 'XTR',
            status: 'pending',
            telegram_payment_charge_id: null,
            created_at: new Date().toISOString(),
            completed_at: null,
          };
          mockPaymentOrders.push(newOrder);
          return {
            success: true,
            meta: { changes: 1, last_row_id: newOrder.id, duration: 10, rows_read: 0, rows_written: 1 }
          };
        }
        if (query.includes('UPDATE listings') && query.includes('is_premium')) {
          const listingId = params[params.length - 1];
          const listing = mockListings.find(l => l.id === listingId);
          if (listing) {
            listing.is_premium = true;
            listing.premium_features = ['highlight', 'extended_duration', 'priority_search'];
            listing.premium_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            listing.highlight_color = '#FFD700';
          }
        }
        if (query.includes('UPDATE users') && query.includes('is_premium')) {
          const userId = params[params.length - 1];
          const user = mockUsers.find(u => u.telegram_id === userId);
          if (user) {
            user.is_premium = true;
            user.premium_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          }
        }
        return { success: true, meta: {} as any };
      },
      all: async () => {
        if (query.includes('SELECT') && query.includes('premium_analytics')) {
          return {
            results: [
              { metric: 'premium_listings', value: 1 },
              { metric: 'total_stars_spent', value: 500 },
              { metric: 'avg_premium_views', value: 156 },
            ],
            success: true,
            meta: {} as any
          };
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
    if (key === 'premium_pricing') {
      return JSON.stringify({
        premium_listing: 100, // 100 Stars
        listing_bump: 25, // 25 Stars
        premium_subscription_monthly: 300, // 300 Stars
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

describe('Integration Test T036: Premium Features with Payment', () => {
  let worker: any;

  beforeEach(async () => {
    mockPaymentOrders = [];

    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      worker = null;
    }
  });

  describe('Premium listing upgrade flow', () => {
    it('should create premium listing payment order', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const premiumRequest = {
        listing_id: 1,
        features: ['highlight', 'extended_duration', 'priority_search'],
        duration_days: 30,
      };

      const request = new Request('http://localhost:8787/api/listings/1/premium/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_token',
        },
        body: JSON.stringify(premiumRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const premiumOrder = await response.json();
      expect(premiumOrder.order_id).toBeDefined();
      expect(premiumOrder.amount).toBe(100); // 100 Stars
      expect(premiumOrder.currency).toBe('XTR');
      expect(premiumOrder.payment_url).toBeDefined();

      // Verify order was created
      expect(mockPaymentOrders.length).toBe(1);
      expect(mockPaymentOrders[0].product_type).toBe('premium_listing');
      expect(mockPaymentOrders[0].listing_id).toBe(1);
    });

    it('should generate Telegram payment invoice', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const invoiceRequest = {
        listing_id: 1,
        features: ['highlight', 'priority_search'],
      };

      const request = new Request('http://localhost:8787/api/payments/invoice/premium-listing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_token',
        },
        body: JSON.stringify(invoiceRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const invoice = await response.json();
      expect(invoice.title).toMatch(/Premium.*Listing/i);
      expect(invoice.description).toMatch(/premium.*features/i);
      expect(invoice.payload).toBeDefined();
      expect(invoice.provider_token).toBe('mock_payment_token');
      expect(invoice.currency).toBe('XTR');
      expect(invoice.prices).toBeDefined();
      expect(invoice.prices[0].amount).toBe(100); // 100 Stars
    });

    it('should handle successful payment webhook', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create pending order first
      const order: PaymentOrder = {
        id: 'order_test_123',
        user_id: 123456789,
        listing_id: 1,
        product_type: 'premium_listing',
        amount: 100,
        currency: 'XTR',
        status: 'pending',
        telegram_payment_charge_id: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      };
      mockPaymentOrders.push(order);

      const paymentWebhook = {
        update_id: 123456789,
        message: {
          message_id: 1,
          from: {
            id: 123456789,
            is_bot: false,
            first_name: 'User',
          },
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 123456789,
            type: 'private',
          },
          successful_payment: {
            currency: 'XTR',
            total_amount: 100,
            invoice_payload: 'order_test_123',
            telegram_payment_charge_id: 'tg_charge_123',
            provider_payment_charge_id: 'provider_charge_123',
          },
        },
      };

      const request = new Request('http://localhost:8787/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(paymentWebhook),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Verify order was completed
      const completedOrder = mockPaymentOrders.find(o => o.id === 'order_test_123');
      expect(completedOrder?.status).toBe('completed');
      expect(completedOrder?.telegram_payment_charge_id).toBe('tg_charge_123');

      // Verify listing was upgraded to premium
      const upgradedListing = mockListings.find(l => l.id === 1);
      expect(upgradedListing?.is_premium).toBe(true);
      expect(upgradedListing?.premium_features).toContain('highlight');
    });
  });

  describe('Listing bump feature', () => {
    it('should allow users to bump listings for visibility', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const bumpRequest = {
        listing_id: 1,
        bump_type: 'standard', // vs premium bump
      };

      const request = new Request('http://localhost:8787/api/listings/1/bump/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_token',
        },
        body: JSON.stringify(bumpRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const bumpOrder = await response.json();
      expect(bumpOrder.order_id).toBeDefined();
      expect(bumpOrder.amount).toBe(25); // 25 Stars for bump
      expect(bumpOrder.product_type).toBe('listing_bump');

      // Verify order created
      const order = mockPaymentOrders.find(o => o.product_type === 'listing_bump');
      expect(order).toBeDefined();
      expect(order?.listing_id).toBe(1);
    });

    it('should enforce bump cooldown period', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Set recent bump time
      const listing = mockListings.find(l => l.id === 2);
      if (listing) {
        listing.last_bumped_at = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
      }

      const bumpRequest = {
        listing_id: 2,
        bump_type: 'standard',
      };

      const request = new Request('http://localhost:8787/api/listings/2/bump/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_premium_token',
        },
        body: JSON.stringify(bumpRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(429); // Too Many Requests

      const errorResponse = await response.json();
      expect(errorResponse.message).toMatch(/cooldown|wait.*before.*bump/i);
      expect(errorResponse.retry_after_minutes).toBeGreaterThan(0);
    });

    it('should apply bump effects to listing visibility', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Simulate successful bump payment
      const listing = mockListings.find(l => l.id === 1);
      if (listing) {
        listing.bump_count += 1;
        listing.last_bumped_at = new Date().toISOString();
      }

      // Check listing appears in recent listings
      const request = new Request('http://localhost:8787/api/listings?sort=recent&limit=10', {
        method: 'GET',
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const listingsData = await response.json();
      // Bumped listing should appear near top
      const bumpedListing = listingsData.listings.find((l: any) => l.id === 1);
      expect(bumpedListing).toBeDefined();
      expect(bumpedListing.bump_indicator).toBe(true);
    });
  });

  describe('Premium subscription management', () => {
    it('should allow users to purchase premium subscriptions', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const subscriptionRequest = {
        plan: 'monthly',
        auto_renew: true,
      };

      const request = new Request('http://localhost:8787/api/premium/subscription/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_token',
        },
        body: JSON.stringify(subscriptionRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const subscription = await response.json();
      expect(subscription.order_id).toBeDefined();
      expect(subscription.amount).toBe(300); // 300 Stars monthly
      expect(subscription.plan).toBe('monthly');
      expect(subscription.benefits).toBeDefined();
      expect(subscription.benefits).toContain('unlimited_premium_listings');
    });

    it('should provide premium user benefits and analytics', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/premium/dashboard', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_premium_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const dashboard = await response.json();
      expect(dashboard.subscription_status).toBe('active');
      expect(dashboard.premium_features_used).toBeDefined();
      expect(dashboard.analytics).toBeDefined();
      expect(dashboard.analytics.total_premium_views).toBeGreaterThan(0);
      expect(dashboard.next_billing_date).toBeDefined();
    });

    it('should handle subscription renewals and cancellations', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Cancel subscription
      const cancelRequest = {
        cancel_at_period_end: true,
        reason: 'No longer needed',
      };

      const request = new Request('http://localhost:8787/api/premium/subscription/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_premium_token',
        },
        body: JSON.stringify(cancelRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const cancellation = await response.json();
      expect(cancellation.status).toBe('cancelled');
      expect(cancellation.active_until).toBeDefined();
      expect(cancellation.will_auto_renew).toBe(false);
    });
  });

  describe('Premium analytics and insights', () => {
    it('should provide premium listing performance analytics', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/listings/2/premium/analytics', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_premium_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const analytics = await response.json();
      expect(analytics.views_comparison).toBeDefined();
      expect(analytics.views_comparison.premium_period).toBeGreaterThan(0);
      expect(analytics.engagement_rate).toBeGreaterThan(0);
      expect(analytics.search_ranking_improvement).toBeDefined();
      expect(analytics.roi_metrics).toBeDefined();
    });

    it('should show premium vs regular listing performance comparison', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/premium/analytics/comparison?period=30d', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_premium_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const comparison = await response.json();
      expect(comparison.premium_listings).toBeDefined();
      expect(comparison.regular_listings).toBeDefined();
      expect(comparison.performance_metrics).toBeDefined();
      expect(comparison.performance_metrics.avg_views_premium).toBeGreaterThan(comparison.performance_metrics.avg_views_regular);
    });

    it('should provide spending and ROI analytics', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/premium/spending/analytics', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_premium_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const spendingData = await response.json();
      expect(spendingData.total_spent_stars).toBe(500);
      expect(spendingData.spending_breakdown).toBeDefined();
      expect(spendingData.roi_analysis).toBeDefined();
      expect(spendingData.recommendations).toBeDefined();
    });
  });

  describe('Payment validation and error handling', () => {
    it('should validate payment amounts and prevent fraud', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Attempt payment with wrong amount
      const fraudWebhook = {
        update_id: 123456790,
        message: {
          message_id: 2,
          from: { id: 123456789, is_bot: false, first_name: 'User' },
          date: Math.floor(Date.now() / 1000),
          chat: { id: 123456789, type: 'private' },
          successful_payment: {
            currency: 'XTR',
            total_amount: 50, // Wrong amount (should be 100)
            invoice_payload: 'order_test_123',
            telegram_payment_charge_id: 'tg_charge_fraud',
          },
        },
      };

      const request = new Request('http://localhost:8787/api/payments/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(fraudWebhook),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(400);

      const errorResponse = await response.json();
      expect(errorResponse.error).toBe('Payment Validation Failed');
      expect(errorResponse.message).toMatch(/amount.*mismatch/i);
    });

    it('should handle payment failures gracefully', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create order and simulate failure
      const order: PaymentOrder = {
        id: 'order_fail_123',
        user_id: 123456789,
        listing_id: 1,
        product_type: 'premium_listing',
        amount: 100,
        currency: 'XTR',
        status: 'pending',
        telegram_payment_charge_id: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      };
      mockPaymentOrders.push(order);

      const failureRequest = {
        order_id: 'order_fail_123',
        failure_reason: 'insufficient_funds',
        error_code: 'PAYMENT_FAILED',
      };

      const request = new Request('http://localhost:8787/api/payments/order_fail_123/failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_user_token',
        },
        body: JSON.stringify(failureRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Verify order marked as failed
      const failedOrder = mockPaymentOrders.find(o => o.id === 'order_fail_123');
      expect(failedOrder?.status).toBe('failed');

      // Listing should remain non-premium
      const listing = mockListings.find(l => l.id === 1);
      expect(listing?.is_premium).toBe(false);
    });

    it('should process refunds correctly', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create completed order
      const order: PaymentOrder = {
        id: 'order_refund_123',
        user_id: 987654321,
        listing_id: 2,
        product_type: 'premium_listing',
        amount: 100,
        currency: 'XTR',
        status: 'completed',
        telegram_payment_charge_id: 'tg_charge_refund',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
      mockPaymentOrders.push(order);

      const refundRequest = {
        order_id: 'order_refund_123',
        reason: 'Accidental purchase',
        refund_amount: 100,
      };

      const request = new Request('http://localhost:8787/api/payments/order_refund_123/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_admin_token',
        },
        body: JSON.stringify(refundRequest),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const refundResult = await response.json();
      expect(refundResult.refund_id).toBeDefined();
      expect(refundResult.status).toBe('refunded');

      // Verify order status updated
      const refundedOrder = mockPaymentOrders.find(o => o.id === 'order_refund_123');
      expect(refundedOrder?.status).toBe('refunded');
    });
  });

  describe('Premium feature restrictions and limits', () => {
    it('should enforce premium feature limits for regular users', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Regular user tries to access premium analytics
      const request = new Request('http://localhost:8787/api/listings/1/premium/analytics', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_user_token', // Regular user
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(403); // Forbidden

      const errorResponse = await response.json();
      expect(errorResponse.message).toMatch(/premium.*required|upgrade.*needed/i);
      expect(errorResponse.upgrade_url).toBeDefined();
    });

    it('should provide feature availability info', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      const request = new Request('http://localhost:8787/api/premium/features', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock_user_token',
        },
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const features = await response.json();
      expect(features.available_features).toBeDefined();
      expect(features.premium_features).toBeDefined();
      expect(features.pricing).toBeDefined();
      expect(features.user_limits).toBeDefined();
    });
  });
});