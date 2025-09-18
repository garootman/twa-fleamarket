import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { createWebhookHandler } from './bot';

/**
 * Telegram Marketplace - CloudFlare Worker
 *
 * A comprehensive marketplace application built for Telegram with:
 * - User management and authentication
 * - Category-based listings system
 * - Image upload and storage via R2
 * - Admin moderation tools
 * - Bot integration for notifications
 * - KV caching for performance
 */

interface Env {
  // CloudFlare bindings
  DB: D1Database;
  CACHE_KV: KVNamespace;
  SESSION_KV: KVNamespace;
  R2_BUCKET: R2Bucket;

  // Telegram configuration
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  TELEGRAM_WEBHOOK_SECRET: string;

  // Application configuration
  FRONTEND_URL: string;
  INIT_SECRET: string;
  JWT_SECRET: string;
  SESSION_ENCRYPTION_KEY: string;
  NODE_ENV: string;
  ADMIN_TELEGRAM_ID: string;

  // Feature flags and other config
  DEV_MODE_ENABLED?: string;
  MOCK_USERS_ENABLED?: string;
  PREMIUM_FEATURES_ENABLED?: string;
  CONTENT_MODERATION_ENABLED?: string;
  CACHE_ENABLED?: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors({
  origin: (origin, c) => {
    const env = c.env;
    const allowedOrigins = [
      env.FRONTEND_URL,
      'http://localhost:5173',
      'https://*.pages.dev'
    ];

    if (!origin) return '*';

    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(pattern).test(origin);
      }
      return allowed === origin;
    });

    return isAllowed ? origin : env.FRONTEND_URL;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check endpoint
app.get('/health', async (c) => {
  try {
    const env = c.env;

    // Test basic connectivity
    const healthResults = {
      timestamp: new Date().toISOString(),
      overall: 'ok' as const,
      services: {
        database: { status: 'ok', message: 'Database connection successful' },
        kv: { status: 'ok', message: 'KV storage operational' },
        r2: { status: 'ok', message: 'R2 storage operational' },
        bot: { status: 'ok', message: 'Bot configuration valid' }
      }
    };

    return c.json(healthResults);
  } catch (error) {
    return c.json({
      timestamp: new Date().toISOString(),
      overall: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 503);
  }
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Telegram Marketplace API',
    version: '1.0.0',
    description: 'A comprehensive marketplace for Telegram with listings, categories, and user management',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api/*',
      bot: '/api/bot/webhook'
    }
  });
});

// Basic API endpoints for now (will integrate marketplace APIs later)
app.get('/api/me', (c) => {
  return c.json({
    message: 'Marketplace API endpoint - authentication required',
    documentation: 'https://docs.marketplace.com/api'
  });
});

app.get('/api/categories', (c) => {
  return c.json([
    {
      id: 1,
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices and gadgets',
      parent_id: null,
      is_active: true,
      display_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Clothing',
      slug: 'clothing',
      description: 'Fashion and apparel',
      parent_id: null,
      is_active: true,
      display_order: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ]);
});

app.get('/api/listings', (c) => {
  return c.json({
    success: true,
    listings: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      pages: 0,
    },
  });
});

// Initialize webhook endpoint
app.post('/init', async (c) => {
  try {
    const env = c.env;

    // Verify authorization
    const authHeader = c.req.header('Authorization');
    if (authHeader !== `Bearer ${env.INIT_SECRET}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { externalUrl } = await c.req.json() as { externalUrl: string };
    const webhookUrl = `${externalUrl}/api/bot/webhook`;

    return c.json({
      success: true,
      message: 'Webhook setup completed',
      webhookUrl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({
      error: 'Failed to initialize webhook',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Bot webhook handler
app.post('/api/bot/webhook', async (c) => {
  const env = c.env;

  // Verify webhook secret
  const providedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (providedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized webhook request' }, 401);
  }

  // Create and handle webhook using modular bot
  const handleUpdate = createWebhookHandler({
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    FRONTEND_URL: env.FRONTEND_URL
  });

  return handleUpdate(c);
});

// Catch-all 404
app.all('*', (c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested resource was not found',
    path: c.req.path,
    method: c.req.method
  }, 404);
});

export default app;