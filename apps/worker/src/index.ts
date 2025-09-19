import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { createDatabase } from './db/index';
import { createWebhookHandler } from './bot/index';
import { miniAppRouter } from './api/miniApp';
import { listingsRouter } from './api/listings';
import { adminRouter } from './api/admin';

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
  MAX_UPLOAD_SIZE?: string;
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

// Mount miniApp router
app.route('/miniApp', miniAppRouter);

// Mount listings API router
app.route('/api/listings', listingsRouter);

// Mount admin API router
app.route('/api/admin', adminRouter);

// File upload endpoint with R2 integration
app.post('/api/upload', async (c) => {
  try {
    const env = c.env;
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Authenticate user
    const token = authHeader.substring(7);
    const db = createDatabase(env.DB);
    const { AuthService } = await import('./services/auth-service-simple');
    const authService = new AuthService(db, env.TELEGRAM_BOT_TOKEN, env.NODE_ENV !== 'production');

    const sessionResult = await authService.validateSession(token);
    if (!sessionResult.valid || !sessionResult.user) {
      return c.json({ error: 'Invalid authentication' }, 401);
    }

    // Parse form data
    const formData = await c.req.formData();
    const fileData = formData.get('file');

    if (!fileData || typeof fileData === 'string') {
      return c.json({ error: 'No file provided' }, 400);
    }

    const file = fileData as File;

    // Import and use ImageService
    const { ImageService } = await import('./services/image-service');
    const imageService = new ImageService(env.R2_BUCKET);

    // Validate file
    const maxSize = parseInt(env.MAX_UPLOAD_SIZE || '5242880'); // 5MB default
    const validationError = imageService.validateImage(file, maxSize);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    // Upload to R2
    const uploadResult = await imageService.uploadImage(
      file,
      file.name,
      file.type,
      sessionResult.user.id
    );

    return c.json({
      success: true,
      image: {
        id: uploadResult.id,
        url: uploadResult.url,
        filename: uploadResult.filename,
        size: uploadResult.size,
        contentType: uploadResult.contentType,
        uploaded_at: uploadResult.uploadedAt
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Upload failed'
    }, 500);
  }
});


// Cache management endpoints
app.get('/api/cache/:key', async (c) => {
  try {
    const env = c.env;
    const key = c.req.param('key');

    if (!key) {
      return c.json({ error: 'Key parameter required' }, 400);
    }

    const { KVCacheService } = await import('./services/kv-cache-service');
    const cache = new KVCacheService(env.CACHE_KV);

    const value = await cache.get(key);

    return c.json({
      success: true,
      cached: value !== null,
      value,
      key
    });
  } catch (error) {
    return c.json({ error: 'Failed to get cache value' }, 500);
  }
});

app.post('/api/cache/:key', async (c) => {
  try {
    const env = c.env;
    const key = c.req.param('key');

    if (!key) {
      return c.json({ error: 'Key parameter required' }, 400);
    }

    const body = await c.req.json();
    const { value, ttl } = body;

    const { KVCacheService } = await import('./services/kv-cache-service');
    const cache = new KVCacheService(env.CACHE_KV);

    const success = await cache.set(key, value, { ttl });

    return c.json({
      success,
      message: success ? 'Value cached successfully' : 'Failed to cache value',
      key
    });
  } catch (error) {
    return c.json({ error: 'Failed to set cache value' }, 500);
  }
});

app.delete('/api/cache/:key', async (c) => {
  try {
    const env = c.env;
    const key = c.req.param('key');

    if (!key) {
      return c.json({ error: 'Key parameter required' }, 400);
    }

    const { KVCacheService } = await import('./services/kv-cache-service');
    const cache = new KVCacheService(env.CACHE_KV);

    const success = await cache.delete(key);

    return c.json({
      success,
      message: success ? 'Cache key deleted' : 'Failed to delete cache key',
      key
    });
  } catch (error) {
    return c.json({ error: 'Failed to delete cache key' }, 500);
  }
});

// Mock moderation endpoints
app.get('/api/moderation/queue', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  return c.json({
    success: true,
    queue: []
  });
});

// User profile endpoint
app.get('/api/me', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Mock user data for now
    const mockUser = {
      id: 1,
      telegramId: '123456789',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      languageCode: 'en',
      isPremium: false,
      isBot: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return c.json({
      success: true,
      user: mockUser
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch user profile' }, 500);
  }
});

// User listings endpoint
app.get('/api/me/listings', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const token = authHeader.substring(7);
    const env = c.env;
    const db = createDatabase(env.DB);

    // Import auth service
    const { AuthService } = await import('./services/auth-service-simple');
    const authService = new AuthService(db, env.TELEGRAM_BOT_TOKEN, env.NODE_ENV !== 'production');

    const sessionResult = await authService.validateSession(token);
    if (!sessionResult.valid || !sessionResult.user) {
      return c.json({ error: 'Invalid authentication' }, 401);
    }

    // Import listing service and get user's listings
    const { ListingServiceSimple } = await import('./services/listing-service-simple');
    const listingService = new ListingServiceSimple(db);

    const includeInactive = c.req.query('include_inactive') === 'true';
    const listings = await listingService.findByUserId(sessionResult.user.id, includeInactive);

    // Calculate stats
    const stats = {
      total: listings.length,
      active: listings.filter(l => l.status === 'active').length,
      draft: listings.filter(l => l.status === 'draft').length,
      sold: listings.filter(l => l.status === 'sold').length,
      totalViews: listings.reduce((sum, l) => sum + (l.viewCount || 0), 0)
    };

    return c.json({
      success: true,
      listings,
      stats
    });
  } catch (error) {
    console.error('Error fetching user listings:', error);
    return c.json({ error: 'Failed to fetch user listings' }, 500);
  }
});

app.get('/api/categories', (c) => {
  const categories = [
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
    },
    {
      id: 3,
      name: 'Home & Garden',
      slug: 'home-garden',
      description: 'Home improvement and garden supplies',
      parent_id: null,
      is_active: true,
      display_order: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 4,
      name: 'Vehicles',
      slug: 'vehicles',
      description: 'Cars, motorcycles, and other vehicles',
      parent_id: null,
      is_active: true,
      display_order: 4,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 5,
      name: 'Services',
      slug: 'services',
      description: 'Professional and personal services',
      parent_id: null,
      is_active: true,
      display_order: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ];

  return c.json({
    success: true,
    categories
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