import type { Context, Next } from 'hono';
import Filter from 'leo-profanity';
import { BlockedWordModel } from '../db/models/blocked-word';
import { KVCacheService } from '../services/kv-cache-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Content Filter Middleware - T101
 *
 * Provides profanity filtering with leo-profanity and custom blocklist.
 * Includes configurable severity levels, custom word management, and bypass options.
 */

export interface ContentFilterOptions {
  strictMode: boolean;
  customWordsEnabled: boolean;
  leoProfanityEnabled: boolean;
  allowBypass: boolean;
  bypassRoles?: string[];
  cacheEnabled: boolean;
  cacheTTL?: number;
  severity: 'strict' | 'moderate' | 'lenient';
  categories: {
    profanity: boolean;
    spam: boolean;
    harassment: boolean;
    inappropriate: boolean;
  };
}

export interface FilterResult {
  passed: boolean;
  severity: 'none' | 'warning' | 'block';
  violations: string[];
  filtered: string;
  categories: string[];
  confidence: number;
}

export interface ContentAnalysis {
  originalText: string;
  filteredText: string;
  violations: {
    word: string;
    type: 'profanity' | 'spam' | 'harassment' | 'inappropriate' | 'custom';
    severity: 'low' | 'medium' | 'high';
    context: string;
  }[];
  spamScore: number;
  toxicityScore: number;
  readabilityScore: number;
}

/**
 * Default content filter configuration
 */
const DEFAULT_FILTER_OPTIONS: ContentFilterOptions = {
  strictMode: false,
  customWordsEnabled: true,
  leoProfanityEnabled: true,
  allowBypass: true,
  bypassRoles: ['admin', 'moderator'],
  cacheEnabled: true,
  cacheTTL: 3600, // 1 hour
  severity: 'moderate',
  categories: {
    profanity: true,
    spam: true,
    harassment: true,
    inappropriate: true,
  },
};

export class ContentFilterService {
  private blockedWordModel: BlockedWordModel;
  private cache?: KVCacheService;
  private options: ContentFilterOptions;
  private customWords: Set<string> = new Set();
  private lastCacheUpdate: number = 0;

  constructor(
    db: DrizzleD1Database,
    cache?: KVCacheService,
    options: Partial<ContentFilterOptions> = {}
  ) {
    this.blockedWordModel = new BlockedWordModel(db);
    this.cache = cache;
    this.options = { ...DEFAULT_FILTER_OPTIONS, ...options };

    // Initialize leo-profanity
    if (this.options.leoProfanityEnabled) {
      this.initializeLeoProfiler();
    }

    // Load custom words
    this.loadCustomWords();
  }

  /**
   * Initialize leo-profanity with custom configuration
   */
  private initializeLeoProfiler(): void {
    // Clear default words if we want full control
    if (this.options.strictMode) {
      Filter.clearList();
    }

    // Add common profanity patterns
    const commonProfanity = [
      'damn',
      'hell',
      'crap',
      'stupid',
      'idiot',
      'moron',
      'jerk',
      'ass',
      // Add more based on your requirements
    ];

    // Configure severity levels
    switch (this.options.severity) {
      case 'strict':
        Filter.add(commonProfanity);
        break;
      case 'moderate':
        // Use default filter list
        break;
      case 'lenient':
        Filter.remove(Filter.list().filter(word => word.length < 4));
        break;
    }
  }

  /**
   * Load custom words from database
   */
  private async loadCustomWords(): Promise<void> {
    try {
      const cacheKey = 'content_filter:custom_words';

      if (this.cache && this.options.cacheEnabled) {
        const cached = await this.cache.get<string[]>(cacheKey);
        if (cached) {
          this.customWords = new Set(cached);
          return;
        }
      }

      const blockedWords = await this.blockedWordModel.getAllActive();
      const wordList = blockedWords.map(bw => bw.word.toLowerCase());

      this.customWords = new Set(wordList);
      this.lastCacheUpdate = Date.now();

      // Cache the word list
      if (this.cache && this.options.cacheEnabled) {
        await this.cache.set(cacheKey, wordList, { ttl: this.options.cacheTTL });
      }
    } catch (error) {
      console.error('Failed to load custom words:', error);
    }
  }

  /**
   * Filter content and return detailed analysis
   */
  async filterContent(text: string, context?: any): Promise<FilterResult> {
    // Refresh custom words if needed
    if (Date.now() - this.lastCacheUpdate > (this.options.cacheTTL || 3600) * 1000) {
      await this.loadCustomWords();
    }

    const analysis = await this.analyzeContent(text, context);
    const violations: string[] = [];
    const categories: string[] = [];
    let severity: FilterResult['severity'] = 'none';

    // Check for profanity using leo-profanity
    if (this.options.leoProfanityEnabled && this.options.categories.profanity) {
      const profanityViolations = analysis.violations.filter(v => v.type === 'profanity');
      if (profanityViolations.length > 0) {
        violations.push(...profanityViolations.map(v => v.word));
        categories.push('profanity');

        if (profanityViolations.some(v => v.severity === 'high')) {
          severity = 'block';
        } else if (severity === 'none') {
          severity = 'warning';
        }
      }
    }

    // Check custom blocked words
    if (this.options.customWordsEnabled) {
      const customViolations = analysis.violations.filter(v => v.type === 'custom');
      if (customViolations.length > 0) {
        violations.push(...customViolations.map(v => v.word));
        categories.push('custom');
        severity = 'block'; // Custom words always block
      }
    }

    // Check for spam
    if (this.options.categories.spam && analysis.spamScore > 0.7) {
      categories.push('spam');
      severity = severity === 'block' ? 'block' : 'warning';
    }

    // Check for toxicity
    if (this.options.categories.harassment && analysis.toxicityScore > 0.8) {
      categories.push('harassment');
      severity = 'block';
    }

    const passed = severity !== 'block';

    return {
      passed,
      severity,
      violations,
      filtered: analysis.filteredText,
      categories,
      confidence: this.calculateConfidence(analysis),
    };
  }

  /**
   * Analyze content for various issues
   */
  private async analyzeContent(text: string, context?: any): Promise<ContentAnalysis> {
    const violations: ContentAnalysis['violations'] = [];
    let filteredText = text;

    // Leo-profanity analysis
    if (this.options.leoProfanityEnabled) {
      const profanityList = Filter.list();
      const words = text.toLowerCase().split(/\s+/);

      for (const word of words) {
        const cleanWord = word.replace(/[^\w]/g, '');
        if (profanityList.includes(cleanWord)) {
          violations.push({
            word: cleanWord,
            type: 'profanity',
            severity: this.getProfanitySeverity(cleanWord),
            context: this.getWordContext(text, word),
          });
        }
      }

      filteredText = Filter.clean(text);
    }

    // Custom words analysis
    if (this.options.customWordsEnabled) {
      const words = text.toLowerCase().split(/\s+/);

      for (const word of words) {
        const cleanWord = word.replace(/[^\w]/g, '');
        if (this.customWords.has(cleanWord)) {
          violations.push({
            word: cleanWord,
            type: 'custom',
            severity: 'high', // Custom words are always high severity
            context: this.getWordContext(text, word),
          });

          // Replace in filtered text
          const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
          filteredText = filteredText.replace(regex, '*'.repeat(word.length));
        }
      }
    }

    // Spam detection
    const spamScore = this.calculateSpamScore(text);

    // Toxicity detection (simplified)
    const toxicityScore = this.calculateToxicityScore(text, violations);

    // Readability score
    const readabilityScore = this.calculateReadabilityScore(text);

    return {
      originalText: text,
      filteredText,
      violations,
      spamScore,
      toxicityScore,
      readabilityScore,
    };
  }

  /**
   * Calculate spam score based on various factors
   */
  private calculateSpamScore(text: string): number {
    let score = 0;

    // Excessive capitalization
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.3) score += 0.3;

    // Excessive punctuation
    const punctRatio = ((text.match(/[!?]{2,}/g) || []).length / text.length) * 10;
    score += Math.min(punctRatio, 0.3);

    // Repeated characters
    const repeatedChars = text.match(/(.)\1{3,}/g) || [];
    score += Math.min(repeatedChars.length * 0.1, 0.2);

    // URL patterns
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    score += Math.min(urls.length * 0.2, 0.4);

    // Promotional keywords
    const promoKeywords = ['buy now', 'free', 'discount', 'limited time', 'click here'];
    const promoCount = promoKeywords.filter(keyword => text.toLowerCase().includes(keyword)).length;
    score += Math.min(promoCount * 0.15, 0.3);

    return Math.min(score, 1);
  }

  /**
   * Calculate toxicity score
   */
  private calculateToxicityScore(text: string, violations: ContentAnalysis['violations']): number {
    let score = 0;

    // Base score from violations
    const highSeverityCount = violations.filter(v => v.severity === 'high').length;
    const mediumSeverityCount = violations.filter(v => v.severity === 'medium').length;

    score += highSeverityCount * 0.4;
    score += mediumSeverityCount * 0.2;

    // Aggressive language patterns
    const aggressivePatterns = [
      /you\s+(are|r)\s+(stupid|dumb|idiot)/i,
      /shut\s+up/i,
      /f[*#@]ck\s+(you|off)/i,
      /kill\s+yourself/i,
    ];

    const aggressiveMatches = aggressivePatterns.filter(pattern => pattern.test(text)).length;
    score += aggressiveMatches * 0.3;

    return Math.min(score, 1);
  }

  /**
   * Calculate readability score
   */
  private calculateReadabilityScore(text: string): number {
    const words = text.split(/\s+/).length;
    const sentences = text.split(/[.!?]+/).length;
    const avgWordsPerSentence = words / Math.max(sentences, 1);

    // Simple readability score (0-1, higher is more readable)
    if (avgWordsPerSentence < 10) return 1;
    if (avgWordsPerSentence < 20) return 0.8;
    if (avgWordsPerSentence < 30) return 0.6;
    return 0.4;
  }

  /**
   * Get severity level for profanity
   */
  private getProfanitySeverity(word: string): 'low' | 'medium' | 'high' {
    const highSeverityWords = ['fuck', 'shit', 'bitch', 'damn'];
    const mediumSeverityWords = ['ass', 'hell', 'crap'];

    if (highSeverityWords.includes(word.toLowerCase())) return 'high';
    if (mediumSeverityWords.includes(word.toLowerCase())) return 'medium';
    return 'low';
  }

  /**
   * Get context around a word
   */
  private getWordContext(text: string, word: string, contextLength: number = 20): string {
    const index = text.toLowerCase().indexOf(word.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + word.length + contextLength);

    return text.substring(start, end);
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Calculate confidence score for the filter result
   */
  private calculateConfidence(analysis: ContentAnalysis): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence with more violations
    confidence += Math.min(analysis.violations.length * 0.1, 0.3);

    // Higher confidence with high severity violations
    const highSeverityCount = analysis.violations.filter(v => v.severity === 'high').length;
    confidence += Math.min(highSeverityCount * 0.2, 0.4);

    // Adjust based on spam and toxicity scores
    confidence += analysis.spamScore * 0.1;
    confidence += analysis.toxicityScore * 0.1;

    return Math.min(confidence, 1);
  }

  /**
   * Add custom blocked word
   */
  async addBlockedWord(word: string, reason?: string): Promise<void> {
    await this.blockedWordModel.create({
      word: word.toLowerCase(),
      reason: reason || 'Custom addition',
      severity: 'block',
      isActive: true,
    });

    this.customWords.add(word.toLowerCase());

    // Invalidate cache
    if (this.cache && this.options.cacheEnabled) {
      await this.cache.delete('content_filter:custom_words');
    }
  }

  /**
   * Remove custom blocked word
   */
  async removeBlockedWord(word: string): Promise<void> {
    await this.blockedWordModel.delete(word.toLowerCase());
    this.customWords.delete(word.toLowerCase());

    // Invalidate cache
    if (this.cache && this.options.cacheEnabled) {
      await this.cache.delete('content_filter:custom_words');
    }
  }
}

/**
 * Create content filter middleware
 */
export function createContentFilterMiddleware(
  db: DrizzleD1Database,
  cache?: KVCacheService,
  options: Partial<ContentFilterOptions> = {}
) {
  const filterService = new ContentFilterService(db, cache, options);

  return async (c: Context, next: Next) => {
    // Check if user can bypass filter
    const user = c.get('user');
    const adminContext = c.get('admin');

    if (options.allowBypass && adminContext) {
      const canBypass = options.bypassRoles?.includes(adminContext.adminLevel) || user?.isAdmin;
      if (canBypass) {
        return next();
      }
    }

    // Only filter POST/PUT requests with JSON content
    const method = c.req.method;
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      return next();
    }

    const contentType = c.req.header('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      return next();
    }

    try {
      // Get request body
      const body = await c.req.json();

      // Filter text fields
      const filteredBody = await filterObjectContent(body, filterService);

      // Check if any content was blocked
      const hasViolations = filteredBody._contentFilter?.violations?.length > 0;
      const hasBlocks = filteredBody._contentFilter?.severity === 'block';

      if (hasBlocks) {
        return c.json(
          {
            error: 'Content policy violation',
            details: 'Your content contains prohibited words or phrases',
            violations: filteredBody._contentFilter.violations,
            filtered: filteredBody._contentFilter.filtered,
          },
          400
        );
      }

      // Attach filtered content to request
      c.req = {
        ...c.req,
        json: () => Promise.resolve(filteredBody),
      } as any;

      // Log warnings if present
      if (filteredBody._contentFilter?.severity === 'warning') {
        console.warn('Content filter warning:', {
          path: c.req.path,
          userId: user?.id,
          violations: filteredBody._contentFilter.violations,
        });
      }

      return next();
    } catch (error) {
      console.error('Content filter error:', error);
      // Don't block request on filter errors
      return next();
    }
  };
}

/**
 * Filter content in an object recursively
 */
async function filterObjectContent(
  obj: any,
  filterService: ContentFilterService,
  depth: number = 0
): Promise<any> {
  if (depth > 10) return obj; // Prevent infinite recursion

  if (typeof obj === 'string') {
    const result = await filterService.filterContent(obj);
    return {
      ...obj,
      _contentFilter: result,
    };
  }

  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => filterObjectContent(item, filterService, depth + 1)));
  }

  if (obj && typeof obj === 'object') {
    const filtered: any = {};
    let hasViolations = false;
    const allViolations: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.length > 0) {
        const result = await filterService.filterContent(value);
        filtered[key] = result.filtered;

        if (result.violations.length > 0) {
          hasViolations = true;
          allViolations.push(...result.violations);
        }
      } else {
        filtered[key] = await filterObjectContent(value, filterService, depth + 1);
      }
    }

    if (hasViolations) {
      filtered._contentFilter = {
        violations: allViolations,
        severity: allViolations.length > 0 ? 'warning' : 'none',
      };
    }

    return filtered;
  }

  return obj;
}

/**
 * Helper middleware for specific content filtering
 */
export function filterTextContent(fieldNames: string[], filterService: ContentFilterService) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      let hasViolations = false;
      const allViolations: string[] = [];

      for (const fieldName of fieldNames) {
        const text = body[fieldName];
        if (typeof text === 'string' && text.length > 0) {
          const result = await filterService.filterContent(text);

          if (result.severity === 'block') {
            return c.json(
              {
                error: `Content policy violation in ${fieldName}`,
                field: fieldName,
                violations: result.violations,
              },
              400
            );
          }

          if (result.violations.length > 0) {
            hasViolations = true;
            allViolations.push(...result.violations);
          }

          body[fieldName] = result.filtered;
        }
      }

      if (hasViolations) {
        console.warn('Content filter warnings:', {
          path: c.req.path,
          fields: fieldNames,
          violations: allViolations,
        });
      }

      // Update request with filtered content
      c.req = {
        ...c.req,
        json: () => Promise.resolve(body),
      } as any;

      return next();
    } catch (error) {
      console.error('Text filter error:', error);
      return next();
    }
  };
}

/**
 * Get content filter statistics
 */
export async function getContentFilterStats(filterService: ContentFilterService): Promise<{
  totalCustomWords: number;
  leoProfanityEnabled: boolean;
  severity: string;
  categories: Record<string, boolean>;
}> {
  return {
    totalCustomWords: filterService['customWords'].size,
    leoProfanityEnabled: filterService['options'].leoProfanityEnabled,
    severity: filterService['options'].severity,
    categories: filterService['options'].categories,
  };
}
