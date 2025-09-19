import { Hono } from 'hono';
import { createDatabase } from '../db/index';
import { AuthService } from '../services/auth-service-simple';
import { AdminService } from '../services/admin-service';

interface Env {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  SESSION_KV: KVNamespace;
  R2_BUCKET: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
  JWT_SECRET: string;
  NODE_ENV: string;
  ADMIN_TELEGRAM_ID: string;
}

const adminRouter = new Hono<{ Bindings: Env }>();

// Helper function to authenticate admin requests
async function authenticateAdmin(c: any, env: Env) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const db = createDatabase(env.DB);
  const authService = new AuthService(db, env.TELEGRAM_BOT_TOKEN, env.NODE_ENV !== 'production');
  const adminService = new AdminService(db);

  const sessionResult = await authService.validateSession(token);
  if (!sessionResult.valid || !sessionResult.user) {
    return null;
  }

  const isAdmin = await adminService.isAdmin(sessionResult.user.id, env.ADMIN_TELEGRAM_ID);
  if (!isAdmin) {
    return null;
  }

  return sessionResult.user;
}

// GET /api/admin/dashboard - Admin dashboard statistics
adminRouter.get('/dashboard', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const stats = await adminService.getDashboardStats();

    return c.json({
      success: true,
      dashboard: stats
    });
  } catch (error) {
    console.error('Error getting admin dashboard:', error);
    return c.json({ error: 'Failed to get dashboard data' }, 500);
  }
});

// GET /api/admin/listings - Get all listings for admin
adminRouter.get('/listings', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const status = c.req.query('status') || undefined;
    const isFlagged = c.req.query('flagged') === 'true';
    const isSticky = c.req.query('sticky') === 'true';
    const userId = c.req.query('user_id') ? parseInt(c.req.query('user_id')!) : undefined;
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = parseInt(c.req.query('offset') || '0');

    const listings = await adminService.getListings({
      ...(status && { status }),
      ...(isFlagged !== undefined && { isFlagged }),
      ...(isSticky !== undefined && { isSticky }),
      ...(userId && { userId }),
      limit,
      offset
    });

    return c.json({
      success: true,
      listings,
      pagination: {
        limit,
        offset,
        total: listings.length,
        hasMore: listings.length === limit
      }
    });
  } catch (error) {
    console.error('Error getting admin listings:', error);
    return c.json({ error: 'Failed to get listings' }, 500);
  }
});

// POST /api/admin/listings/:id/stick - Stick/unstick listing
adminRouter.post('/listings/:id/stick', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const body = await c.req.json();
    const isSticky = body.sticky === true;

    const success = await adminService.toggleListingSticky(id, isSticky);

    if (!success) {
      return c.json({ error: 'Failed to update listing' }, 404);
    }

    return c.json({
      success: true,
      message: `Listing ${isSticky ? 'stickied' : 'unstickied'} successfully`
    });
  } catch (error) {
    console.error('Error toggling listing sticky:', error);
    return c.json({ error: 'Failed to update listing' }, 500);
  }
});

// GET /api/admin/users - Get users for admin
adminRouter.get('/users', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
    const offset = parseInt(c.req.query('offset') || '0');

    const users = await adminService.getUsers(limit, offset);

    return c.json({
      success: true,
      users,
      pagination: {
        limit,
        offset,
        total: users.length,
        hasMore: users.length === limit
      }
    });
  } catch (error) {
    console.error('Error getting admin users:', error);
    return c.json({ error: 'Failed to get users' }, 500);
  }
});

// POST /api/admin/users/:id/ban - Ban user
adminRouter.post('/users/:id/ban', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    const success = await adminService.toggleUserBan(id, true);

    if (!success) {
      return c.json({ error: 'Failed to ban user' }, 404);
    }

    return c.json({
      success: true,
      message: 'User banned successfully'
    });
  } catch (error) {
    console.error('Error banning user:', error);
    return c.json({ error: 'Failed to ban user' }, 500);
  }
});

// POST /api/admin/users/:id/unban - Unban user
adminRouter.post('/users/:id/unban', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid user ID' }, 400);
    }

    const success = await adminService.toggleUserBan(id, false);

    if (!success) {
      return c.json({ error: 'Failed to unban user' }, 404);
    }

    return c.json({
      success: true,
      message: 'User unbanned successfully'
    });
  } catch (error) {
    console.error('Error unbanning user:', error);
    return c.json({ error: 'Failed to unban user' }, 500);
  }
});

// GET /api/admin/blocked-words - Get blocked words
adminRouter.get('/blocked-words', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const words = await adminService.getBlockedWords();

    return c.json({
      success: true,
      words
    });
  } catch (error) {
    console.error('Error getting blocked words:', error);
    return c.json({ error: 'Failed to get blocked words' }, 500);
  }
});

// POST /api/admin/blocked-words - Add blocked word
adminRouter.post('/blocked-words', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const body = await c.req.json();
    const { word } = body;

    if (!word || typeof word !== 'string') {
      return c.json({ error: 'Valid word is required' }, 400);
    }

    const success = await adminService.addBlockedWord(word.toLowerCase().trim());

    if (!success) {
      return c.json({ error: 'Failed to add blocked word' }, 500);
    }

    return c.json({
      success: true,
      message: 'Blocked word added successfully'
    });
  } catch (error) {
    console.error('Error adding blocked word:', error);
    return c.json({ error: 'Failed to add blocked word' }, 500);
  }
});

// DELETE /api/admin/blocked-words/:word - Remove blocked word
adminRouter.delete('/blocked-words/:word', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateAdmin(c, env);

    if (!user) {
      return c.json({ error: 'Admin authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const adminService = new AdminService(db);

    const word = c.req.param('word');
    if (!word) {
      return c.json({ error: 'Word parameter is required' }, 400);
    }

    const success = await adminService.removeBlockedWord(word.toLowerCase().trim());

    if (!success) {
      return c.json({ error: 'Failed to remove blocked word' }, 500);
    }

    return c.json({
      success: true,
      message: 'Blocked word removed successfully'
    });
  } catch (error) {
    console.error('Error removing blocked word:', error);
    return c.json({ error: 'Failed to remove blocked word' }, 500);
  }
});

export { adminRouter };