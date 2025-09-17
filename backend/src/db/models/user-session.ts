import { eq, and, desc, asc, count, sql, gte, lte, isNull, isNotNull, or } from 'drizzle-orm';
import {
  userSessions,
  type UserSession,
  type NewUserSession,
  type CreateUserSession,
  generateSessionToken,
  calculateSessionExpiration,
  isSessionValid,
  isSessionExpiredButActive,
  SESSION_CONSTRAINTS,
} from '../../src/db/schema/sessions';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * UserSession Model - T047
 *
 * Provides business logic layer for user session management and authentication.
 * Handles session creation, validation, renewal, revocation, and cleanup.
 */

export interface SessionWithDetails extends UserSession {
  user?: {
    telegramId: number;
    username?: string | null;
    firstName: string;
    lastName?: string | null;
  };
  daysSinceCreated: number;
  daysSinceLastUsed: number;
  hoursUntilExpiry: number;
  isCurrentlyValid: boolean;
  isExpiredButActive: boolean;
  deviceInfo?: {
    browser?: string;
    os?: string;
    isMobile: boolean;
  };
}

export interface SessionSearchFilters {
  userId?: number;
  isActive?: boolean;
  isValid?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  lastUsedAfter?: string;
  lastUsedBefore?: string;
  expiresAfter?: string;
  expiresBefore?: string;
  ipAddress?: string;
  deviceType?: 'mobile' | 'desktop';
  expiredButActive?: boolean;
}

export interface SessionListResponse {
  sessions: SessionWithDetails[];
  totalCount: number;
  hasMore: boolean;
  stats: {
    activeSessions: number;
    expiredSessions: number;
    revokedSessions: number;
    uniqueUsers: number;
  };
}

export interface CreateSessionData {
  userId: number;
  userAgent?: string;
  ipAddress?: string;
  expirationHours?: number;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  revokedSessions: number;
  uniqueUsers: number;
  avgSessionDurationHours: number;
  sessionsByDay: Array<{ date: string; count: number }>;
  topUserAgents: Array<{ userAgent: string; count: number }>;
  topIpAddresses: Array<{ ipAddress: string; count: number }>;
  recentSessions: UserSession[];
}

export class UserSessionModel {
  constructor(private db: DrizzleD1Database) {}

  /**
   * Create a new user session
   */
  async create(sessionData: CreateSessionData): Promise<UserSession> {
    const token = generateSessionToken();
    const expirationHours =
      sessionData.expirationHours || SESSION_CONSTRAINTS.DEFAULT_EXPIRATION_HOURS;
    const expiresAt = calculateSessionExpiration(expirationHours);

    // Validate user agent length
    if (
      sessionData.userAgent &&
      sessionData.userAgent.length > SESSION_CONSTRAINTS.MAX_USER_AGENT_LENGTH
    ) {
      throw new Error(
        `User agent cannot exceed ${SESSION_CONSTRAINTS.MAX_USER_AGENT_LENGTH} characters`
      );
    }

    // Validate IP address length
    if (
      sessionData.ipAddress &&
      sessionData.ipAddress.length > SESSION_CONSTRAINTS.MAX_IP_ADDRESS_LENGTH
    ) {
      throw new Error(
        `IP address cannot exceed ${SESSION_CONSTRAINTS.MAX_IP_ADDRESS_LENGTH} characters`
      );
    }

    const [session] = await this.db
      .insert(userSessions)
      .values({
        token,
        userId: sessionData.userId,
        expiresAt: expiresAt.toISOString(),
        userAgent: sessionData.userAgent || null,
        ipAddress: sessionData.ipAddress || null,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        isActive: true,
      })
      .returning();

    return session;
  }

  /**
   * Find session by token
   */
  async findByToken(token: string): Promise<UserSession | null> {
    const [session] = await this.db
      .select()
      .from(userSessions)
      .where(eq(userSessions.token, token))
      .limit(1);

    return session || null;
  }

  /**
   * Find session by ID
   */
  async findById(id: number): Promise<UserSession | null> {
    const [session] = await this.db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, id))
      .limit(1);

    return session || null;
  }

  /**
   * Validate session and update last used
   */
  async validateAndRefresh(
    token: string
  ): Promise<{ valid: boolean; session?: UserSession; reason?: string }> {
    const session = await this.findByToken(token);

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (!isSessionValid(session)) {
      return { valid: false, session, reason: 'Session expired or revoked' };
    }

    // Update last used timestamp
    const [updatedSession] = await this.db
      .update(userSessions)
      .set({ lastUsed: new Date().toISOString() })
      .where(eq(userSessions.id, session.id))
      .returning();

    return { valid: true, session: updatedSession };
  }

  /**
   * Get session with detailed information
   */
  async getWithDetails(id: number): Promise<SessionWithDetails | null> {
    const session = await this.findById(id);
    if (!session) return null;

    const now = new Date();
    const createdDate = new Date(session.createdAt);
    const lastUsedDate = new Date(session.lastUsed);
    const expiresDate = new Date(session.expiresAt);

    // Parse device info from user agent
    let deviceInfo: { browser?: string; os?: string; isMobile: boolean } | undefined;
    if (session.userAgent) {
      deviceInfo = {
        browser: this.extractBrowser(session.userAgent),
        os: this.extractOS(session.userAgent),
        isMobile: /Mobile|Android|iPhone|iPad/.test(session.userAgent),
      };
    }

    const sessionWithDetails: SessionWithDetails = {
      ...session,
      daysSinceCreated: Math.floor((now.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000)),
      daysSinceLastUsed: Math.floor(
        (now.getTime() - lastUsedDate.getTime()) / (24 * 60 * 60 * 1000)
      ),
      hoursUntilExpiry: Math.floor((expiresDate.getTime() - now.getTime()) / (60 * 60 * 1000)),
      isCurrentlyValid: isSessionValid(session),
      isExpiredButActive: isSessionExpiredButActive(session),
      deviceInfo,
    };

    return sessionWithDetails;
  }

  /**
   * Get user's sessions
   */
  async getUserSessions(userId: number, activeOnly = false): Promise<UserSession[]> {
    let query = this.db.select().from(userSessions).where(eq(userSessions.userId, userId));

    if (activeOnly) {
      query = query.where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.isActive, true),
          gte(userSessions.expiresAt, new Date().toISOString()),
          isNull(userSessions.revokedAt)
        )
      );
    }

    return await query.orderBy(desc(userSessions.lastUsed));
  }

  /**
   * Revoke session
   */
  async revoke(id: number, userId?: number): Promise<UserSession | null> {
    const existingSession = await this.findById(id);
    if (!existingSession) {
      throw new Error('Session not found');
    }

    // Check ownership if userId provided
    if (userId && existingSession.userId !== userId) {
      throw new Error('Not authorized to revoke this session');
    }

    const [session] = await this.db
      .update(userSessions)
      .set({
        isActive: false,
        revokedAt: new Date().toISOString(),
      })
      .where(eq(userSessions.id, id))
      .returning();

    return session || null;
  }

  /**
   * Revoke session by token
   */
  async revokeByToken(token: string): Promise<UserSession | null> {
    const session = await this.findByToken(token);
    if (!session) {
      throw new Error('Session not found');
    }

    return await this.revoke(session.id);
  }

  /**
   * Revoke all user sessions except current
   */
  async revokeAllUserSessions(userId: number, exceptToken?: string): Promise<number> {
    let updateQuery = this.db
      .update(userSessions)
      .set({
        isActive: false,
        revokedAt: new Date().toISOString(),
      })
      .where(and(eq(userSessions.userId, userId), eq(userSessions.isActive, true)));

    if (exceptToken) {
      updateQuery = updateQuery.where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.isActive, true),
          sql`${userSessions.token} != ${exceptToken}`
        )
      );
    }

    const result = await updateQuery;
    return result.rowsAffected;
  }

  /**
   * Extend session expiration
   */
  async extend(id: number, additionalHours: number): Promise<UserSession | null> {
    const session = await this.findById(id);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!isSessionValid(session)) {
      throw new Error('Cannot extend expired or revoked session');
    }

    const currentExpiry = new Date(session.expiresAt);
    const newExpiry = new Date(currentExpiry.getTime() + additionalHours * 60 * 60 * 1000);

    const [updatedSession] = await this.db
      .update(userSessions)
      .set({
        expiresAt: newExpiry.toISOString(),
        lastUsed: new Date().toISOString(),
      })
      .where(eq(userSessions.id, id))
      .returning();

    return updatedSession || null;
  }

  /**
   * Search and filter sessions
   */
  async search(
    filters: SessionSearchFilters = {},
    page = 1,
    limit = 50
  ): Promise<SessionListResponse> {
    let query = this.db.select().from(userSessions);
    let countQuery = this.db.select({ count: count() }).from(userSessions);

    const conditions = [];
    const now = new Date().toISOString();

    // User filter
    if (filters.userId) {
      conditions.push(eq(userSessions.userId, filters.userId));
    }

    // Active filter
    if (filters.isActive !== undefined) {
      conditions.push(eq(userSessions.isActive, filters.isActive));
    }

    // Valid filter (active, not revoked, not expired)
    if (filters.isValid !== undefined) {
      if (filters.isValid) {
        conditions.push(
          and(
            eq(userSessions.isActive, true),
            gte(userSessions.expiresAt, now),
            isNull(userSessions.revokedAt)
          )
        );
      } else {
        conditions.push(
          or(
            eq(userSessions.isActive, false),
            lte(userSessions.expiresAt, now),
            isNotNull(userSessions.revokedAt)
          )
        );
      }
    }

    // Date filters
    if (filters.createdAfter) {
      conditions.push(gte(userSessions.createdAt, filters.createdAfter));
    }
    if (filters.createdBefore) {
      conditions.push(lte(userSessions.createdAt, filters.createdBefore));
    }
    if (filters.lastUsedAfter) {
      conditions.push(gte(userSessions.lastUsed, filters.lastUsedAfter));
    }
    if (filters.lastUsedBefore) {
      conditions.push(lte(userSessions.lastUsed, filters.lastUsedBefore));
    }
    if (filters.expiresAfter) {
      conditions.push(gte(userSessions.expiresAt, filters.expiresAfter));
    }
    if (filters.expiresBefore) {
      conditions.push(lte(userSessions.expiresAt, filters.expiresBefore));
    }

    // IP address filter
    if (filters.ipAddress) {
      conditions.push(eq(userSessions.ipAddress, filters.ipAddress));
    }

    // Device type filter
    if (filters.deviceType) {
      if (filters.deviceType === 'mobile') {
        conditions.push(
          sql`${userSessions.userAgent} LIKE '%Mobile%' OR ${userSessions.userAgent} LIKE '%Android%' OR ${userSessions.userAgent} LIKE '%iPhone%' OR ${userSessions.userAgent} LIKE '%iPad%'`
        );
      } else {
        conditions.push(
          sql`${userSessions.userAgent} NOT LIKE '%Mobile%' AND ${userSessions.userAgent} NOT LIKE '%Android%' AND ${userSessions.userAgent} NOT LIKE '%iPhone%' AND ${userSessions.userAgent} NOT LIKE '%iPad%'`
        );
      }
    }

    // Expired but active filter
    if (filters.expiredButActive) {
      conditions.push(
        and(
          eq(userSessions.isActive, true),
          lte(userSessions.expiresAt, now),
          isNull(userSessions.revokedAt)
        )
      );
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
      .orderBy(desc(userSessions.lastUsed))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const sessionList = hasMore ? results.slice(0, limit) : results;

    // Enhance with details
    const sessionsWithDetails: SessionWithDetails[] = await Promise.all(
      sessionList.map(async session => {
        const details = await this.getWithDetails(session.id);
        return details!;
      })
    );

    return {
      sessions: sessionsWithDetails,
      totalCount,
      hasMore,
      stats,
    };
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date().toISOString();

    const result = await this.db
      .update(userSessions)
      .set({ isActive: false })
      .where(and(eq(userSessions.isActive, true), lte(userSessions.expiresAt, now)));

    return result.rowsAffected;
  }

  /**
   * Delete old sessions permanently
   */
  async deleteOldSessions(daysOld = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

    const result = await this.db
      .delete(userSessions)
      .where(lte(userSessions.createdAt, cutoffDate));

    return result.rowsAffected;
  }

  /**
   * Get sessions expiring soon
   */
  async getExpiringSoon(hours = 24, limit = 100): Promise<UserSession[]> {
    const futureDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    return await this.db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.isActive, true),
          lte(userSessions.expiresAt, futureDate),
          gte(userSessions.expiresAt, now),
          isNull(userSessions.revokedAt)
        )
      )
      .orderBy(asc(userSessions.expiresAt))
      .limit(limit);
  }

  /**
   * Get comprehensive session statistics
   */
  async getStats(): Promise<SessionStats> {
    const [totalResult] = await this.db.select({ count: count() }).from(userSessions);

    const now = new Date().toISOString();

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(userSessions)
      .where(
        and(
          eq(userSessions.isActive, true),
          gte(userSessions.expiresAt, now),
          isNull(userSessions.revokedAt)
        )
      );

    const [expiredResult] = await this.db
      .select({ count: count() })
      .from(userSessions)
      .where(lte(userSessions.expiresAt, now));

    const [revokedResult] = await this.db
      .select({ count: count() })
      .from(userSessions)
      .where(isNotNull(userSessions.revokedAt));

    const [uniqueUsersResult] = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT ${userSessions.userId})` })
      .from(userSessions);

    // Calculate average session duration
    const [avgDurationResult] = await this.db
      .select({
        avgHours: sql<number>`AVG(
          (julianday(COALESCE(${userSessions.revokedAt}, ${userSessions.expiresAt})) - julianday(${userSessions.createdAt})) * 24
        )`,
      })
      .from(userSessions);

    // Sessions by day (last 30 days)
    const sessionsByDay = await this.db
      .select({
        date: sql<string>`DATE(${userSessions.createdAt})`,
        count: count(),
      })
      .from(userSessions)
      .where(
        gte(userSessions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      )
      .groupBy(sql`DATE(${userSessions.createdAt})`)
      .orderBy(sql`DATE(${userSessions.createdAt})`);

    // Top user agents
    const topUserAgents = await this.db
      .select({
        userAgent: userSessions.userAgent,
        count: count(),
      })
      .from(userSessions)
      .where(isNotNull(userSessions.userAgent))
      .groupBy(userSessions.userAgent)
      .orderBy(desc(count()))
      .limit(10);

    // Top IP addresses
    const topIpAddresses = await this.db
      .select({
        ipAddress: userSessions.ipAddress,
        count: count(),
      })
      .from(userSessions)
      .where(isNotNull(userSessions.ipAddress))
      .groupBy(userSessions.ipAddress)
      .orderBy(desc(count()))
      .limit(10);

    const recentSessions = await this.db
      .select()
      .from(userSessions)
      .orderBy(desc(userSessions.createdAt))
      .limit(10);

    return {
      totalSessions: totalResult.count,
      activeSessions: activeResult.count,
      expiredSessions: expiredResult.count,
      revokedSessions: revokedResult.count,
      uniqueUsers: uniqueUsersResult.count,
      avgSessionDurationHours: Math.round((avgDurationResult.avgHours || 0) * 100) / 100,
      sessionsByDay: sessionsByDay.map(s => ({
        date: s.date,
        count: s.count,
      })),
      topUserAgents: topUserAgents.map(ua => ({
        userAgent: ua.userAgent || 'Unknown',
        count: ua.count,
      })),
      topIpAddresses: topIpAddresses.map(ip => ({
        ipAddress: ip.ipAddress || 'Unknown',
        count: ip.count,
      })),
      recentSessions,
    };
  }

  /**
   * Get quick stats for search responses
   */
  async getQuickStats(): Promise<{
    activeSessions: number;
    expiredSessions: number;
    revokedSessions: number;
    uniqueUsers: number;
  }> {
    const now = new Date().toISOString();

    const [activeResult] = await this.db
      .select({ count: count() })
      .from(userSessions)
      .where(
        and(
          eq(userSessions.isActive, true),
          gte(userSessions.expiresAt, now),
          isNull(userSessions.revokedAt)
        )
      );

    const [expiredResult] = await this.db
      .select({ count: count() })
      .from(userSessions)
      .where(lte(userSessions.expiresAt, now));

    const [revokedResult] = await this.db
      .select({ count: count() })
      .from(userSessions)
      .where(isNotNull(userSessions.revokedAt));

    const [uniqueUsersResult] = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT ${userSessions.userId})` })
      .from(userSessions);

    return {
      activeSessions: activeResult.count,
      expiredSessions: expiredResult.count,
      revokedSessions: revokedResult.count,
      uniqueUsers: uniqueUsersResult.count,
    };
  }

  /**
   * Check if session exists
   */
  async exists(id: number): Promise<boolean> {
    const [result] = await this.db
      .select({ count: count() })
      .from(userSessions)
      .where(eq(userSessions.id, id));

    return result.count > 0;
  }

  /**
   * Delete session
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(userSessions).where(eq(userSessions.id, id));

    return result.rowsAffected > 0;
  }

  /**
   * Helper methods for user agent parsing
   */
  private extractBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    return 'Unknown';
  }

  private extractOS(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  /**
   * Helper functions
   */
  isValid(session: UserSession): boolean {
    return isSessionValid(session);
  }

  isExpiredButActive(session: UserSession): boolean {
    return isSessionExpiredButActive(session);
  }

  generateToken(): string {
    return generateSessionToken();
  }

  calculateExpiration(hours: number): Date {
    return calculateSessionExpiration(hours);
  }

  getConstraints() {
    return SESSION_CONSTRAINTS;
  }
}

// Export types and functions for use in other modules
export {
  UserSession,
  NewUserSession,
  CreateUserSession,
  generateSessionToken,
  calculateSessionExpiration,
  isSessionValid,
  isSessionExpiredButActive,
  SESSION_CONSTRAINTS,
};
export type {
  SessionWithDetails,
  SessionSearchFilters,
  SessionListResponse,
  CreateSessionData,
  SessionStats,
};
