import { Bot, webhookCallback, Context } from 'grammy';
import { MessageSender } from './messageSender';
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
}

export class GrammyBotWrapper {
  private bot: Bot;
  private webhookHandler: (request: Request) => Promise<Response>;
  private app: AppContext;

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
    this.setupHandlers();
    this.webhookHandler = webhookCallback(this.bot, 'cloudflare-mod');
  }

  private setupHandlers() {
    const messageSender = new MessageSender(this.app, this.app.telegram);

    // Handle /start command
    this.bot.command('start', async (ctx: Context) => {
      const chatId = ctx.chat?.id;
      const messageId = ctx.message?.message_id;

      if (chatId && messageId) {
        // Save message to database (compatible with existing structure)
        const messageToSave = JSON.stringify(
          {
            update_id: ctx.update.update_id,
            message: ctx.message,
          },
          null,
          2
        );

        // Message logging has been removed - using console instead
        console.log('Grammy bot message:', messageToSave, ctx.update.update_id);

        // Send greeting using existing MessageSender
        await messageSender.sendGreeting(chatId, messageId);
      }
    });

    // Handle all other messages (for future expansion)
    this.bot.on('message', async (ctx: Context) => {
      const chatId = ctx.chat?.id;
      const messageId = ctx.message?.message_id;

      if (chatId && messageId && !ctx.message?.text?.startsWith('/')) {
        // Save message to database
        const messageToSave = JSON.stringify(
          {
            update_id: ctx.update.update_id,
            message: ctx.message,
          },
          null,
          2
        );

        // Message logging has been removed - using console instead
        console.log('Grammy bot message:', messageToSave, ctx.update.update_id);

        // For now, just acknowledge - can be expanded later
        // await ctx.reply("Message received!");
      }
    });

    // Error handling
    this.bot.catch(err => {
      console.error('grammY bot error:', err);
    });
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
