import { Hono } from 'hono';
import { createDatabase } from '../db/index';
import { AuthService } from '../services/auth-service-simple';
import { ListingServiceSimple } from '../services/listing-service-simple';
import { KVCacheService } from '../services/kv-cache-service';

interface Env {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  SESSION_KV: KVNamespace;
  R2_BUCKET: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
  JWT_SECRET: string;
  NODE_ENV: string;
}

const listingsRouter = new Hono<{ Bindings: Env }>();

// Helper function to authenticate requests
async function authenticateRequest(c: any, env: Env) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const db = createDatabase(env.DB);
  const authService = new AuthService(db, env.TELEGRAM_BOT_TOKEN, env.NODE_ENV !== 'production');

  const sessionResult = await authService.validateSession(token);
  return sessionResult.valid ? sessionResult.user : null;
}

// GET /api/listings - Search/list listings
listingsRouter.get('/', async (c) => {
  try {
    const env = c.env;
    const db = createDatabase(env.DB);
    const cache = new KVCacheService(env.CACHE_KV);
    const listingService = new ListingServiceSimple(db, cache);

    // Parse query parameters
    const query = c.req.query('q') || '';
    const categoryId = c.req.query('category') ? parseInt(c.req.query('category')!) : undefined;
    const priceMin = c.req.query('price_min') ? parseFloat(c.req.query('price_min')!) : undefined;
    const priceMax = c.req.query('price_max') ? parseFloat(c.req.query('price_max')!) : undefined;
    const location = c.req.query('location') || undefined;
    const sortBy = c.req.query('sort') as 'price' | 'date' | 'popularity' || 'date';
    const sortOrder = c.req.query('order') as 'asc' | 'desc' || 'desc';
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
    const offset = parseInt(c.req.query('offset') || '0');

    const filters: any = {
      query,
      categoryId,
      priceMin,
      priceMax,
      location,
      status: 'active', // Only show active listings
      sortBy,
      sortOrder,
      limit,
      offset
    };

    // Remove undefined values
    Object.keys(filters).forEach((key: string) =>
      filters[key] === undefined && delete filters[key]
    );

    const listings = await listingService.search(filters);

    return c.json({
      success: true,
      listings,
      pagination: {
        limit,
        offset,
        total: listings.length, // Would need count query for real total
        hasMore: listings.length === limit
      }
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    return c.json({ error: 'Failed to fetch listings' }, 500);
  }
});

// POST /api/listings - Create new listing
listingsRouter.post('/', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateRequest(c, env);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const listingService = new ListingServiceSimple(db);

    const body = await c.req.json();

    // Validate required fields
    if (!body.title || !body.description || !body.price || !body.categoryId) {
      return c.json({
        error: 'Missing required fields: title, description, price, categoryId'
      }, 400);
    }

    const listingData = {
      title: body.title,
      description: body.description,
      price: parseFloat(body.price),
      currency: body.currency || 'USD',
      categoryId: parseInt(body.categoryId),
      location: body.location,
      contactMethod: body.contactMethod || 'telegram',
      contactValue: body.contactValue,
      images: body.images || []
    };

    const listing = await listingService.create(user.id, listingData);

    if (!listing) {
      return c.json({ error: 'Failed to create listing' }, 500);
    }

    return c.json({
      success: true,
      listing
    }, 201);
  } catch (error) {
    console.error('Error creating listing:', error);
    return c.json({ error: 'Failed to create listing' }, 500);
  }
});

// GET /api/listings/:id - Get specific listing
listingsRouter.get('/:id', async (c) => {
  try {
    const env = c.env;
    const db = createDatabase(env.DB);
    const cache = new KVCacheService(env.CACHE_KV);
    const listingService = new ListingServiceSimple(db, cache);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const listing = await listingService.findById(id);

    if (!listing) {
      return c.json({ error: 'Listing not found' }, 404);
    }

    // Increment view count
    await listingService.incrementViews(id);

    return c.json({
      success: true,
      listing
    });
  } catch (error) {
    console.error('Error fetching listing:', error);
    return c.json({ error: 'Failed to fetch listing' }, 500);
  }
});

// PUT /api/listings/:id - Update listing
listingsRouter.put('/:id', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateRequest(c, env);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const listingService = new ListingServiceSimple(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const body = await c.req.json();

    const updateData: any = {
      title: body.title,
      description: body.description,
      price: body.price ? parseFloat(body.price) : undefined,
      currency: body.currency,
      categoryId: body.categoryId ? parseInt(body.categoryId) : undefined,
      location: body.location,
      contactMethod: body.contactMethod,
      contactValue: body.contactValue,
      images: body.images,
      status: body.status
    };

    // Remove undefined values
    Object.keys(updateData).forEach((key: string) =>
      updateData[key] === undefined && delete updateData[key]
    );

    const listing = await listingService.update(id, user.id, updateData);

    if (!listing) {
      return c.json({ error: 'Listing not found or access denied' }, 404);
    }

    return c.json({
      success: true,
      listing
    });
  } catch (error) {
    console.error('Error updating listing:', error);
    return c.json({ error: 'Failed to update listing' }, 500);
  }
});

// DELETE /api/listings/:id - Archive/delete listing
listingsRouter.delete('/:id', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateRequest(c, env);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const listingService = new ListingServiceSimple(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const success = await listingService.archive(id, user.id);

    if (!success) {
      return c.json({ error: 'Listing not found or access denied' }, 404);
    }

    return c.json({
      success: true,
      message: 'Listing archived successfully'
    });
  } catch (error) {
    console.error('Error archiving listing:', error);
    return c.json({ error: 'Failed to archive listing' }, 500);
  }
});

// POST /api/listings/:id/bump - Bump listing to top
listingsRouter.post('/:id/bump', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateRequest(c, env);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const listingService = new ListingServiceSimple(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const success = await listingService.bump(id, user.id);

    if (!success) {
      return c.json({ error: 'Listing not found or access denied' }, 404);
    }

    return c.json({
      success: true,
      message: 'Listing bumped successfully'
    });
  } catch (error) {
    console.error('Error bumping listing:', error);
    return c.json({ error: 'Failed to bump listing' }, 500);
  }
});

// POST /api/listings/:id/flag - Flag listing for moderation
listingsRouter.post('/:id/flag', async (c) => {
  try {
    const env = c.env;
    const db = createDatabase(env.DB);
    const listingService = new ListingServiceSimple(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const body = await c.req.json();
    const reason = body.reason || 'No reason provided';

    const success = await listingService.flag(id, reason);

    if (!success) {
      return c.json({ error: 'Listing not found' }, 404);
    }

    return c.json({
      success: true,
      message: 'Listing flagged for moderation'
    });
  } catch (error) {
    console.error('Error flagging listing:', error);
    return c.json({ error: 'Failed to flag listing' }, 500);
  }
});

// POST /api/listings/:id/publish - Publish a draft listing
listingsRouter.post('/:id/publish', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateRequest(c, env);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const listingService = new ListingServiceSimple(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const listing = await listingService.publish(id, user.id);

    if (!listing) {
      return c.json({ error: 'Listing not found or access denied' }, 404);
    }

    return c.json({
      success: true,
      listing,
      message: 'Listing published successfully'
    });
  } catch (error) {
    console.error('Error publishing listing:', error);
    return c.json({ error: 'Failed to publish listing' }, 500);
  }
});

// POST /api/listings/:id/preview - Preview a draft listing
listingsRouter.post('/:id/preview', async (c) => {
  try {
    const env = c.env;
    const user = await authenticateRequest(c, env);

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const db = createDatabase(env.DB);
    const listingService = new ListingServiceSimple(db);

    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid listing ID' }, 400);
    }

    const listing = await listingService.findById(id);

    if (!listing || listing.userId !== user.id) {
      return c.json({ error: 'Listing not found or access denied' }, 404);
    }

    // Return listing with preview flag
    return c.json({
      success: true,
      listing: {
        ...listing,
        isPreview: true
      },
      message: 'Listing preview generated'
    });
  } catch (error) {
    console.error('Error generating listing preview:', error);
    return c.json({ error: 'Failed to generate preview' }, 500);
  }
});

export { listingsRouter };