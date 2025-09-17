import type { Context, Next } from 'hono';
import { getAuthenticatedUser } from './auth';

/**
 * Logging Middleware - T099
 *
 * Provides comprehensive request/response logging with structured output.
 * Includes performance monitoring, error tracking, and security event logging.
 */

export interface LogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  query?: string;
  userId?: number;
  telegramId?: number;
  ip: string;
  userAgent?: string;
  duration: number;
  status: number;
  responseSize?: number;
  error?: string;
  performance: {
    dbQueries?: number;
    cacheHits?: number;
    cacheMisses?: number;
  };
  security: {
    suspicious: boolean;
    flags: string[];
  };
}

export interface LoggingOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  logRequests: boolean;
  logResponses: boolean;
  logErrors: boolean;
  logSecurity: boolean;
  logPerformance: boolean;
  excludePaths?: string[];
  maxBodySize?: number;
  sensitiveHeaders?: string[];
  outputFormat: 'json' | 'text';
}

/**
 * Default logging configuration
 */
const DEFAULT_OPTIONS: LoggingOptions = {
  level: 'info',
  logRequests: true,
  logResponses: true,
  logErrors: true,
  logSecurity: true,
  logPerformance: true,
  excludePaths: ['/health', '/metrics'],
  maxBodySize: 1024, // 1KB
  sensitiveHeaders: ['authorization', 'cookie', 'x-api-key'],
  outputFormat: 'json',
};

/**
 * Create logging middleware
 */
export function createLoggingMiddleware(options: Partial<LoggingOptions> = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const requestId = generateRequestId(c);

    // Skip logging for excluded paths
    if (config.excludePaths?.some(path => c.req.path.startsWith(path))) {
      return next();
    }

    // Initialize performance tracking
    const performance = {
      dbQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    // Initialize security tracking
    const security = {
      suspicious: false,
      flags: [] as string[],
    };

    // Attach logging context to request
    c.set('requestId', requestId);
    c.set('startTime', startTime);
    c.set('performance', performance);
    c.set('security', security);

    // Log incoming request
    if (config.logRequests) {
      await logRequest(c, config);
    }

    let error: Error | null = null;
    try {
      await next();
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // Create log entry
      const logEntry = await createLogEntry(c, duration, error, performance, security, config);

      // Log based on configuration
      if (error && config.logErrors) {
        logError(logEntry, error, config);
      } else if (config.logResponses) {
        logResponse(logEntry, config);
      }

      // Log performance metrics if enabled
      if (config.logPerformance && duration > 1000) {
        // Log slow requests (>1s)
        logPerformance(logEntry, config);
      }

      // Log security events if flagged
      if (config.logSecurity && security.suspicious) {
        logSecurity(logEntry, config);
      }
    }
  };
}

/**
 * Performance tracking middleware
 */
export function createPerformanceMiddleware() {
  return async (c: Context, next: Next) => {
    const performance = c.get('performance') || { dbQueries: 0, cacheHits: 0, cacheMisses: 0 };

    // Monkey patch common operations to track performance
    const originalJson = c.json;
    c.json = function (object: any, status?: number) {
      trackResponseSize(c, JSON.stringify(object).length);
      return originalJson.call(this, object, status);
    };

    return next();
  };
}

/**
 * Security monitoring middleware
 */
export function createSecurityLoggingMiddleware() {
  return async (c: Context, next: Next) => {
    const security = c.get('security') || { suspicious: false, flags: [] };
    const ip = getClientIP(c);
    const userAgent = c.req.header('User-Agent') || '';

    // Check for suspicious patterns
    const path = c.req.path;
    const method = c.req.method;

    // SQL injection patterns
    if (containsSQLInjection(path) || containsSQLInjection(c.req.query() as any)) {
      security.suspicious = true;
      security.flags.push('SQL_INJECTION_ATTEMPT');
    }

    // XSS patterns
    if (containsXSS(path) || containsXSS(c.req.query() as any)) {
      security.suspicious = true;
      security.flags.push('XSS_ATTEMPT');
    }

    // Suspicious user agents
    if (isSuspiciousUserAgent(userAgent)) {
      security.suspicious = true;
      security.flags.push('SUSPICIOUS_USER_AGENT');
    }

    // Rate limiting violations
    if (isRateLimitViolation(c)) {
      security.suspicious = true;
      security.flags.push('RATE_LIMIT_VIOLATION');
    }

    // Invalid authentication attempts
    if (method === 'POST' && path.includes('auth')) {
      security.flags.push('AUTH_ATTEMPT');
    }

    // Admin access attempts
    if (path.startsWith('/api/admin')) {
      security.flags.push('ADMIN_ACCESS_ATTEMPT');
    }

    c.set('security', security);
    return next();
  };
}

/**
 * Error correlation middleware
 */
export function createErrorCorrelationMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      const requestId = c.get('requestId');
      const user = getAuthenticatedUser(c);

      // Enhance error with correlation data
      if (error instanceof Error) {
        (error as any).requestId = requestId;
        (error as any).userId = user?.id;
        (error as any).path = c.req.path;
        (error as any).method = c.req.method;
      }

      throw error;
    }
  };
}

/**
 * Generate unique request ID
 */
function generateRequestId(c: Context): string {
  // Use CloudFlare ray ID if available, otherwise generate
  return (
    c.req.header('CF-Ray') ||
    c.req.header('X-Request-ID') ||
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
}

/**
 * Get client IP address
 */
function getClientIP(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    c.req.header('X-Real-IP') ||
    'unknown'
  );
}

/**
 * Log incoming request
 */
async function logRequest(c: Context, config: LoggingOptions): Promise<void> {
  const user = getAuthenticatedUser(c);
  const requestData = {
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
    method: c.req.method,
    path: c.req.path,
    query: Object.keys(c.req.query()).length > 0 ? JSON.stringify(c.req.query()) : undefined,
    userId: user?.id,
    telegramId: user?.telegramId,
    ip: getClientIP(c),
    userAgent: c.req.header('User-Agent'),
    headers: sanitizeHeaders(Object.fromEntries(c.req.header()), config.sensitiveHeaders),
  };

  if (config.outputFormat === 'json') {
    console.log(JSON.stringify({ type: 'REQUEST', ...requestData }));
  } else {
    console.log(`REQUEST ${requestData.method} ${requestData.path} [${requestData.requestId}]`);
  }
}

/**
 * Create comprehensive log entry
 */
async function createLogEntry(
  c: Context,
  duration: number,
  error: Error | null,
  performance: any,
  security: any,
  config: LoggingOptions
): Promise<LogEntry> {
  const user = getAuthenticatedUser(c);

  return {
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId'),
    method: c.req.method,
    path: c.req.path,
    query: Object.keys(c.req.query()).length > 0 ? JSON.stringify(c.req.query()) : undefined,
    userId: user?.id,
    telegramId: user?.telegramId,
    ip: getClientIP(c),
    userAgent: c.req.header('User-Agent'),
    duration,
    status: c.res.status,
    responseSize: c.get('responseSize'),
    error: error?.message,
    performance,
    security,
  };
}

/**
 * Log response
 */
function logResponse(logEntry: LogEntry, config: LoggingOptions): void {
  if (config.outputFormat === 'json') {
    console.log(JSON.stringify({ type: 'RESPONSE', ...logEntry }));
  } else {
    const statusColor =
      logEntry.status >= 500
        ? '🔴'
        : logEntry.status >= 400
          ? '🟡'
          : logEntry.status >= 300
            ? '🔵'
            : '🟢';

    console.log(
      `RESPONSE ${statusColor} ${logEntry.method} ${logEntry.path} ` +
        `${logEntry.status} ${logEntry.duration}ms [${logEntry.requestId}]`
    );
  }
}

/**
 * Log error
 */
function logError(logEntry: LogEntry, error: Error, config: LoggingOptions): void {
  const errorData = {
    ...logEntry,
    type: 'ERROR',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
  };

  if (config.outputFormat === 'json') {
    console.error(JSON.stringify(errorData));
  } else {
    console.error(
      `ERROR 🔴 ${logEntry.method} ${logEntry.path} ` +
        `${logEntry.status} ${logEntry.duration}ms [${logEntry.requestId}] ` +
        `- ${error.message}`
    );
  }
}

/**
 * Log performance metrics
 */
function logPerformance(logEntry: LogEntry, config: LoggingOptions): void {
  const perfData = {
    type: 'PERFORMANCE',
    requestId: logEntry.requestId,
    path: logEntry.path,
    duration: logEntry.duration,
    performance: logEntry.performance,
  };

  if (config.outputFormat === 'json') {
    console.log(JSON.stringify(perfData));
  } else {
    console.log(
      `PERFORMANCE ⚠️ ${logEntry.path} ${logEntry.duration}ms ` +
        `[DB: ${logEntry.performance.dbQueries}, Cache: ${logEntry.performance.cacheHits}/${logEntry.performance.cacheMisses}]`
    );
  }
}

/**
 * Log security events
 */
function logSecurity(logEntry: LogEntry, config: LoggingOptions): void {
  const securityData = {
    type: 'SECURITY',
    timestamp: logEntry.timestamp,
    requestId: logEntry.requestId,
    path: logEntry.path,
    ip: logEntry.ip,
    userAgent: logEntry.userAgent,
    userId: logEntry.userId,
    flags: logEntry.security.flags,
  };

  if (config.outputFormat === 'json') {
    console.warn(JSON.stringify(securityData));
  } else {
    console.warn(
      `SECURITY 🚨 ${logEntry.path} from ${logEntry.ip} ` +
        `[${logEntry.security.flags.join(', ')}] [${logEntry.requestId}]`
    );
  }
}

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(
  headers: Record<string, string>,
  sensitiveHeaders: string[] = []
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Track response size
 */
function trackResponseSize(c: Context, size: number): void {
  c.set('responseSize', size);
}

/**
 * Check for SQL injection patterns
 */
function containsSQLInjection(input: string | Record<string, any>): boolean {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/i,
    /(\b(UNION|OR|AND)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/i,
    /(--|#|\/\*|\*\/)/,
    /(\b\d+\s*=\s*\d+\b)/,
    /('.*'.*=.*'.*')/,
  ];

  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return sqlPatterns.some(pattern => pattern.test(text));
}

/**
 * Check for XSS patterns
 */
function containsXSS(input: string | Record<string, any>): boolean {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe\b/i,
    /eval\s*\(/i,
  ];

  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return xssPatterns.some(pattern => pattern.test(text));
}

/**
 * Check for suspicious user agents
 */
function isSuspiciousUserAgent(userAgent: string): boolean {
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /requests/i,
  ];

  // Allow legitimate bots but flag others
  const legitimateBots = [/googlebot/i, /bingbot/i, /facebookexternalhit/i, /twitterbot/i];

  if (legitimateBots.some(pattern => pattern.test(userAgent))) {
    return false;
  }

  return suspiciousPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Check for rate limit violations
 */
function isRateLimitViolation(c: Context): boolean {
  // This would integrate with your rate limiting system
  return c.res.status === 429;
}

/**
 * Log aggregator for collecting metrics
 */
export class LogAggregator {
  private static instance: LogAggregator;
  private metrics = {
    requestCount: 0,
    errorCount: 0,
    averageResponseTime: 0,
    securityEvents: 0,
    responseTimes: [] as number[],
  };

  static getInstance(): LogAggregator {
    if (!LogAggregator.instance) {
      LogAggregator.instance = new LogAggregator();
    }
    return LogAggregator.instance;
  }

  /**
   * Record request metrics
   */
  recordRequest(duration: number, status: number, hasSecurityFlag: boolean): void {
    this.metrics.requestCount++;
    this.metrics.responseTimes.push(duration);

    if (status >= 400) {
      this.metrics.errorCount++;
    }

    if (hasSecurityFlag) {
      this.metrics.securityEvents++;
    }

    // Keep only last 1000 response times for memory efficiency
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
    }

    // Calculate average response time
    this.metrics.averageResponseTime =
      this.metrics.responseTimes.reduce((sum, time) => sum + time, 0) /
      this.metrics.responseTimes.length;
  }

  /**
   * Get current metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      securityEvents: 0,
      responseTimes: [],
    };
  }
}

/**
 * Helper functions for logging context
 */
export function getRequestId(c: Context): string {
  return c.get('requestId') || 'unknown';
}

export function getRequestStartTime(c: Context): number {
  return c.get('startTime') || Date.now();
}

export function trackDBQuery(c: Context): void {
  const performance = c.get('performance') || { dbQueries: 0, cacheHits: 0, cacheMisses: 0 };
  performance.dbQueries++;
  c.set('performance', performance);
}

export function trackCacheHit(c: Context): void {
  const performance = c.get('performance') || { dbQueries: 0, cacheHits: 0, cacheMisses: 0 };
  performance.cacheHits++;
  c.set('performance', performance);
}

export function trackCacheMiss(c: Context): void {
  const performance = c.get('performance') || { dbQueries: 0, cacheHits: 0, cacheMisses: 0 };
  performance.cacheMisses++;
  c.set('performance', performance);
}
