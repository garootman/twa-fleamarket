import { Hono } from 'hono';
import { createDatabase } from '../db/index';
import { AuthService } from '../services/auth-service-simple';

interface Env {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  SESSION_KV: KVNamespace;
  R2_BUCKET: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
  JWT_SECRET: string;
  NODE_ENV: string;
  DEV_MODE_ENABLED?: string;
}

const miniAppRouter = new Hono<{ Bindings: Env }>();

// Initialize endpoint - authenticate and return user + token
miniAppRouter.post('/init', async (c) => {
  try {
    const env = c.env;
    const { initData } = await c.req.json();

    // Create database connection and services
    const db = createDatabase(env.DB);
    const authService = new AuthService(db, env.TELEGRAM_BOT_TOKEN, env.NODE_ENV !== 'production');

    // Parse Telegram WebApp initData
    const authParams = new URLSearchParams(initData);
    const userDataString = authParams.get('user');

    if (!userDataString) {
      return c.json({ error: 'Invalid initData: missing user information' }, 400);
    }

    let userData;
    try {
      userData = JSON.parse(userDataString);
    } catch {
      return c.json({ error: 'Invalid user data format' }, 400);
    }

    // Create auth data in the format expected by AuthService
    const authData = {
      id: userData.id,
      first_name: userData.first_name,
      last_name: userData.last_name,
      username: userData.username,
      photo_url: userData.photo_url,
      auth_date: Math.floor(Date.now() / 1000),
      hash: authParams.get('hash') || ''
    };

    // Authenticate
    const authResult = await authService.authenticateTelegram(authData);

    if (!authResult.success) {
      return c.json({ error: authResult.error }, 401);
    }

    if (!authResult.user || !authResult.sessionToken) {
      return c.json({ error: 'Authentication failed' }, 401);
    }

    // Return response in expected format
    return c.json({
      token: authResult.sessionToken,
      startParam: authParams.get('start_param'),
      startPage: 'home',
      user: {
        id: authResult.user.id,
        firstName: authResult.user.firstName || '',
        lastName: authResult.user.lastName,
        username: authResult.user.username,
        telegramId: parseInt(authResult.user.telegramId),
        imageUrl: userData.photo_url
      }
    });

  } catch (error) {
    console.error('Init error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get current user endpoint
miniAppRouter.get('/me', async (c) => {
  try {
    const env = c.env;
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.substring(7);

    // Create database connection and services
    const db = createDatabase(env.DB);
    const authService = new AuthService(db, env.TELEGRAM_BOT_TOKEN, env.NODE_ENV !== 'production');

    // Validate session
    const sessionResult = await authService.validateSession(token);

    if (!sessionResult.valid || !sessionResult.user) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    // Return user data
    return c.json({
      user: {
        id: sessionResult.user.id,
        firstName: sessionResult.user.firstName || '',
        lastName: sessionResult.user.lastName,
        username: sessionResult.user.username,
        telegramId: parseInt(sessionResult.user.telegramId),
        imageUrl: undefined // Could add this later
      }
    });

  } catch (error) {
    console.error('Me endpoint error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export { miniAppRouter };