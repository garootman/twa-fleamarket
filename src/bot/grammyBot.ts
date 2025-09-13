import { Bot, webhookCallback } from 'grammy';
import { WebhookHandler } from './webhook';
import { Database } from '../db/index';

// interface Env {
//   TELEGRAM_BOT_TOKEN: string;
//   TELEGRAM_USE_TEST_API?: string;
//   DB: D1Database;
// }

interface AppContext {
  telegram: any;
  db: Database;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
  env: any;
}

export class GrammyBotWrapper {
  private bot: Bot;
  private webhookHandler: (request: Request) => Promise<Response>;
  private app: AppContext;
  private botWebhookHandler: WebhookHandler;

  constructor(token: string, app: AppContext, useTestApi?: string) {
    // Initialize grammY bot
    const config = useTestApi
      ? {
          client: {
            baseFetchConfig: {
              baseUrl: 'https://api.telegram.org',
            },
          },
        }
      : undefined;

    this.bot = new Bot(token, config);

    this.app = app;
    this.botWebhookHandler = new WebhookHandler(app);
    this.setupHandlers();
    this.webhookHandler = webhookCallback(this.bot, 'cloudflare-mod');
  }

  private setupHandlers() {
    // Use the new organized webhook handler to setup all bot commands and handlers
    this.botWebhookHandler.setupBotHandlers(this.bot);
  }

  // Handle webhook requests (compatible with existing Cloudflare Workers setup)
  async handleWebhook(request: Request): Promise<Response> {
    return await this.webhookHandler(request);
  }

  // Set webhook (compatible with existing setup)
  async setWebhook(url: string, secretToken?: string): Promise<any> {
    try {
      const options: any = {
        drop_pending_updates: true,
      };
      if (secretToken) {
        options.secret_token = secretToken;
      }
      await this.bot.api.setWebhook(url, options);
      return { ok: true, description: 'Webhook set successfully' };
    } catch (error) {
      console.error('Failed to set webhook:', error);
      return { ok: false, description: 'Failed to set webhook' };
    }
  }

  // Get bot info (compatible with existing getMe functionality)
  async getMe(): Promise<any> {
    try {
      const me = await this.bot.api.getMe();
      return { ok: true, result: me };
    } catch (error) {
      console.error('Failed to get bot info:', error);
      return { ok: false, description: 'Failed to get bot info' };
    }
  }
}
