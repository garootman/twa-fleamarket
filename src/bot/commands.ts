import { Context } from 'grammy';
import { MessageSender } from './messageSender';
import { Database } from '../db/index';

interface AppContext {
  telegram: any;
  db: Database;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
  env: any;
}

export class BotCommands {
  private messageSender: MessageSender;
  private app: AppContext;

  constructor(app: AppContext) {
    this.app = app;
    this.messageSender = new MessageSender(app, app.telegram);
  }

  /**
   * Handle /start command
   * Shows welcome message and main navigation options
   */
  async handleStart(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const messageId = ctx.message?.message_id;

    if (chatId && messageId) {
      // Log the command usage
      console.log('Bot command /start:', {
        user_id: ctx.from?.id,
        username: ctx.from?.username,
        chat_id: chatId,
        timestamp: new Date().toISOString(),
      });

      // Send greeting using existing MessageSender
      await this.messageSender.sendGreeting(chatId, messageId);
    }
  }

  /**
   * Handle /help command
   * Shows comprehensive command list and usage information
   */
  async handleHelp(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const messageId = ctx.message?.message_id;

    if (chatId && messageId) {
      console.log('Bot command /help:', {
        user_id: ctx.from?.id,
        username: ctx.from?.username,
        chat_id: chatId,
        timestamp: new Date().toISOString(),
      });

      const helpMessage = `
🔸 *Marketplace Bot Help* 🔸

*Available Commands:*
/start - Welcome message and get started
/help - Show this help message
/question - Contact admin for support

*How to use:*
• Browse and search listings in the web app
• Create listings by visiting our website
• Contact sellers directly through Telegram
• Report issues using /question command

*Web App:* Use the menu button to open our marketplace!

*Need help?* Use /question to contact our admin team.
      `.trim();

      await this.app.telegram.sendMessage(chatId, helpMessage, {
        reply_to_message_id: messageId,
        parse_mode: 'Markdown',
      });
    }
  }

  /**
   * Handle /question command
   * Allows users to contact admin for support
   */
  async handleQuestion(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const messageId = ctx.message?.message_id;

    if (chatId && messageId) {
      console.log('Bot command /question:', {
        user_id: ctx.from?.id,
        username: ctx.from?.username,
        chat_id: chatId,
        timestamp: new Date().toISOString(),
      });

      const questionMessage = `
💬 *Contact Admin*

To ask a question or report an issue:
1. Send your message after this command
2. Include details about your problem
3. Our admin will respond as soon as possible

*Example:*
/question I'm having trouble uploading images to my listing

*Admin Response:* We'll get back to you within 24 hours!
      `.trim();

      await this.app.telegram.sendMessage(chatId, questionMessage, {
        reply_to_message_id: messageId,
        parse_mode: 'Markdown',
      });

      // If there's text after /question, forward it to admin
      const messageText = ctx.message?.text || '';
      const questionText = messageText.replace('/question', '').trim();

      if (questionText) {
        await this.forwardToAdmin(ctx, questionText);
      }
    }
  }

  /**
   * Handle appeal submissions (for banned users)
   * Allows users to submit appeals for moderation actions
   */
  async handleAppeal(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const messageId = ctx.message?.message_id;

    if (chatId && messageId) {
      console.log('Bot command /appeal:', {
        user_id: ctx.from?.id,
        username: ctx.from?.username,
        chat_id: chatId,
        timestamp: new Date().toISOString(),
      });

      const appealMessage = `
⚖️ *Submit Appeal*

If you believe you were banned unfairly:
1. Send your appeal message after this command
2. Explain why you think the ban was incorrect
3. Be respectful and provide details
4. Our admin will review your case

*Example:*
/appeal I was banned for spam but I only posted one listing. I think this was a mistake.

*Note:* Only submit appeals if you believe there was an error.
      `.trim();

      await this.app.telegram.sendMessage(chatId, appealMessage, {
        reply_to_message_id: messageId,
        parse_mode: 'Markdown',
      });

      // If there's text after /appeal, process it as an appeal
      const messageText = ctx.message?.text || '';
      const appealText = messageText.replace('/appeal', '').trim();

      if (appealText) {
        await this.submitAppeal(ctx, appealText);
      }
    }
  }

  /**
   * Forward user question to admin
   */
  private async forwardToAdmin(ctx: Context, questionText: string): Promise<void> {
    try {
      // Get admin ID from environment
      const adminId = this.app.env.ADMIN_ID;
      if (!adminId) {
        console.warn('ADMIN_ID not set - cannot forward question to admin');
        return;
      }

      const userInfo = ctx.from;
      const forwardMessage = `
🔔 *New User Question*

*From:* ${userInfo?.first_name || 'Unknown'} ${userInfo?.last_name || ''} (@${userInfo?.username || 'no username'})
*User ID:* ${userInfo?.id}
*Question:* ${questionText}

*Time:* ${new Date().toISOString()}
      `.trim();

      await this.app.telegram.sendMessage(adminId, forwardMessage, {
        parse_mode: 'Markdown',
      });

      // Confirm to user
      await this.app.telegram.sendMessage(
        ctx.chat!.id,
        '✅ Your question has been sent to our admin team. They will respond soon!',
        { reply_to_message_id: ctx.message?.message_id }
      );
    } catch (error) {
      console.error('Failed to forward question to admin:', error);
      await this.app.telegram.sendMessage(
        ctx.chat!.id,
        '❌ Sorry, there was an error sending your question. Please try again later.',
        { reply_to_message_id: ctx.message?.message_id }
      );
    }
  }

  /**
   * Submit user appeal for banned account
   */
  private async submitAppeal(ctx: Context, appealText: string): Promise<void> {
    try {
      // Get admin ID from environment
      const adminId = this.app.env.ADMIN_ID;
      if (!adminId) {
        console.warn('ADMIN_ID not set - cannot submit appeal to admin');
        return;
      }

      const userInfo = ctx.from;
      const appealMessage = `
⚖️ *New User Appeal*

*From:* ${userInfo?.first_name || 'Unknown'} ${userInfo?.last_name || ''} (@${userInfo?.username || 'no username'})
*User ID:* ${userInfo?.id}
*Appeal:* ${appealText}

*Time:* ${new Date().toISOString()}

*Admin Actions:*
/unban_${userInfo?.id} - Unban this user
/deny_appeal_${userInfo?.id} - Deny this appeal
      `.trim();

      await this.app.telegram.sendMessage(adminId, appealMessage, {
        parse_mode: 'Markdown',
      });

      // Confirm to user
      await this.app.telegram.sendMessage(
        ctx.chat!.id,
        '✅ Your appeal has been submitted. Our admin will review it and respond within 48 hours.',
        { reply_to_message_id: ctx.message?.message_id }
      );
    } catch (error) {
      console.error('Failed to submit appeal:', error);
      await this.app.telegram.sendMessage(
        ctx.chat!.id,
        '❌ Sorry, there was an error submitting your appeal. Please try again later.',
        { reply_to_message_id: ctx.message?.message_id }
      );
    }
  }

  /**
   * Handle unknown commands
   */
  async handleUnknownCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const messageId = ctx.message?.message_id;

    if (chatId && messageId) {
      const unknownMessage = `
❓ *Unknown Command*

I don't recognize that command. Here are the available commands:

/start - Get started with the marketplace
/help - Show all commands and help
/question - Contact admin for support

Type /help to see more information!
      `.trim();

      await this.app.telegram.sendMessage(chatId, unknownMessage, {
        reply_to_message_id: messageId,
        parse_mode: 'Markdown',
      });
    }
  }

  /**
   * Save message activity for logging (preserves existing functionality)
   */
  private logMessage(ctx: Context, command: string): void {
    const messageToSave = JSON.stringify(
      {
        update_id: ctx.update.update_id,
        message: ctx.message,
        command: command,
      },
      null,
      2
    );

    console.log(`Bot command ${command}:`, messageToSave, ctx.update.update_id);
  }
}
