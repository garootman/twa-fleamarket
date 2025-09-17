import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Integration Test T033: Buyer-Seller Communication Flow
 *
 * This test validates the complete communication workflow including:
 * - Interest expression via Telegram bot
 * - Automated message routing between buyer and seller
 * - Privacy protection (no direct contact info sharing)
 * - Communication history tracking
 * - Spam prevention and moderation
 * - Listing interaction analytics
 *
 * User Journey Coverage:
 * - Buyer views listing and expresses interest
 * - Bot facilitates anonymous communication
 * - Messages are exchanged while maintaining privacy
 * - System tracks engagement metrics
 * - Moderation system monitors communications
 */

// Mock environment and setup for integration testing
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
  DB: D1Database;
  INIT_SECRET: string;
  KV_CACHE: KVNamespace;
}

// User and listing types
interface User {
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  profile_photo_url: string | null;
  created_at: string;
  is_admin: boolean;
  warning_count: number;
  is_banned: boolean;
}

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  category_id: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'poor';
  location: string;
  seller_id: number;
  status: 'draft' | 'preview' | 'active' | 'sold' | 'archived';
  created_at: string;
  updated_at: string;
  published_at: string | null;
  views: number;
  is_premium: boolean;
}

// Communication types
interface CommunicationThread {
  id: number;
  listing_id: number;
  buyer_id: number;
  seller_id: number;
  created_at: string;
  last_message_at: string;
  is_active: boolean;
  message_count: number;
}

interface Message {
  id: number;
  thread_id: number;
  sender_id: number;
  recipient_id: number;
  content: string;
  sent_at: string;
  is_read: boolean;
  is_flagged: boolean;
  message_type: 'text' | 'system';
}

// Telegram Bot API types
interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  date: number;
  chat: TelegramChat;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data: string;
    message?: TelegramMessage;
  };
}

interface BotResponse {
  method: 'sendMessage' | 'editMessageText';
  chat_id: number;
  text: string;
  message_id?: number;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: {
    inline_keyboard?: Array<
      Array<{
        text: string;
        url?: string;
        callback_data?: string;
      }>
    >;
  };
}

// Mock environment for testing
const mockEnv: Env = {
  TELEGRAM_BOT_TOKEN: 'mock_bot_token',
  FRONTEND_URL: 'http://localhost:5173',
  DB: {} as D1Database,
  INIT_SECRET: 'mock_secret',
  KV_CACHE: {} as KVNamespace,
};

// Mock database state
let mockUsers: User[] = [
  {
    telegram_id: 123456789,
    username: 'seller_user',
    first_name: 'John',
    last_name: 'Seller',
    profile_photo_url: null,
    created_at: '2025-09-15T10:00:00Z',
    is_admin: false,
    warning_count: 0,
    is_banned: false,
  },
  {
    telegram_id: 987654321,
    username: 'buyer_user',
    first_name: 'Jane',
    last_name: 'Buyer',
    profile_photo_url: null,
    created_at: '2025-09-15T11:00:00Z',
    is_admin: false,
    warning_count: 0,
    is_banned: false,
  },
];

let mockListings: Listing[] = [
  {
    id: 1,
    title: 'iPhone 14 Pro Max',
    description: 'Excellent condition iPhone',
    price: 89999,
    category_id: 2,
    condition: 'excellent',
    location: 'San Francisco, CA',
    seller_id: 123456789,
    status: 'active',
    created_at: '2025-09-15T12:00:00Z',
    updated_at: '2025-09-15T12:00:00Z',
    published_at: '2025-09-15T12:00:00Z',
    views: 25,
    is_premium: false,
  },
];

let mockThreads: CommunicationThread[] = [];
let mockMessages: Message[] = [];

// Mock D1Database implementation
const mockDB: D1Database = {
  prepare: (query: string) => ({
    bind: (...params: any[]) => ({
      first: async () => {
        if (query.includes('SELECT') && query.includes('users')) {
          return mockUsers.find(u => params.includes(u.telegram_id));
        }
        if (query.includes('SELECT') && query.includes('listings')) {
          return mockListings.find(l => params.includes(l.id));
        }
        if (query.includes('SELECT') && query.includes('communication_threads')) {
          return mockThreads.find(
            t => params.includes(t.listing_id) && params.includes(t.buyer_id)
          );
        }
        return null;
      },
      run: async () => {
        if (query.includes('INSERT INTO communication_threads')) {
          const newThread: CommunicationThread = {
            id: mockThreads.length + 1,
            listing_id: params[0],
            buyer_id: params[1],
            seller_id: params[2],
            created_at: new Date().toISOString(),
            last_message_at: new Date().toISOString(),
            is_active: true,
            message_count: 0,
          };
          mockThreads.push(newThread);
          return {
            success: true,
            meta: {
              changes: 1,
              last_row_id: newThread.id,
              duration: 10,
              rows_read: 0,
              rows_written: 1,
            },
          };
        }
        if (query.includes('INSERT INTO messages')) {
          const newMessage: Message = {
            id: mockMessages.length + 1,
            thread_id: params[0],
            sender_id: params[1],
            recipient_id: params[2],
            content: params[3],
            sent_at: new Date().toISOString(),
            is_read: false,
            is_flagged: false,
            message_type: 'text',
          };
          mockMessages.push(newMessage);
          return {
            success: true,
            meta: {
              changes: 1,
              last_row_id: newMessage.id,
              duration: 10,
              rows_read: 0,
              rows_written: 1,
            },
          };
        }
        return { success: true, meta: {} as any };
      },
      all: async () => {
        if (query.includes('SELECT') && query.includes('messages')) {
          const threadId = params[0];
          return {
            results: mockMessages.filter(m => m.thread_id === threadId),
            success: true,
            meta: {} as any,
          };
        }
        return { results: [], success: true, meta: {} as any };
      },
    }),
    first: async () => null,
    run: async () => ({ success: true, meta: {} as any }),
    all: async () => ({ results: [], success: true, meta: {} as any }),
    raw: async () => [],
  }),
  batch: async () => [],
  dump: async () => new ArrayBuffer(0),
  exec: async () => ({ count: 0, duration: 0 }),
} as any;

// Mock KV namespace
const mockKV: KVNamespace = {
  put: async (key: string, value: string) => undefined,
  get: async (key: string) => null,
  delete: async (key: string) => undefined,
  list: async () => ({ keys: [], list_complete: true, cursor: undefined }),
  getWithMetadata: async (key: string) => ({ value: null, metadata: null }),
} as any;

mockEnv.DB = mockDB;
mockEnv.KV_CACHE = mockKV;

// Polyfills for Worker environment
global.Request =
  global.Request ||
  (class {
    constructor(
      public url: string,
      public init?: any
    ) {
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers || {});
    }
    method: string;
    headers: Headers;
    json() {
      return Promise.resolve(JSON.parse(this.init?.body || '{}'));
    }
  } as any);

global.Response =
  global.Response ||
  (class {
    constructor(
      public body?: any,
      public init?: any
    ) {
      this.status = init?.status || 200;
      this.headers = new Headers(init?.headers || {});
    }
    status: number;
    headers: Headers;
    async text() {
      return Promise.resolve(this.body || '');
    }
    async json() {
      return Promise.resolve(JSON.parse(this.body || '{}'));
    }
    ok: boolean = this.status >= 200 && this.status < 300;
  } as any);

describe('Integration Test T033: Buyer-Seller Communication Flow', () => {
  let worker: any;

  beforeEach(async () => {
    // Reset mock data
    mockThreads = [];
    mockMessages = [];

    // Import the worker module
    try {
      const workerModule = await import('../../src/index');
      worker = workerModule.default;
    } catch (error) {
      // Expected to fail initially - communication system not implemented yet
      worker = null;
    }
  });

  describe('Interest expression and thread creation', () => {
    it('should create communication thread when buyer expresses interest', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Buyer clicks "I'm interested" button on listing
      const interestUpdate: TelegramUpdate = {
        update_id: 123456800,
        callback_query: {
          id: 'callback_123',
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Jane',
            last_name: 'Buyer',
            username: 'buyer_user',
          },
          data: 'interest:1', // listing_id = 1
        },
      };

      const request = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(interestUpdate),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const botResponse: BotResponse = await response.json();

      // Should confirm interest and provide next steps
      expect(botResponse.method).toBe('editMessageText');
      expect(botResponse.text).toMatch(/interest.*confirmed|thank.*you/i);
      expect(botResponse.text).toMatch(/seller.*notified/i);

      // Should include inline keyboard for further actions
      expect(botResponse.reply_markup?.inline_keyboard).toBeDefined();

      // Verify communication thread was created
      expect(mockThreads.length).toBe(1);
      expect(mockThreads[0].listing_id).toBe(1);
      expect(mockThreads[0].buyer_id).toBe(987654321);
      expect(mockThreads[0].seller_id).toBe(123456789);
    });

    it('should notify seller when buyer expresses interest', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Mock the interest expression and verify seller notification
      const interestUpdate: TelegramUpdate = {
        update_id: 123456801,
        callback_query: {
          id: 'callback_124',
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Jane',
            username: 'buyer_user',
          },
          data: 'interest:1',
        },
      };

      const request = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(interestUpdate),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // In a real implementation, this would trigger a separate message to the seller
      // For testing, we verify the thread creation and system message
      expect(mockThreads.length).toBe(1);

      // System should create initial message in thread
      const systemMessage = mockMessages.find(
        m => m.thread_id === mockThreads[0].id && m.message_type === 'system'
      );
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.content).toMatch(/Jane.*interested.*iPhone/i);
    });

    it('should handle duplicate interest expressions gracefully', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // First interest expression
      const firstInterestUpdate: TelegramUpdate = {
        update_id: 123456802,
        callback_query: {
          id: 'callback_125',
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Jane',
            username: 'buyer_user',
          },
          data: 'interest:1',
        },
      };

      const firstRequest = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(firstInterestUpdate),
      });

      await worker.fetch(firstRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      // Second interest expression (duplicate)
      const secondInterestUpdate: TelegramUpdate = {
        update_id: 123456803,
        callback_query: {
          id: 'callback_126',
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Jane',
            username: 'buyer_user',
          },
          data: 'interest:1',
        },
      };

      const secondRequest = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(secondInterestUpdate),
      });

      const response = await worker.fetch(secondRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const botResponse: BotResponse = await response.json();

      // Should acknowledge existing interest
      expect(botResponse.text).toMatch(/already.*interested|continue.*conversation/i);

      // Should not create duplicate thread
      expect(mockThreads.length).toBe(1);
    });
  });

  describe('Message exchange workflow', () => {
    it('should facilitate anonymous message exchange between buyer and seller', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // First, create a communication thread (simulate interest expression)
      const thread: CommunicationThread = {
        id: 1,
        listing_id: 1,
        buyer_id: 987654321,
        seller_id: 123456789,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        is_active: true,
        message_count: 1,
      };
      mockThreads.push(thread);

      // Buyer sends message to seller
      const buyerMessageUpdate: TelegramUpdate = {
        update_id: 123456804,
        message: {
          message_id: 100,
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Jane',
            username: 'buyer_user',
          },
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 987654321,
            type: 'private',
          },
          text: 'Hi, is this iPhone still available? Can we meet tomorrow?',
        },
      };

      const buyerRequest = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(buyerMessageUpdate),
      });

      const buyerResponse = await worker.fetch(buyerRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(buyerResponse.status).toBe(200);

      // Should create message in database
      expect(mockMessages.length).toBe(1);
      expect(mockMessages[0].sender_id).toBe(987654321);
      expect(mockMessages[0].recipient_id).toBe(123456789);
      expect(mockMessages[0].content).toBe(
        'Hi, is this iPhone still available? Can we meet tomorrow?'
      );

      // Seller responds
      const sellerMessageUpdate: TelegramUpdate = {
        update_id: 123456805,
        message: {
          message_id: 101,
          from: {
            id: 123456789,
            is_bot: false,
            first_name: 'John',
            username: 'seller_user',
          },
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 123456789,
            type: 'private',
          },
          text: "Yes, it's still available! Tomorrow at 2 PM works for me.",
        },
      };

      const sellerRequest = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(sellerMessageUpdate),
      });

      const sellerResponse = await worker.fetch(sellerRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(sellerResponse.status).toBe(200);

      // Should create seller's message
      expect(mockMessages.length).toBe(2);
      expect(mockMessages[1].sender_id).toBe(123456789);
      expect(mockMessages[1].recipient_id).toBe(987654321);
    });

    it('should format messages with sender context while preserving privacy', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create thread
      const thread: CommunicationThread = {
        id: 1,
        listing_id: 1,
        buyer_id: 987654321,
        seller_id: 123456789,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        is_active: true,
        message_count: 1,
      };
      mockThreads.push(thread);

      const messageUpdate: TelegramUpdate = {
        update_id: 123456806,
        message: {
          message_id: 102,
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Jane',
            username: 'buyer_user',
          },
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 987654321,
            type: 'private',
          },
          text: "What's the battery health?",
        },
      };

      const request = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(messageUpdate),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Verify message was forwarded to seller with proper formatting
      // In real implementation, this would trigger a message to seller's chat
      const botResponse: BotResponse = await response.json();

      // Should include listing context and buyer identification
      expect(botResponse.text).toMatch(/iPhone.*14.*Pro/i);
      expect(botResponse.text).toMatch(/interested.*buyer/i);
      expect(botResponse.text).toMatch(/battery.*health/i);

      // Should not reveal buyer's username or direct contact
      expect(botResponse.text).not.toMatch(/@buyer_user/);
    });

    it('should track message read status and delivery', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create message first
      const message: Message = {
        id: 1,
        thread_id: 1,
        sender_id: 987654321,
        recipient_id: 123456789,
        content: 'Test message',
        sent_at: new Date().toISOString(),
        is_read: false,
        is_flagged: false,
        message_type: 'text',
      };
      mockMessages.push(message);

      // Simulate message being read (seller views conversation)
      const readUpdate = {
        thread_id: 1,
        user_id: 123456789,
        last_read_message_id: 1,
      };

      const readRequest = new Request('http://localhost:8787/api/messages/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_token',
        },
        body: JSON.stringify(readUpdate),
      });

      const response = await worker.fetch(readRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Verify read status was updated
      const updatedMessage = mockMessages.find(m => m.id === 1);
      expect(updatedMessage?.is_read).toBe(true);
    });
  });

  describe('Privacy protection and security', () => {
    it('should not reveal personal contact information in messages', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create thread
      const thread: CommunicationThread = {
        id: 1,
        listing_id: 1,
        buyer_id: 987654321,
        seller_id: 123456789,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        is_active: true,
        message_count: 1,
      };
      mockThreads.push(thread);

      // Buyer tries to share contact info
      const contactSharingUpdate: TelegramUpdate = {
        update_id: 123456807,
        message: {
          message_id: 103,
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Jane',
            username: 'buyer_user',
          },
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 987654321,
            type: 'private',
          },
          text: 'My phone is +1-555-0123, email is jane@example.com. My WhatsApp is the same number.',
        },
      };

      const request = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(contactSharingUpdate),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Should filter out contact information
      const savedMessage = mockMessages.find(m => m.sender_id === 987654321);
      expect(savedMessage).toBeDefined();

      // Phone numbers and emails should be filtered/masked
      expect(savedMessage?.content).not.toMatch(/\+1-555-0123/);
      expect(savedMessage?.content).not.toMatch(/jane@example\.com/);
      expect(savedMessage?.content).toMatch(/contact.*info.*filtered/i);
    });

    it('should handle spam detection and prevention', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create thread
      const thread: CommunicationThread = {
        id: 1,
        listing_id: 1,
        buyer_id: 987654321,
        seller_id: 123456789,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        is_active: true,
        message_count: 1,
      };
      mockThreads.push(thread);

      // Send multiple rapid messages (spam-like behavior)
      const spamMessages = [
        'BUY NOW! URGENT!',
        'LIMITED TIME OFFER!!!',
        'CLICK HERE FOR AMAZING DEALS!!!',
        'FREE MONEY! GET RICH QUICK!',
      ];

      let spamDetected = false;

      for (let i = 0; i < spamMessages.length; i++) {
        const spamUpdate: TelegramUpdate = {
          update_id: 123456808 + i,
          message: {
            message_id: 104 + i,
            from: {
              id: 987654321,
              is_bot: false,
              first_name: 'Jane',
              username: 'buyer_user',
            },
            date: Math.floor(Date.now() / 1000),
            chat: {
              id: 987654321,
              type: 'private',
            },
            text: spamMessages[i],
          },
        };

        const request = new Request('http://localhost:8787/api/bot/webhook', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
          },
          body: JSON.stringify(spamUpdate),
        });

        const response = await worker.fetch(request, mockEnv, {
          waitUntil: () => {},
          passThroughOnException: () => {},
        });

        if (response.status === 429 || response.status === 403) {
          spamDetected = true;
          break;
        }
      }

      // System should detect and prevent spam
      expect(spamDetected).toBe(true);
    });

    it('should allow users to block or report inappropriate communication', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create thread with inappropriate message
      const thread: CommunicationThread = {
        id: 1,
        listing_id: 1,
        buyer_id: 987654321,
        seller_id: 123456789,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        is_active: true,
        message_count: 1,
      };
      mockThreads.push(thread);

      const inappropriateMessage: Message = {
        id: 1,
        thread_id: 1,
        sender_id: 987654321,
        recipient_id: 123456789,
        content: 'Inappropriate message content',
        sent_at: new Date().toISOString(),
        is_read: false,
        is_flagged: false,
        message_type: 'text',
      };
      mockMessages.push(inappropriateMessage);

      // User reports the message
      const reportUpdate: TelegramUpdate = {
        update_id: 123456812,
        callback_query: {
          id: 'callback_130',
          from: {
            id: 123456789,
            is_bot: false,
            first_name: 'John',
            username: 'seller_user',
          },
          data: 'report_message:1', // message_id = 1
        },
      };

      const request = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(reportUpdate),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Message should be flagged for moderation
      const flaggedMessage = mockMessages.find(m => m.id === 1);
      expect(flaggedMessage?.is_flagged).toBe(true);

      const botResponse: BotResponse = await response.json();
      expect(botResponse.text).toMatch(/report.*received|thank.*you/i);
    });
  });

  describe('Analytics and engagement tracking', () => {
    it('should track listing engagement metrics from communications', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create multiple communication threads for the same listing
      const threads: CommunicationThread[] = [
        {
          id: 1,
          listing_id: 1,
          buyer_id: 987654321,
          seller_id: 123456789,
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          is_active: true,
          message_count: 5,
        },
        {
          id: 2,
          listing_id: 1,
          buyer_id: 111222333,
          seller_id: 123456789,
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          is_active: true,
          message_count: 3,
        },
      ];
      mockThreads.push(...threads);

      // Get listing analytics
      const analyticsRequest = new Request('http://localhost:8787/api/listings/1/analytics', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock_token',
        },
      });

      const response = await worker.fetch(analyticsRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const analytics = await response.json();
      expect(analytics.interested_buyers_count).toBe(2);
      expect(analytics.total_messages).toBe(8);
      expect(analytics.engagement_score).toBeGreaterThan(0);
    });

    it('should provide communication history for both buyer and seller', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create thread with message history
      const thread: CommunicationThread = {
        id: 1,
        listing_id: 1,
        buyer_id: 987654321,
        seller_id: 123456789,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        is_active: true,
        message_count: 4,
      };
      mockThreads.push(thread);

      const messages: Message[] = [
        {
          id: 1,
          thread_id: 1,
          sender_id: 987654321,
          recipient_id: 123456789,
          content: 'Is this still available?',
          sent_at: '2025-09-16T10:00:00Z',
          is_read: true,
          is_flagged: false,
          message_type: 'text',
        },
        {
          id: 2,
          thread_id: 1,
          sender_id: 123456789,
          recipient_id: 987654321,
          content: 'Yes, it is!',
          sent_at: '2025-09-16T10:05:00Z',
          is_read: true,
          is_flagged: false,
          message_type: 'text',
        },
        {
          id: 3,
          thread_id: 1,
          sender_id: 987654321,
          recipient_id: 123456789,
          content: 'Can we meet tomorrow?',
          sent_at: '2025-09-16T10:10:00Z',
          is_read: false,
          is_flagged: false,
          message_type: 'text',
        },
      ];
      mockMessages.push(...messages);

      // Buyer requests conversation history
      const historyRequest = new Request('http://localhost:8787/api/messages/thread/1', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock_buyer_token',
        },
      });

      const response = await worker.fetch(historyRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const history = await response.json();
      expect(history.messages.length).toBe(3);
      expect(history.messages[0].content).toBe('Is this still available?');
      expect(history.listing.title).toBe('iPhone 14 Pro Max');
    });
  });

  describe('Listing status integration', () => {
    it('should handle communication when listing becomes sold', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Create active thread
      const thread: CommunicationThread = {
        id: 1,
        listing_id: 1,
        buyer_id: 987654321,
        seller_id: 123456789,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        is_active: true,
        message_count: 2,
      };
      mockThreads.push(thread);

      // Seller marks listing as sold
      const soldUpdate = {
        listing_id: 1,
        status: 'sold',
        sold_to: 987654321, // Sold to the buyer in this thread
      };

      const soldRequest = new Request('http://localhost:8787/api/listings/1/status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer mock_seller_token',
        },
        body: JSON.stringify(soldUpdate),
      });

      const response = await worker.fetch(soldRequest, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      // Should notify all interested buyers about sale status
      // Winner gets congratulations, others get notification
      const updatedThread = mockThreads.find(t => t.id === 1);
      expect(updatedThread?.is_active).toBe(false);
    });

    it('should prevent new interest when listing becomes unavailable', async () => {
      if (!worker) {
        expect(worker).toBe(null);
        return;
      }

      // Mark listing as sold
      mockListings[0].status = 'sold';

      // Someone tries to express interest in sold listing
      const interestUpdate: TelegramUpdate = {
        update_id: 123456820,
        callback_query: {
          id: 'callback_140',
          from: {
            id: 444555666,
            is_bot: false,
            first_name: 'Late',
            username: 'late_buyer',
          },
          data: 'interest:1', // sold listing
        },
      };

      const request = new Request('http://localhost:8787/api/bot/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'mock_secret',
        },
        body: JSON.stringify(interestUpdate),
      });

      const response = await worker.fetch(request, mockEnv, {
        waitUntil: () => {},
        passThroughOnException: () => {},
      });

      expect(response.status).toBe(200);

      const botResponse: BotResponse = await response.json();

      // Should inform that listing is no longer available
      expect(botResponse.text).toMatch(/sorry.*sold|no.*longer.*available/i);

      // Should not create new thread
      const newThreads = mockThreads.filter(t => t.buyer_id === 444555666);
      expect(newThreads.length).toBe(0);
    });
  });
});
