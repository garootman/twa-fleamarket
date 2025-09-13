import type { User } from '../db/schema';

export class KVStorage {
  private kv: KVNamespace;

  constructor(kvNamespace: KVNamespace) {
    this.kv = kvNamespace;
  }

  // Token operations
  async saveToken(tokenHash: string, userData: User, ttlSeconds: number = 86400): Promise<void> {
    await this.kv.put(`token:${tokenHash}`, JSON.stringify(userData), {
      expirationTtl: ttlSeconds,
    });
  }

  async getUserByTokenHash(tokenHash: string): Promise<User | null> {
    const userData = await this.kv.get(`token:${tokenHash}`, 'json');
    return userData as User | null;
  }

  async deleteToken(tokenHash: string): Promise<void> {
    await this.kv.delete(`token:${tokenHash}`);
  }

  // Generic cache operations
  async get<T>(key: string): Promise<T | null> {
    return await this.kv.get(key, 'json');
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const options: KVNamespacePutOptions = {};
    if (ttlSeconds) {
      options.expirationTtl = ttlSeconds;
    }
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(prefix?: string): Promise<KVNamespaceListResult<unknown, string>> {
    return await this.kv.list(prefix ? { prefix } : {});
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'ok' | 'error'; message: string; timestamp: string }> {
    const testKey = 'health-check-test';
    const testValue = { timestamp: new Date().toISOString(), test: true };

    try {
      // Write test data
      await this.kv.put(testKey, JSON.stringify(testValue), { expirationTtl: 60 }); // 1 minute TTL

      // Read test data back
      const retrievedValue = await this.kv.get(testKey, 'json');

      if (!retrievedValue) {
        throw new Error('Failed to retrieve test data from KV');
      }

      // Clean up test data
      await this.kv.delete(testKey);

      return {
        status: 'ok',
        message: 'KV storage read/write successful',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Try to clean up on error
      try {
        await this.kv.delete(testKey);
      } catch {}

      return {
        status: 'error',
        message: `KV storage error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export * from '../db/schema';
export type { User };
