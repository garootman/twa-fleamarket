import { eq, and, desc, asc, count, sql, gte, lte, like, isNull, isNotNull } from 'drizzle-orm';
import {
  blockedWords,
  type BlockedWord,
  type NewBlockedWord,
  type CreateBlockedWord,
  BlockedWordSeverity,
  filterProfanity,
  MODERATION_CONSTRAINTS,
} from '../../src/db/schema/moderation';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * BlockedWord Model - T048
 *
 * Provides business logic layer for content filtering and profanity management.
 * Handles blocked word CRUD, content filtering, severity management, and word list maintenance.
 */

export interface BlockedWordWithDetails extends BlockedWord {
  admin?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
  };
  daysSinceAdded: number;
  usageCount?: number; // How often this word has been detected
  lastDetected?: string;
  effectivenessScore?: number; // Analytics metric
}

export interface WordSearchFilters {
  severity?: BlockedWordSeverity;
  addedBy?: number;
  isActive?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  searchTerm?: string;
  wordLength?: { min?: number; max?: number };
}

export interface WordListResponse {
  words: BlockedWordWithDetails[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    totalWords: number;
    activeWords: number;
    warningWords: number;
    blockWords: number;
  };
}

export interface FilterResult {
  hasViolations: boolean;
  violations: string[];
  filteredText: string;
  shouldBlock: boolean;
  severity: 'warning' | 'block' | null;
  detectedWords: Array<{
    word: string;
    severity: BlockedWordSeverity;
    position: number;
  }>;
}

export interface WordStats {
  totalWords: number;
  activeWords: number;
  inactiveWords: number;
  warningWords: number;
  blockWords: number;
  wordsByAdmin: Array<{ adminId: number; wordCount: number }>;
  recentWords: BlockedWord[];
  mostDetectedWords: Array<{ word: string; detectionCount: number }>;
  filteringStats: {
    totalFilters: number;
    violationsDetected: number;
    wordsBlocked: number;
    warningsIssued: number;
  };
}

export class BlockedWordModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Add a new blocked word
   */
  async add(wordData: CreateBlockedWord): Promise<BlockedWord> {
    // Normalize the word (lowercase, trim)
    const normalizedWord = wordData.word.toLowerCase().trim();

    // Validate word length
    if (normalizedWord.length === 0) {
      throw new Error('Word cannot be empty');
    }

    if (normalizedWord.length > MODERATION_CONSTRAINTS.MAX_BLOCKED_WORD_LENGTH) {
      throw new Error(
        `Word cannot exceed ${MODERATION_CONSTRAINTS.MAX_BLOCKED_WORD_LENGTH} characters`
      );
    }

    // Check if word already exists
    const existingWord = await this.findByWord(normalizedWord);
    if (existingWord) {
      throw new Error('This word is already in the blocked list');
    }

    const [word] = await this.db
      .insert(blockedWords)
      .values({
        word: normalizedWord,
        severity: wordData.severity,
        addedBy: wordData.addedBy,
        isActive: wordData.isActive ?? true,
        createdAt: new Date().toISOString(),
      })
      .returning();

    return word;
  }

  /**
   * Find blocked word by ID
   */
  async findById(id: number): Promise<BlockedWord | null> {
    const [word] = await this.db
      .select()
      .from(blockedWords)
      .where(eq(blockedWords.id, id))
      .limit(1);

    return word || null;
  }

  /**
   * Find blocked word by word text
   */
  async findByWord(word: string): Promise<BlockedWord | null> {
    const normalizedWord = word.toLowerCase().trim();

    const [blockedWord] = await this.db
      .select()
      .from(blockedWords)
      .where(eq(blockedWords.word, normalizedWord))
      .limit(1);

    return blockedWord || null;
  }

  /**
   * Get blocked word with detailed information
   */
  async getWithDetails(id: number): Promise<BlockedWordWithDetails | null> {
    const word = await this.findById(id);
    if (!word) return null;

    const now = new Date();
    const createdDate = new Date(word.createdAt);

    const wordWithDetails: BlockedWordWithDetails = {
      ...word,
      daysSinceAdded: Math.floor((now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000)),
      usageCount: 0, // Would be calculated from detection logs
      effectivenessScore: 0, // Would be calculated from analytics
    };

    return wordWithDetails;
  }

  /**
   * Update blocked word
   */
  async update(
    id: number,
    updates: { severity?: BlockedWordSeverity; isActive?: boolean }
  ): Promise<BlockedWord | null> {
    const [word] = await this.db
      .update(blockedWords)
      .set(updates)
      .where(eq(blockedWords.id, id))
      .returning();

    return word || null;
  }

  /**
   * Toggle word active status
   */
  async toggle(id: number): Promise<BlockedWord | null> {
    const word = await this.findById(id);
    if (!word) {
      throw new Error('Blocked word not found');
    }

    return await this.update(id, { isActive: !word.isActive });
  }

  /**
   * Delete blocked word
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(blockedWords).where(eq(blockedWords.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Get all active blocked words
   */
  async getActive(): Promise<BlockedWord[]> {
    return await this.db
      .select()
      .from(blockedWords)
      .where(eq(blockedWords.isActive, true))
      .orderBy(asc(blockedWords.word));
  }

  /**
   * Get words by severity
   */
  async getBySeverity(severity: BlockedWordSeverity, activeOnly = true): Promise<BlockedWord[]> {
    let query = this.db.select().from(blockedWords).where(eq(blockedWords.severity, severity));

    if (activeOnly) {
      query = query.where(
        and(eq(blockedWords.severity, severity), eq(blockedWords.isActive, true))
      );
    }

    return await query.orderBy(asc(blockedWords.word));
  }

  /**
   * Filter text content for profanity
   */
  async filterContent(text: string): Promise<FilterResult> {
    const activeWords = await this.getActive();
    const baseResult = filterProfanity(text, activeWords);

    // Enhanced result with position information
    const detectedWords: Array<{ word: string; severity: BlockedWordSeverity; position: number }> =
      [];

    for (const violation of baseResult.violations) {
      const word = activeWords.find(w => w.word === violation);
      if (word) {
        const regex = new RegExp(word.word, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          detectedWords.push({
            word: word.word,
            severity: word.severity as BlockedWordSeverity,
            position: match.index,
          });
        }
      }
    }

    const result: FilterResult = {
      ...baseResult,
      severity: baseResult.shouldBlock ? 'block' : baseResult.hasViolations ? 'warning' : null,
      detectedWords,
    };

    return result;
  }

  /**
   * Batch filter multiple texts
   */
  async filterMultiple(texts: string[]): Promise<FilterResult[]> {
    const activeWords = await this.getActive();

    return texts.map(text => {
      const baseResult = filterProfanity(text, activeWords);
      const detectedWords: Array<{
        word: string;
        severity: BlockedWordSeverity;
        position: number;
      }> = [];

      for (const violation of baseResult.violations) {
        const word = activeWords.find(w => w.word === violation);
        if (word) {
          const regex = new RegExp(word.word, 'gi');
          let match;
          while ((match = regex.exec(text)) !== null) {
            detectedWords.push({
              word: word.word,
              severity: word.severity as BlockedWordSeverity,
              position: match.index,
            });
          }
        }
      }

      return {
        ...baseResult,
        severity: baseResult.shouldBlock ? 'block' : baseResult.hasViolations ? 'warning' : null,
        detectedWords,
      } as FilterResult;
    });
  }

  /**
   * Search and filter blocked words
   */
  async search(filters: WordSearchFilters = {}, page = 1, limit = 50): Promise<WordListResponse> {
    let query = this.db.select().from(blockedWords);
    let countQuery = this.db.select({ count: count() }).from(blockedWords);

    const conditions = [];

    // Severity filter
    if (filters.severity) {
      conditions.push(eq(blockedWords.severity, filters.severity));
    }

    // Added by filter
    if (filters.addedBy) {
      conditions.push(eq(blockedWords.addedBy, filters.addedBy));
    }

    // Active filter
    if (filters.isActive !== undefined) {
      conditions.push(eq(blockedWords.isActive, filters.isActive));
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(blockedWords.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(blockedWords.createdAt, filters.createdBefore));
    }

    // Search term filter
    if (filters.searchTerm) {
      conditions.push(like(blockedWords.word, `%${filters.searchTerm.toLowerCase()}%`));
    }

    // Word length filter
    if (filters.wordLength) {
      if (filters.wordLength.min !== undefined) {
        conditions.push(sql`LENGTH(${blockedWords.word}) >= ${filters.wordLength.min}`);
      }
      if (filters.wordLength.max !== undefined) {
        conditions.push(sql`LENGTH(${blockedWords.word}) <= ${filters.wordLength.max}`);
      }
    }

    // Apply conditions
    if (conditions.length > 0) {
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }

    // Get total count
    const [{ count: totalCount }] = await countQuery;

    // Get stats
    const stats = await this.getQuickStats();

    // Apply pagination and ordering
    const offset = (page - 1) * limit;
    const results = await query
      .orderBy(asc(blockedWords.word))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const wordList = hasMore ? results.slice(0, limit) : results;

    // Enhance with details
    const wordsWithDetails: BlockedWordWithDetails[] = await Promise.all(
      wordList.map(async word => {
        const details = await this.getWithDetails(word.id);
        return details!;
      })
    );

    return {
      words: wordsWithDetails,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Get words added by admin
   */
  async getByAdmin(adminId: number, limit = 100): Promise<BlockedWord[]> {
    return await this.db
      .select()
      .from(blockedWords)
      .where(eq(blockedWords.addedBy, adminId))
      .orderBy(desc(blockedWords.createdAt))
      .limit(limit);
  }

  /**
   * Bulk add words from list
   */
  async bulkAdd(
    words: string[],
    severity: BlockedWordSeverity,
    addedBy: number
  ): Promise<{
    added: number;
    skipped: number;
    errors: string[];
  }> {
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const word of words) {
      try {
        const normalizedWord = word.toLowerCase().trim();

        if (normalizedWord.length === 0) {
          errors.push(`Empty word skipped`);
          skipped++;
          continue;
        }

        if (normalizedWord.length > MODERATION_CONSTRAINTS.MAX_BLOCKED_WORD_LENGTH) {
          errors.push(`Word too long: ${word}`);
          skipped++;
          continue;
        }

        // Check if word already exists
        const existing = await this.findByWord(normalizedWord);
        if (existing) {
          errors.push(`Word already exists: ${word}`);
          skipped++;
          continue;
        }

        await this.add({
          word: normalizedWord,
          severity,
          addedBy,
          isActive: true,
        });

        added++;
      } catch (error) {
        errors.push(
          `Error adding "${word}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        skipped++;
      }
    }

    return { added, skipped, errors };
  }

  /**
   * Bulk update severity
   */
  async bulkUpdateSeverity(wordIds: number[], severity: BlockedWordSeverity): Promise<number> {
    if (wordIds.length === 0) return 0;

    const result = await this.db
      .update(blockedWords)
      .set({ severity })
      .where(sql`${blockedWords.id} IN (${wordIds.join(',')})`);

    return result.rowsAffected;
  }

  /**
   * Bulk toggle active status
   */
  async bulkToggle(wordIds: number[], isActive: boolean): Promise<number> {
    if (wordIds.length === 0) return 0;

    const result = await this.db
      .update(blockedWords)
      .set({ isActive })
      .where(sql`${blockedWords.id} IN (${wordIds.join(',')})`);

    return result.rowsAffected;
  }

  /**
   * Get comprehensive word statistics
   */
  async getStats(): Promise<WordStats> {
    const [totalResult] = await this.db.select({ count: count() }).from(blockedWords);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(eq(blockedWords.isActive, true));

    const [inactiveResult] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(eq(blockedWords.isActive, false));

    const [warningResult] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(eq(blockedWords.severity, BlockedWordSeverity.WARNING));

    const [blockResult] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(eq(blockedWords.severity, BlockedWordSeverity.BLOCK));

    // Words by admin
    const wordsByAdmin = await this.db
      .select({
        adminId: blockedWords.addedBy,
        wordCount: count(),
      })
      .from(blockedWords)
      .groupBy(blockedWords.addedBy)
      .orderBy(desc(count()))
      .limit(10);

    const recentWords = await this.db
      .select()
      .from(blockedWords)
      .orderBy(desc(blockedWords.createdAt))
      .limit(10);

    return {
      totalWords: totalResult.count,
      activeWords: activeResult.count,
      inactiveWords: inactiveResult.count,
      warningWords: warningResult.count,
      blockWords: blockResult.count,
      wordsByAdmin: wordsByAdmin.map(w => ({
        adminId: w.adminId,
        wordCount: w.wordCount,
      })),
      recentWords,
      mostDetectedWords: [], // Would be calculated from detection logs
      filteringStats: {
        totalFilters: 0, // Would be tracked in analytics
        violationsDetected: 0,
        wordsBlocked: 0,
        warningsIssued: 0,
      },
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    totalWords: number;
    activeWords: number;
    warningWords: number;
    blockWords: number;
  }> {
    const [totalResult] = await this.db.select({ count: count() }).from(blockedWords);

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(eq(blockedWords.isActive, true));

    const [warningResult] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(
        and(eq(blockedWords.severity, BlockedWordSeverity.WARNING), eq(blockedWords.isActive, true))
      );

    const [blockResult] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(
        and(eq(blockedWords.severity, BlockedWordSeverity.BLOCK), eq(blockedWords.isActive, true))
      );

    return {
      totalWords: totalResult.count,
      activeWords: activeResult.count,
      warningWords: warningResult.count,
      blockWords: blockResult.count,
    };
  }

  /**
   * Export word list
   */
  async export(
    activeOnly = true
  ): Promise<Array<{ word: string; severity: string; addedBy: number; createdAt: string }>> {
    let query = this.db
      .select({
        word: blockedWords.word,
        severity: blockedWords.severity,
        addedBy: blockedWords.addedBy,
        createdAt: blockedWords.createdAt,
      })
      .from(blockedWords);

    if (activeOnly) {
      query = query.where(eq(blockedWords.isActive, true));
    }

    return await query.orderBy(asc(blockedWords.word));
  }

  /**
   * Import word list from external source
   */
  async import(
    wordList: Array<{ word: string; severity?: BlockedWordSeverity }>,
    addedBy: number,
    replaceExisting = false
  ): Promise<{
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of wordList) {
      try {
        const normalizedWord = item.word.toLowerCase().trim();
        const severity = item.severity || BlockedWordSeverity.WARNING;

        if (normalizedWord.length === 0) {
          errors.push(`Empty word skipped`);
          skipped++;
          continue;
        }

        if (normalizedWord.length > MODERATION_CONSTRAINTS.MAX_BLOCKED_WORD_LENGTH) {
          errors.push(`Word too long: ${item.word}`);
          skipped++;
          continue;
        }

        const existing = await this.findByWord(normalizedWord);

        if (existing) {
          if (replaceExisting) {
            await this.update(existing.id, { severity, isActive: true });
            updated++;
          } else {
            errors.push(`Word already exists: ${item.word}`);
            skipped++;
          }
        } else {
          await this.add({
            word: normalizedWord,
            severity,
            addedBy,
            isActive: true,
          });
          imported++;
        }
      } catch (error) {
        errors.push(
          `Error processing "${item.word}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        skipped++;
      }
    }

    return { imported, updated, skipped, errors };
  }

  /**
   * Check if word exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(blockedWords)
      .where(eq(blockedWords.id, id));

    return result.count > 0;
  }

  /**
   * Helper functions
   */
  filter(text: string, words: BlockedWord[]): FilterResult {
    const baseResult = filterProfanity(text, words);
    const detectedWords: Array<{ word: string; severity: BlockedWordSeverity; position: number }> =
      [];

    for (const violation of baseResult.violations) {
      const word = words.find(w => w.word === violation);
      if (word) {
        const regex = new RegExp(word.word, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
          detectedWords.push({
            word: word.word,
            severity: word.severity as BlockedWordSeverity,
            position: match.index,
          });
        }
      }
    }

    return {
      ...baseResult,
      severity: baseResult.shouldBlock ? 'block' : baseResult.hasViolations ? 'warning' : null,
      detectedWords,
    };
  }

  normalizeWord(word: string): string {
    return word.toLowerCase().trim();
  }

  getConstraints() {
    return MODERATION_CONSTRAINTS;
  }
}

// Export types and enums for use in other modules
export {
  BlockedWord,
  NewBlockedWord,
  CreateBlockedWord,
  BlockedWordSeverity,
  filterProfanity,
  MODERATION_CONSTRAINTS,
};
export type {
  BlockedWordWithDetails,
  WordSearchFilters,
  WordListResponse,
  FilterResult,
  WordStats,
};
