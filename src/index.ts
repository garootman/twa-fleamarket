import { Hono } from 'hono';
import { Telegram } from './bot/telegram';
import { Database } from './db/index';
import { KVStorage } from './kv/index';
import { R2ImageStorage } from './r2/index';
import { processMessage } from './bot/messageProcessor';
// import { MessageSender } from './bot/messageSender';
import { generateSecret, sha256 } from './bot/cryptoUtils';
import { GrammyBotWrapper } from './bot/grammyBot';

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_USE_TEST_API?: string;
  FRONTEND_URL: string;
  DB: D1Database;
  KV: KVNamespace;
  IMAGES: R2Bucket;
  INIT_SECRET: string;
  BOT_NAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

interface AppContext {
  telegram: Telegram;
  db: Database;
  kv: KVStorage;
  images: R2Bucket;
  r2Storage: R2ImageStorage;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
  grammyBot: GrammyBotWrapper;
  env: Env;
}

type Variables = {
  app: AppContext;
};

// Create a new Hono app
const app = new Hono<{ Variables: Variables; Bindings: Env }>();

// CORS middleware - must be first
app.use('*', async (c, next): Promise<Response | void> => {
  try {
    // Handle multiple allowed origins for CORS
    const origin = c.req.header('Origin');
    const pagesUrl = c.req.header('CF-Pages-URL');
    const env = c.env;

    // Allow both the configured frontend URL and pages.dev domains
    const allowedOrigins = [
      env.FRONTEND_URL,
      pagesUrl,
      // Allow any pages.dev subdomain
      ...(origin?.endsWith('.pages.dev') ? [origin] : []),
      // Allow localhost for development
      ...(origin?.includes('localhost') || origin?.includes('127.0.0.1') ? [origin] : []),
    ].filter(Boolean);

    const accessControlAllowOrigin = allowedOrigins.includes(origin || '')
      ? origin || '*'
      : pagesUrl || env.FRONTEND_URL || '*';

    // Set CORS headers
    c.header('Access-Control-Allow-Origin', accessControlAllowOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Max-Age', '86400');
    c.header('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      return c.text('', 200);
    }

    await next();
  } catch (error) {
    console.error('CORS middleware error:', error);
    return c.text('CORS middleware error', 500);
  }
});

// Middleware to set up app context
app.use('*', async (c, next): Promise<Response | void> => {
  const env = c.env;
  try {
    // Check for required environment variables
    if (!env.TELEGRAM_BOT_TOKEN) {
      console.error('Missing TELEGRAM_BOT_TOKEN');
      return c.text('Missing bot token configuration', 500);
    }
    let telegram = new Telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_USE_TEST_API);
    let db = new Database(env.DB);
    let kv = new KVStorage(env.KV);

    // Get CORS headers from the first middleware
    const origin = c.req.header('Origin');
    const pagesUrl = c.req.header('CF-Pages-URL');
    const allowedOrigins = [
      env.FRONTEND_URL,
      pagesUrl,
      ...(origin?.endsWith('.pages.dev') ? [origin] : []),
      ...(origin?.includes('localhost') || origin?.includes('127.0.0.1') ? [origin] : []),
    ].filter(Boolean);
    const accessControlAllowOrigin = allowedOrigins.includes(origin || '')
      ? origin || '*'
      : pagesUrl || env.FRONTEND_URL || '*';

    let corsHeaders = {
      'Access-Control-Allow-Origin': accessControlAllowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true',
    };
    let isLocalhost = c.req.header('Host')?.match(/^(localhost|127\.0\.0\.1)/) !== null;

    let botName: string | null = null;
    try {
      // Bot name is now stored in environment variables
      botName = env.BOT_NAME || null;
      if (!botName && env.TELEGRAM_BOT_TOKEN) {
        let me = await telegram.getMe();
        if (me.ok && me.result?.username) {
          const username = me.result.username;
          botName = username;
          // Bot name would be stored in environment variables now
          console.log('Bot username detected:', username);
        }
      }
    } catch (error) {
      console.error('Error fetching bot name:', error);
      // Continue without bot name for now
    }

    let grammyBot = new GrammyBotWrapper(
      env.TELEGRAM_BOT_TOKEN,
      {
        telegram,
        db,
        corsHeaders,
        isLocalhost,
        botName,
        env,
      },
      env.TELEGRAM_USE_TEST_API
    );

    let r2Storage = new R2ImageStorage(env.IMAGES);
    let appContext: AppContext = {
      telegram,
      db,
      kv,
      images: env.IMAGES,
      r2Storage,
      corsHeaders,
      isLocalhost,
      botName,
      grammyBot,
      env,
    };

    c.set('app', appContext);
    await next();
  } catch (error: any) {
    console.error('App context middleware error:', error);
    return c.text(`Worker error: ${error.message}`, 500);
  }
});

app.get('/', c => {
  return c.text('This telegram bot is deployed correctly. No user-serviceable parts inside.', 200);
});

app.get('/health', async c => {
  const appContext = c.get('app');
  const { db, kv, r2Storage } = appContext;

  try {
    // Run all health checks in parallel
    const [dbHealth, kvHealth, r2Health] = await Promise.allSettled([
      db.healthCheck(),
      kv.healthCheck(),
      r2Storage.healthCheck(),
    ]);

    const healthResults = {
      timestamp: new Date().toISOString(),
      overall: 'ok' as 'ok' | 'degraded' | 'error',
      services: {
        database:
          dbHealth.status === 'fulfilled'
            ? dbHealth.value
            : {
                status: 'error',
                message: `Health check failed: ${dbHealth.reason}`,
                timestamp: new Date().toISOString(),
              },
        kv:
          kvHealth.status === 'fulfilled'
            ? kvHealth.value
            : {
                status: 'error',
                message: `Health check failed: ${kvHealth.reason}`,
                timestamp: new Date().toISOString(),
              },
        r2:
          r2Health.status === 'fulfilled'
            ? r2Health.value
            : {
                status: 'error',
                message: `Health check failed: ${r2Health.reason}`,
                timestamp: new Date().toISOString(),
              },
      },
    };

    // Determine overall status
    const services = [
      healthResults.services.database,
      healthResults.services.kv,
      healthResults.services.r2,
    ];
    const errorCount = services.filter(s => s.status === 'error').length;

    if (errorCount === 0) {
      healthResults.overall = 'ok';
    } else if (errorCount === services.length) {
      healthResults.overall = 'error';
    } else {
      healthResults.overall = 'degraded';
    }

    const httpStatus = healthResults.overall === 'error' ? 503 : 200;

    return c.json(healthResults, httpStatus, {
      ...appContext.corsHeaders,
    });
  } catch (error) {
    return c.json(
      {
        timestamp: new Date().toISOString(),
        overall: 'error',
        message: `Health check endpoint error: ${error instanceof Error ? error.message : String(error)}`,
      },
      500,
      {
        ...appContext.corsHeaders,
      }
    );
  }
});

app.post('/miniApp/init', async c => {
  try {
    const appContext = c.get('app');
    if (!appContext) {
      console.error('No app context available');
      return c.text('App context not available', 500);
    }

    const { telegram, db, kv } = appContext;
    let json = (await c.req.json()) as { initData: string };
    let initData = json.initData;

    let { expectedHash, calculatedHash, data } = await telegram.calculateHashes(initData);

    if (expectedHash !== calculatedHash) {
      return c.text('Unauthorized', 401, { ...appContext.corsHeaders });
    }

    const currentTime = Math.floor(Date.now() / 1000);
    let stalenessSeconds = currentTime - data.auth_date;
    if (stalenessSeconds > 600) {
      return c.text('Stale data, please restart the app', 400, {
        ...appContext.corsHeaders,
      });
    }

    // Hashes match, the data is fresh enough, we can be fairly sure that the user is who they say they are
    // Let's save the user to the database and return a token

    if (!data.user) {
      return c.text('Invalid user data', 400, { ...appContext.corsHeaders });
    }

    // Save user with Telegram photo URL directly (no R2 upload needed)
    const user = await db.saveUser(data.user, data.auth_date, null);
    let token = generateSecret(16);
    const tokenHash = await sha256(token);

    // Store token in KV instead of DB
    await kv.saveToken(tokenHash, user, 86400); // 24 hours TTL

    // Add the correct image URL
    const baseUrl = `${c.req.url.split('/miniApp/init')[0]}`;
    const userWithImageUrl = {
      ...user,
      imageUrl: db.getUserImageUrl(user, baseUrl),
    };

    return c.json(
      {
        token: token,
        startParam: data.start_param,
        startPage: 'fleamarket',
        user: userWithImageUrl,
      },
      200,
      { ...appContext.corsHeaders }
    );
  } catch (error: any) {
    console.error('/miniApp/init error:', error);
    return c.text(`Init error: ${error.message}`, 500);
  }
});

app.get('/miniApp/me', async c => {
  const appContext = c.get('app');
  const { kv, db } = appContext;

  let suppliedToken = c.req.header('Authorization')?.replace('Bearer ', '') || '';
  const tokenHash = await sha256(suppliedToken);
  let user = await kv.getUserByTokenHash(tokenHash);

  if (user === null) {
    return c.text('Unauthorized', 401);
  }

  // Add the correct image URL
  const baseUrl = `${c.req.url.split('/miniApp/me')[0]}`;
  const userWithImageUrl = {
    ...user,
    imageUrl: db.getUserImageUrl(user, baseUrl),
  };

  return c.json({ user: userWithImageUrl }, 200, {
    ...appContext.corsHeaders,
  });
});

app.get('/image/:key{.+}', async c => {
  const appContext = c.get('app');
  const { r2Storage } = appContext;
  const imageKey = c.req.param('key');

  if (!imageKey) {
    return c.text('Image key required', 400);
  }

  const imageObject = await r2Storage.getImageMetadata(imageKey);
  if (!imageObject) {
    return c.text('Image not found', 404);
  }

  return new Response(imageObject.body, {
    headers: {
      'Content-Type': imageObject.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
      'ETag': imageObject.etag,
    },
  });
});

// Calendar routes removed - functionality not needed

app.post('/telegramMessage', async c => {
  const appContext = c.get('app');
  const { grammyBot } = appContext;
  const telegramProvidedToken = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  // Security tokens are now handled via environment variables
  const savedToken = appContext.env.TELEGRAM_WEBHOOK_SECRET;

  if (telegramProvidedToken !== savedToken) {
    return c.text('Unauthorized', 401);
  }

  return await grammyBot.handleWebhook(c.req.raw);
});

app.get('/updateTelegramMessages', async c => {
  const appContext = c.get('app');
  if (!appContext.isLocalhost) {
    return c.text('This request is only supposed to be used locally', 403);
  }

  const { telegram } = appContext;
  // Message tracking has been removed - use console logging instead
  let lastUpdateId = 0;
  let updates = await telegram.getUpdates(lastUpdateId);
  let results = [];
  for (const update of updates.result) {
    let result = await processMessage(update, appContext);
    results.push(result);
  }

  return c.text(
    `Success!
	Last update id: 
	${lastUpdateId}\n\n
	Updates: 
	${JSON.stringify(updates, null, 2)}\n\n
	Results:
	${JSON.stringify(results, null, 2)}`,
    200
  );
});

app.post('/init', async c => {
  const appContext = c.get('app');
  const env = c.env;
  if (c.req.header('Authorization') !== `Bearer ${env.INIT_SECRET}`) {
    return c.text('Unauthorized', 401);
  }

  try {
    const { botName, grammyBot } = appContext;

    let token = appContext.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token) {
      return c.json(
        {
          error: 'TELEGRAM_WEBHOOK_SECRET environment variable not set',
        },
        500,
        { ...appContext.corsHeaders }
      );
    }

    let json = (await c.req.json()) as { externalUrl: string };
    let externalUrl = json.externalUrl;

    let response = await grammyBot.setWebhook(`${externalUrl}/telegramMessage`, token);

    // Check if the webhook setting was successful
    if (!response.ok) {
      console.error('Telegram setWebhook failed:', response);
      return c.text(`Webhook setup failed: ${JSON.stringify(response)}`, 500);
    }

    return c.text(
      `Success! Bot Name: https://t.me/${botName}. Webhook status:  ${JSON.stringify(response)}`,
      200
    );
  } catch (error: any) {
    console.error('Init endpoint error:', error);
    return c.text(`Error during initialization: ${error.message}`, 500);
  }
});

app.all('*', c => c.text('404, not found!', 404));

export default app;
