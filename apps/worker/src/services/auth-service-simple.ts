export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface MockAuthData {
  mockUserId: number;
  secret?: string;
}

export interface AuthResult {
  success: boolean;
  user?: any;
  sessionToken?: string;
  error?: string;
}

export class AuthService {
  private db: any;
  private botToken: string;
  private isDevelopment: boolean;

  constructor(db: any, botToken: string, isDevelopment: boolean = false) {
    this.db = db;
    this.botToken = botToken;
    this.isDevelopment = isDevelopment;
  }

  async authenticateTelegram(authData: TelegramAuthData): Promise<AuthResult> {
    try {
      // CRITICAL: Validate Telegram WebApp hash
      if (!(await this.validateTelegramHash(authData))) {
        return { success: false, error: 'Invalid Telegram authentication hash' };
      }

      // Check auth date (must be within last 24 hours)
      const authTime = authData.auth_date * 1000;
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;

      if (now - authTime > dayInMs) {
        return { success: false, error: 'Authentication data expired' };
      }

      // Create or update user with validated Telegram data
      const user = {
        id: authData.id,
        telegramId: authData.id.toString(),
        username: authData.username || null,
        firstName: authData.first_name || null,
        lastName: authData.last_name || null,
        isActive: true,
        isBanned: false
      };

      const sessionToken = this.generateSessionToken();

      return {
        success: true,
        user,
        sessionToken
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Validate Telegram WebApp authentication hash
   * This is CRITICAL for security - validates the data came from Telegram
   */
  private async validateTelegramHash(authData: TelegramAuthData): Promise<boolean> {
    try {
      const { hash, ...data } = authData;

      // Create data check string (sorted keys)
      const dataCheckString = Object.keys(data)
        .sort()
        .map(key => `${key}=${data[key as keyof typeof data]}`)
        .join('\n');

      // Create secret key using bot token (CloudFlare Workers crypto)
      const encoder = new TextEncoder();

      // Step 1: Create secret key
      const webAppDataKey = encoder.encode('WebAppData');
      const botTokenKey = encoder.encode(this.botToken);
      const secretKey = await crypto.subtle.importKey(
        'raw',
        webAppDataKey,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const secretKeyBytes = new Uint8Array(await crypto.subtle.sign('HMAC', secretKey, botTokenKey));

      // Step 2: Calculate expected hash
      const dataKey = await crypto.subtle.importKey(
        'raw',
        secretKeyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(dataCheckString));
      const expectedHash = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log('Hash validation:', {
        provided: hash,
        expected: expectedHash,
        dataCheckString
      });

      return hash === expectedHash;
    } catch (error) {
      console.error('Hash validation error:', error);
      return false;
    }
  }

  async authenticateMock(mockData: MockAuthData): Promise<AuthResult> {
    if (!this.isDevelopment) {
      return { success: false, error: 'Mock authentication not available in production' };
    }

    try {
      const user = {
        id: mockData.mockUserId,
        telegramId: mockData.mockUserId.toString(),
        username: `mock_user_${mockData.mockUserId}`,
        firstName: 'Mock',
        lastName: 'User',
        isActive: true,
        isBanned: false
      };

      const sessionToken = this.generateSessionToken();

      return {
        success: true,
        user,
        sessionToken
      };
    } catch (error) {
      console.error('Mock authentication error:', error);
      return { success: false, error: 'Mock authentication failed' };
    }
  }

  async validateSession(token: string): Promise<{ valid: boolean; user?: any }> {
    try {
      if (!token || token.length < 32) {
        return { valid: false };
      }

      // For now, accept all valid-looking tokens
      const user = {
        id: 123456789,
        telegramId: '123456789',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        isBanned: false
      };

      return { valid: true, user };
    } catch (error) {
      console.error('Session validation error:', error);
      return { valid: false };
    }
  }

  private generateSessionToken(): string {
    return crypto.randomUUID() + '_' + Date.now().toString(36);
  }
}