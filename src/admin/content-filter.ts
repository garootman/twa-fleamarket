import type { Database } from '../db';
import type { CreateBlockedWord, BlockedWord } from '../db/schema/moderation';
import { BlockedWordSeverity } from '../db/schema/moderation';

export interface ContentFilterResult {
  passed: boolean;
  violations: Array<{
    word: string;
    severity: 'warning' | 'block';
    position: number;
  }>;
  filteredText: string;
  shouldBlock: boolean;
}

export interface ContentFilterStats {
  totalWords: number;
  warningWords: number;
  blockWords: number;
  lastUpdated: string;
  recentViolations: Array<{
    text: string;
    violations: string[];
    timestamp: string;
  }>;
}

export class ContentFilter {
  private db: Database;
  private blockedWords: BlockedWord[] = [];
  private lastCacheUpdate: Date = new Date(0);
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  // Built-in profanity filter patterns (basic implementation)
  private builtInPatterns: Array<{ pattern: RegExp; severity: 'warning' | 'block' }> = [
    // Basic spam patterns
    { pattern: /\b(spam|fake|scam|fraud)\b/gi, severity: 'warning' },
    { pattern: /\b(click here|visit now|free money)\b/gi, severity: 'warning' },

    // Contact info sharing (platform policy)
    { pattern: /\b\d{10,15}\b/g, severity: 'warning' }, // Phone numbers
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, severity: 'warning' }, // Email

    // External platform mentions
    { pattern: /\b(whatsapp|instagram|facebook|snapchat)\b/gi, severity: 'warning' },
  ];

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Initialize or refresh blocked words cache
   */
  private async refreshBlockedWordsCache(): Promise<void> {
    const now = new Date();
    if (now.getTime() - this.lastCacheUpdate.getTime() < this.cacheTTL) {
      return; // Cache is still fresh
    }

    try {
      // In a real implementation, this would query the database
      // this.blockedWords = await this.db.getActiveBlockedWords();
      this.blockedWords = []; // Placeholder

      this.lastCacheUpdate = now;
    } catch (error) {
      console.error('Error refreshing blocked words cache:', error);
    }
  }

  /**
   * Filter text content for violations
   */
  async filterContent(text: string): Promise<ContentFilterResult> {
    await this.refreshBlockedWordsCache();

    const violations: Array<{
      word: string;
      severity: 'warning' | 'block';
      position: number;
    }> = [];

    let filteredText = text;
    let shouldBlock = false;

    // Check against built-in patterns
    for (const { pattern, severity } of this.builtInPatterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        violations.push({
          word: match[0],
          severity,
          position: match.index || 0,
        });

        if (severity === 'block') {
          shouldBlock = true;
        }

        // Replace with asterisks
        filteredText = filteredText.replace(pattern, matched => '*'.repeat(matched.length));
      }
    }

    // Check against admin-managed blocked words
    for (const blockedWord of this.blockedWords) {
      const regex = new RegExp(`\\b${this.escapeRegex(blockedWord.word)}\\b`, 'gi');
      const matches = Array.from(text.matchAll(regex));

      for (const match of matches) {
        violations.push({
          word: blockedWord.word,
          severity: blockedWord.severity as 'warning' | 'block',
          position: match.index || 0,
        });

        if (blockedWord.severity === BlockedWordSeverity.BLOCK) {
          shouldBlock = true;
        }

        // Replace with asterisks
        filteredText = filteredText.replace(regex, matched => '*'.repeat(matched.length));
      }
    }

    return {
      passed: !shouldBlock,
      violations,
      filteredText,
      shouldBlock,
    };
  }

  /**
   * Quick check if content should be blocked (without filtering)
   */
  async shouldBlockContent(text: string): Promise<boolean> {
    const result = await this.filterContent(text);
    return result.shouldBlock;
  }

  /**
   * Add blocked word (admin only)
   */
  async addBlockedWord(
    adminId: number,
    word: string,
    severity: 'warning' | 'block'
  ): Promise<boolean> {
    try {
      const blockedWord: Omit<CreateBlockedWord, 'addedBy'> = {
        word: word.toLowerCase().trim(),
        severity: severity as BlockedWordSeverity,
        isActive: true,
      };

      // In a real implementation:
      // await this.db.createBlockedWord({ ...blockedWord, addedBy: adminId });

      // Invalidate cache
      this.lastCacheUpdate = new Date(0);

      return true;
    } catch (error) {
      console.error('Error adding blocked word:', error);
      return false;
    }
  }

  /**
   * Remove blocked word (admin only)
   */
  async removeBlockedWord(adminId: number, wordId: number): Promise<boolean> {
    try {
      // In a real implementation:
      // await this.db.deactivateBlockedWord(wordId, adminId);

      // Invalidate cache
      this.lastCacheUpdate = new Date(0);

      return true;
    } catch (error) {
      console.error('Error removing blocked word:', error);
      return false;
    }
  }

  /**
   * Get all blocked words (admin only)
   */
  async getBlockedWords(adminId: number): Promise<BlockedWord[]> {
    await this.refreshBlockedWordsCache();
    return this.blockedWords;
  }

  /**
   * Update blocked word (admin only)
   */
  async updateBlockedWord(
    adminId: number,
    wordId: number,
    updates: {
      word?: string;
      severity?: 'warning' | 'block';
      isActive?: boolean;
    }
  ): Promise<boolean> {
    try {
      // In a real implementation:
      // await this.db.updateBlockedWord(wordId, updates, adminId);

      // Invalidate cache
      this.lastCacheUpdate = new Date(0);

      return true;
    } catch (error) {
      console.error('Error updating blocked word:', error);
      return false;
    }
  }

  /**
   * Get content filter statistics
   */
  async getFilterStats(adminId: number): Promise<ContentFilterStats> {
    await this.refreshBlockedWordsCache();

    const warningWords = this.blockedWords.filter(
      w => w.severity === BlockedWordSeverity.WARNING
    ).length;

    const blockWords = this.blockedWords.filter(
      w => w.severity === BlockedWordSeverity.BLOCK
    ).length;

    return {
      totalWords: this.blockedWords.length,
      warningWords,
      blockWords,
      lastUpdated: this.lastCacheUpdate.toISOString(),
      recentViolations: [], // Would be populated from violation logs
    };
  }

  /**
   * Test content filter against sample text (admin only)
   */
  async testFilter(adminId: number, text: string): Promise<ContentFilterResult> {
    return await this.filterContent(text);
  }

  /**
   * Bulk import blocked words (admin only)
   */
  async bulkImportWords(
    adminId: number,
    words: Array<{ word: string; severity: 'warning' | 'block' }>
  ): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const { word, severity } of words) {
      try {
        const cleanWord = word.toLowerCase().trim();

        // Skip empty or invalid words
        if (!cleanWord || cleanWord.length < 2) {
          skipped++;
          continue;
        }

        // Skip if already exists
        if (this.blockedWords.some(w => w.word === cleanWord)) {
          skipped++;
          continue;
        }

        // Add the word
        const success = await this.addBlockedWord(adminId, cleanWord, severity);
        if (success) {
          imported++;
        } else {
          errors.push(`Failed to import: ${cleanWord}`);
        }
      } catch (error) {
        errors.push(
          `Error importing "${word}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return { imported, skipped, errors };
  }

  /**
   * Export blocked words list (admin only)
   */
  async exportBlockedWords(
    adminId: number,
    format: 'json' | 'csv' = 'json'
  ): Promise<{ data: any; filename: string }> {
    await this.refreshBlockedWordsCache();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `blocked_words_${timestamp}.${format}`;

    if (format === 'csv') {
      const csv = [
        'word,severity,active,added_by,created_at',
        ...this.blockedWords.map(
          w => `"${w.word}","${w.severity}","${w.isActive}","${w.addedBy}","${w.createdAt}"`
        ),
      ].join('\n');

      return { data: csv, filename };
    } else {
      return { data: this.blockedWords, filename };
    }
  }

  /**
   * Get content filter configuration
   */
  async getFilterConfig(adminId: number): Promise<{
    builtInPatternsEnabled: boolean;
    customWordsEnabled: boolean;
    autoBlock: boolean;
    logViolations: boolean;
  }> {
    // In a real implementation, this would be stored in settings
    return {
      builtInPatternsEnabled: true,
      customWordsEnabled: true,
      autoBlock: true,
      logViolations: true,
    };
  }

  /**
   * Update content filter configuration
   */
  async updateFilterConfig(
    adminId: number,
    config: {
      builtInPatternsEnabled?: boolean;
      customWordsEnabled?: boolean;
      autoBlock?: boolean;
      logViolations?: boolean;
    }
  ): Promise<boolean> {
    try {
      // In a real implementation, this would update settings
      console.log('Filter config updated:', config);
      return true;
    } catch (error) {
      console.error('Error updating filter config:', error);
      return false;
    }
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Log violation for analytics (internal)
   */
  private async logViolation(
    text: string,
    violations: Array<{ word: string; severity: string }>
  ): Promise<void> {
    try {
      // In a real implementation, this would log to analytics/monitoring
      console.log('Content violation logged:', {
        text: text.substring(0, 50) + '...',
        violationCount: violations.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error logging violation:', error);
    }
  }
}
