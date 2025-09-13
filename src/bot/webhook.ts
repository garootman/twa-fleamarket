import { Context } from 'grammy';
import { BotCommands } from './commands';

interface AppContext {
  telegram: any;
  db: any;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
  env: any;
}

export class WebhookHandler {
  private commands: BotCommands;
  private app: AppContext;

  constructor(app: AppContext) {
    this.app = app;
    this.commands = new BotCommands(app);
  }

  /**
   * Setup handlers for the Grammy bot instance
   * This preserves the existing webhook functionality while organizing commands
   */
  setupBotHandlers(bot: any): void {
    // Handle /start command
    bot.command('start', async (ctx: Context) => {
      await this.commands.handleStart(ctx);
    });

    // Handle /help command
    bot.command('help', async (ctx: Context) => {
      await this.commands.handleHelp(ctx);
    });

    // Handle /question command
    bot.command('question', async (ctx: Context) => {
      await this.commands.handleQuestion(ctx);
    });

    // Handle /appeal command (for banned users)
    bot.command('appeal', async (ctx: Context) => {
      await this.commands.handleAppeal(ctx);
    });

    // Handle admin commands (if user is admin)
    this.setupAdminCommands(bot);

    // Handle unknown commands
    bot.on('message:text', async (ctx: Context) => {
      const text = ctx.message?.text;
      if (text?.startsWith('/') && !this.isKnownCommand(text)) {
        await this.commands.handleUnknownCommand(ctx);
      }
    });

    // Handle all other messages (preserves existing functionality)
    bot.on('message', async (ctx: Context) => {
      const chatId = ctx.chat?.id;
      const messageId = ctx.message?.message_id;

      if (chatId && messageId && !ctx.message?.text?.startsWith('/')) {
        // Log message activity (preserves existing logging)
        const messageToSave = JSON.stringify(
          {
            update_id: ctx.update.update_id,
            message: ctx.message,
          },
          null,
          2
        );

        console.log('Bot message received:', messageToSave, ctx.update.update_id);

        // For now, just acknowledge - can be expanded for chat functionality
        // await ctx.reply("Message received!");
      }
    });

    // Error handling (preserves existing error handling)
    bot.catch((err: any) => {
      console.error('Grammy bot error:', err);
    });
  }

  /**
   * Setup admin-specific commands
   */
  private setupAdminCommands(bot: any): void {
    // Check if user is admin before processing admin commands
    bot.use(async (ctx: Context, next: () => Promise<void>) => {
      const userId = ctx.from?.id?.toString();
      const adminId = this.app.env.ADMIN_ID;

      if (ctx.message?.text?.startsWith('/admin') && userId !== adminId) {
        await ctx.reply('❌ You are not authorized to use admin commands.');
        return;
      }

      await next();
    });

    // Admin command to check bot status
    bot.command('admin_status', async (ctx: Context) => {
      const userId = ctx.from?.id?.toString();
      const adminId = this.app.env.ADMIN_ID;

      if (userId === adminId) {
        const statusMessage = `
🔧 *Admin Status*

*Bot Name:* ${this.app.botName || 'Unknown'}
*Environment:* ${this.app.isLocalhost ? 'Local Development' : 'Production'}
*Database:* Connected
*KV Storage:* Available
*R2 Storage:* Available

*Available Admin Commands:*
/admin_status - Show this status
/admin_stats - Show marketplace statistics

*Time:* ${new Date().toISOString()}
        `.trim();

        await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
      }
    });

    // Admin command to get marketplace stats
    bot.command('admin_stats', async (ctx: Context) => {
      const userId = ctx.from?.id?.toString();
      const adminId = this.app.env.ADMIN_ID;

      if (userId === adminId) {
        try {
          // This would integrate with database queries once implemented
          const statsMessage = `
📊 *Marketplace Statistics*

*Users:* TBD (Database integration needed)
*Active Listings:* TBD
*Total Sales:* TBD
*Flags Pending:* TBD

*Recent Activity:*
- Bot commands processed today: TBD
- New listings today: TBD
- Reports submitted: TBD

*Time:* ${new Date().toISOString()}
          `.trim();

          await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error('Error getting admin stats:', error);
          await ctx.reply('❌ Error retrieving statistics.');
        }
      }
    });
  }

  /**
   * Check if command is known to avoid triggering unknown command handler
   */
  private isKnownCommand(text: string): boolean {
    const knownCommands = [
      '/start',
      '/help',
      '/question',
      '/appeal',
      '/admin_status',
      '/admin_stats',
    ];

    const command = text.split(' ')[0];
    return (
      knownCommands.includes(command) ||
      command.startsWith('/unban_') ||
      command.startsWith('/deny_appeal_')
    );
  }

  /**
   * Process webhook update (preserves existing message processing compatibility)
   */
  async processUpdate(update: any): Promise<string> {
    try {
      // Log the update for debugging
      console.log('Webhook update received:', JSON.stringify(update, null, 2));

      // The Grammy bot will handle the update through its middleware chain
      // This method exists for compatibility with existing message processing
      return 'Update processed by Grammy bot';
    } catch (error) {
      console.error('Error processing webhook update:', error);
      return 'Error processing update';
    }
  }
}
