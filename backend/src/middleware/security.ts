import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';

/**
 * Security Middleware - T100
 *
 * Provides CORS configuration and security headers for production deployment.
 * Includes CSP, rate limiting, and CloudFlare integration.
 */

export interface SecurityOptions {
  cors: {
    origin: string | string[] | boolean;
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    maxAge?: number;
    credentials?: boolean;
  };
  csp: {
    enabled: boolean;
    directives?: Record<string, string[]>;
    reportUri?: string;
    reportOnly?: boolean;
  };
  headers: {
    hsts?: boolean;
    nosniff?: boolean;
    xssProtection?: boolean;
    frameOptions?: 'DENY' | 'SAMEORIGIN' | string;
    referrerPolicy?: string;
  };
  rateLimit: {
    enabled: boolean;
    windowMs?: number;
    maxRequests?: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
  };
  trustedProxies?: string[];
  environment: 'development' | 'staging' | 'production';
}

/**
 * Default security configuration
 */
const DEFAULT_SECURITY_OPTIONS: SecurityOptions = {
  cors: {
    origin: false, // Restrict by default
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key', 'CF-Ray'],
    exposeHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    maxAge: 86400, // 24 hours
    credentials: true,
  },
  csp: {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", 'https://telegram.org'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'", 'https://api.telegram.org'],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
    },
    reportOnly: false,
  },
  headers: {
    hsts: true,
    nosniff: true,
    xssProtection: true,
    frameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
  },
  rateLimit: {
    enabled: true,
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  trustedProxies: ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22'],
  environment: 'production',
};

/**
 * Create comprehensive security middleware
 */
export function createSecurityMiddleware(options: Partial<SecurityOptions> = {}) {
  const config = mergeSecurityOptions(DEFAULT_SECURITY_OPTIONS, options);

  return async (c: Context, next: Next) => {
    // Set security headers
    setSecurityHeaders(c, config);

    // Apply CORS
    const corsMiddleware = createCORSMiddleware(config.cors);
    await corsMiddleware(c, async () => {
      // Apply rate limiting
      if (config.rateLimit.enabled) {
        const rateLimitResult = await applyRateLimit(c, config.rateLimit);
        if (!rateLimitResult.allowed) {
          return c.json(
            {
              error: 'Rate limit exceeded',
              retryAfter: rateLimitResult.retryAfter,
            },
            429
          );
        }
      }

      // Validate request security
      const securityCheck = validateRequestSecurity(c, config);
      if (!securityCheck.valid) {
        return c.json(
          {
            error: 'Security validation failed',
            details: securityCheck.errors,
          },
          400
        );
      }

      return next();
    });
  };
}

/**
 * Create CORS middleware with CloudFlare support
 */
function createCORSMiddleware(corsOptions: SecurityOptions['cors']) {
  return cors({
    origin: (origin, c) => {
      // In development, allow any origin
      if (process.env.NODE_ENV === 'development') {
        return origin || '*';
      }

      // Check against allowed origins
      if (typeof corsOptions.origin === 'boolean') {
        return corsOptions.origin ? origin || '*' : false;
      }

      if (typeof corsOptions.origin === 'string') {
        return corsOptions.origin;
      }

      if (Array.isArray(corsOptions.origin)) {
        return corsOptions.origin.includes(origin || '') ? origin : false;
      }

      return false;
    },
    allowMethods: corsOptions.allowMethods,
    allowHeaders: corsOptions.allowHeaders,
    exposeHeaders: corsOptions.exposeHeaders,
    maxAge: corsOptions.maxAge,
    credentials: corsOptions.credentials,
  });
}

/**
 * Set security headers
 */
function setSecurityHeaders(c: Context, config: SecurityOptions): void {
  // HTTP Strict Transport Security
  if (config.headers.hsts && config.environment === 'production') {
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Type Options
  if (config.headers.nosniff) {
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
  }

  // XSS Protection
  if (config.headers.xssProtection) {
    c.res.headers.set('X-XSS-Protection', '1; mode=block');
  }

  // Frame Options
  if (config.headers.frameOptions) {
    c.res.headers.set('X-Frame-Options', config.headers.frameOptions);
  }

  // Referrer Policy
  if (config.headers.referrerPolicy) {
    c.res.headers.set('Referrer-Policy', config.headers.referrerPolicy);
  }

  // Content Security Policy
  if (config.csp.enabled) {
    const cspHeader = buildCSPHeader(config.csp);
    const headerName = config.csp.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
    c.res.headers.set(headerName, cspHeader);
  }

  // Additional security headers
  c.res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  c.res.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Server identification
  c.res.headers.set('Server', 'CloudFlare');
  c.res.headers.delete('X-Powered-By');
}

/**
 * Build Content Security Policy header
 */
function buildCSPHeader(cspConfig: SecurityOptions['csp']): string {
  const directives: string[] = [];

  if (cspConfig.directives) {
    for (const [directive, values] of Object.entries(cspConfig.directives)) {
      directives.push(`${directive} ${values.join(' ')}`);
    }
  }

  if (cspConfig.reportUri) {
    directives.push(`report-uri ${cspConfig.reportUri}`);
  }

  return directives.join('; ');
}

/**
 * Apply rate limiting with CloudFlare integration
 */
async function applyRateLimit(
  c: Context,
  rateLimitConfig: SecurityOptions['rateLimit']
): Promise<{ allowed: boolean; retryAfter?: number }> {
  // Use CloudFlare's rate limiting if available
  const cfRateLimit = c.req.header('CF-RateLimit-Remaining');
  if (cfRateLimit && parseInt(cfRateLimit) <= 0) {
    const retryAfter = parseInt(c.req.header('CF-RateLimit-Reset') || '60');
    return { allowed: false, retryAfter };
  }

  // Implement custom rate limiting
  const clientId = getClientIdentifier(c);
  const key = `rateLimit:${clientId}`;

  // This would typically use KV storage or memory cache
  // For now, we'll use a simple in-memory approach
  const requestCount = await getRateLimitCount(key);
  const windowMs = rateLimitConfig.windowMs || 15 * 60 * 1000;
  const maxRequests = rateLimitConfig.maxRequests || 100;

  if (requestCount >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil(windowMs / 1000),
    };
  }

  await incrementRateLimitCount(key, windowMs);
  return { allowed: true };
}

/**
 * Validate request security
 */
function validateRequestSecurity(
  c: Context,
  config: SecurityOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate Content-Type for POST/PUT requests
  const method = c.req.method;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = c.req.header('Content-Type');
    if (!contentType) {
      errors.push('Content-Type header is required');
    } else if (!isAllowedContentType(contentType)) {
      errors.push(`Content-Type ${contentType} is not allowed`);
    }
  }

  // Validate request size
  const contentLength = c.req.header('Content-Length');
  if (contentLength) {
    const size = parseInt(contentLength);
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (size > maxSize) {
      errors.push(`Request size ${size} exceeds maximum ${maxSize}`);
    }
  }

  // Validate User-Agent
  const userAgent = c.req.header('User-Agent');
  if (!userAgent && config.environment === 'production') {
    errors.push('User-Agent header is required');
  }

  // Check for suspicious headers
  const suspiciousHeaders = detectSuspiciousHeaders(c);
  if (suspiciousHeaders.length > 0) {
    errors.push(`Suspicious headers detected: ${suspiciousHeaders.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get client identifier for rate limiting
 */
function getClientIdentifier(c: Context): string {
  // Prefer CloudFlare connecting IP
  const cfIP = c.req.header('CF-Connecting-IP');
  if (cfIP) return cfIP;

  // Fallback to forwarded IP
  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Use real IP as last resort
  return c.req.header('X-Real-IP') || 'unknown';
}

/**
 * Check if content type is allowed
 */
function isAllowedContentType(contentType: string): boolean {
  const allowedTypes = [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
  ];

  return allowedTypes.some(type => contentType.toLowerCase().startsWith(type));
}

/**
 * Detect suspicious headers
 */
function detectSuspiciousHeaders(c: Context): string[] {
  const suspicious: string[] = [];
  const headers = Object.entries(c.req.header() || {});

  for (const [name, value] of headers) {
    const lowerName = name.toLowerCase();

    // Check for proxy headers that shouldn't be present
    if (lowerName.includes('proxy') && !lowerName.startsWith('cf-')) {
      suspicious.push(name);
    }

    // Check for debugging headers
    if (lowerName.includes('debug') || lowerName.includes('test')) {
      suspicious.push(name);
    }

    // Check for overly long header values
    if (value && value.length > 8192) {
      suspicious.push(`${name} (too long)`);
    }
  }

  return suspicious;
}

/**
 * Merge security options with defaults
 */
function mergeSecurityOptions(
  defaults: SecurityOptions,
  overrides: Partial<SecurityOptions>
): SecurityOptions {
  return {
    cors: { ...defaults.cors, ...overrides.cors },
    csp: { ...defaults.csp, ...overrides.csp },
    headers: { ...defaults.headers, ...overrides.headers },
    rateLimit: { ...defaults.rateLimit, ...overrides.rateLimit },
    trustedProxies: overrides.trustedProxies || defaults.trustedProxies,
    environment: overrides.environment || defaults.environment,
  };
}

/**
 * Simple in-memory rate limiting (replace with KV in production)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

async function getRateLimitCount(key: string): Promise<number> {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    return 0;
  }

  return entry.count;
}

async function incrementRateLimitCount(key: string, windowMs: number): Promise<void> {
  const now = Date.now();
  const resetTime = now + windowMs;
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime });
  } else {
    entry.count++;
  }

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    // 1% chance
    cleanupRateLimitStore();
  }
}

function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Security health check
 */
export function securityHealthCheck(config: SecurityOptions): {
  healthy: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check CORS configuration
  if (config.cors.origin === true || config.cors.origin === '*') {
    issues.push('CORS allows all origins');
    recommendations.push('Restrict CORS to specific domains');
  }

  // Check CSP configuration
  if (!config.csp.enabled) {
    issues.push('Content Security Policy is disabled');
    recommendations.push('Enable CSP for XSS protection');
  }

  // Check HSTS in production
  if (config.environment === 'production' && !config.headers.hsts) {
    issues.push('HSTS is disabled in production');
    recommendations.push('Enable HSTS for production');
  }

  // Check rate limiting
  if (!config.rateLimit.enabled) {
    issues.push('Rate limiting is disabled');
    recommendations.push('Enable rate limiting to prevent abuse');
  }

  return {
    healthy: issues.length === 0,
    issues,
    recommendations,
  };
}

/**
 * Create development-friendly security middleware
 */
export function createDevelopmentSecurityMiddleware(): ReturnType<typeof createSecurityMiddleware> {
  return createSecurityMiddleware({
    cors: {
      origin: true, // Allow all origins in development
      credentials: true,
    },
    csp: {
      enabled: false, // Disable CSP in development
    },
    headers: {
      hsts: false, // No HSTS in development
    },
    rateLimit: {
      enabled: false, // No rate limiting in development
    },
    environment: 'development',
  });
}

/**
 * Create production security middleware
 */
export function createProductionSecurityMiddleware(
  allowedOrigins: string[]
): ReturnType<typeof createSecurityMiddleware> {
  return createSecurityMiddleware({
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    csp: {
      enabled: true,
      reportUri: '/api/csp-report',
    },
    headers: {
      hsts: true,
      frameOptions: 'DENY',
    },
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 15 * 60 * 1000,
    },
    environment: 'production',
  });
}
