import { Context, InlineKeyboard } from 'grammy';
import { UserService } from '../../services/user-service';
import { AuthService } from '../../services/auth-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * StartCommand - Telegram Bot /start Command Handler
 *
 * Handles the /start command with comprehensive user onboarding:
 * - User authentication and session management
 * - Welcome message with marketplace introduction
 * - Interactive inline keyboard with navigation options
 * - WebApp integration for marketplace access
 * - Support for both private and group chat contexts
 */

export interface BotContext {
  db: DrizzleD1Database;
  env: any;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
}

export class StartCommand {
  private userService: UserService;
  private authService: AuthService;
  private context: BotContext;

  constructor(context: BotContext) {
    this.context = context;
    this.userService = new UserService(context.db);
    this.authService = new AuthService(context.db, context.env.TELEGRAM_BOT_TOKEN);
  }

  /**
   * Handle /start command
   * Provides welcome message and main navigation options
   */
  async handle(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      const messageId = ctx.message?.message_id;
      const user = ctx.from;

      if (!chatId || !user) {
        console.error('Missing chat ID or user information');
        return;
      }

      // Log command usage for analytics
      console.log('Bot command /start:', {
        user_id: user.id,
        username: user.username,
        chat_id: chatId,
        chat_type: ctx.chat?.type,
        timestamp: new Date().toISOString(),
      });

      // Handle authentication and user creation/update
      const authResult = await this.handleUserAuthentication(user);

      // Check if user is banned
      if (authResult.user?.banned) {
        await this.sendBannedUserMessage(ctx, authResult.user);
        return;
      }

      // Send different messages based on chat type
      if (ctx.chat?.type === 'private') {
        await this.sendPrivateWelcomeMessage(ctx, authResult.isNewUser);
      } else {
        await this.sendGroupWelcomeMessage(ctx);
      }
    } catch (error) {
      console.error('Error handling /start command:', error);
      await this.sendErrorMessage(ctx);
    }
  }

  /**
   * Handle user authentication and creation/update
   */
  private async handleUserAuthentication(user: any): Promise<any> {
    try {
      // Check if user exists
      let existingUser = await this.userService.getUserByTelegramId(user.id.toString());
      let isNewUser = false;

      if (!existingUser) {
        // Create new user
        const userData = {
          telegramId: user.id.toString(),
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          username: user.username || '',
          photoUrl: '',
          languageCode: user.language_code || 'en',
          isBot: false,
          isPremium: user.is_premium || false,
          banned: false,
          banReason: null,
          lastActiveAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        existingUser = await this.userService.createUser(userData);
        isNewUser = true;

        console.log('New user created:', {
          id: existingUser.id,
          telegramId: existingUser.telegramId,
          username: existingUser.username,
        });
      } else {
        // Update existing user information
        const updateData = {
          firstName: user.first_name || existingUser.firstName,
          lastName: user.last_name || existingUser.lastName,
          username: user.username || existingUser.username,
          isPremium: user.is_premium || existingUser.isPremium,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        };

        existingUser = await this.userService.updateUser(existingUser.id, updateData);

        console.log('User updated:', {
          id: existingUser.id,
          telegramId: existingUser.telegramId,
          username: existingUser.username,
        });
      }

      return { user: existingUser, isNewUser };
    } catch (error) {
      console.error('Error in user authentication:', error);
      throw error;
    }
  }

  /**
   * Send welcome message for private chat
   */
  private async sendPrivateWelcomeMessage(ctx: Context, isNewUser?: boolean): Promise<void> {
    const webAppUrl = this.context.isLocalhost
      ? 'https://localhost:5173'
      : `https://${this.context.env.WEBAPP_DOMAIN || 'your-marketplace.com'}`;

    const greeting = isNewUser ? '👋 Welcome to our Marketplace!' : '👋 Welcome back!';

    const welcomeMessage = `
${greeting}

🛍️ **Your Digital Marketplace**
Discover, buy, and sell digital products with ease through our Telegram Web App.

**What you can do:**
• 🔍 Browse thousands of digital products
• 📝 Create and manage your listings
• 💬 Chat directly with buyers/sellers
• ⭐ Rate and review transactions
• 🔔 Get instant notifications

**Getting Started:**
1. Tap "Open Marketplace" below
2. Browse or create your first listing
3. Start buying and selling!

Need help? Use /help or /question to contact support.
    `.trim();

    // Create inline keyboard with navigation options
    const keyboard = new InlineKeyboard()
      .webApp('🛍️ Open Marketplace', webAppUrl)
      .row()
      .text('📚 Help & Guide', 'help_guide')
      .text('💬 Contact Support', 'contact_support')
      .row()
      .text('📊 My Account', 'my_account')
      .text('⚙️ Settings', 'user_settings');

    await ctx.reply(welcomeMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }

  /**
   * Send welcome message for group chat
   */
  private async sendGroupWelcomeMessage(ctx: Context): Promise<void> {
    const groupMessage = `
👋 Hi there! I'm the marketplace bot.

🛍️ **For the full marketplace experience:**
• Message me privately to browse and create listings
• Use /help to see available commands
• Admins can use /question for support

**Quick Commands:**
/start - Get started (works in DM)
/help - Show help information
/question - Contact admin for support
    `.trim();

    const keyboard = new InlineKeyboard().url(
      '💬 Start Private Chat',
      `https://t.me/${this.context.botName}?start=group_referral`
    );

    await ctx.reply(groupMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  }

  /**
   * Send message for banned users
   */
  private async sendBannedUserMessage(ctx: Context, user: any): Promise<void> {
    const banReason = user.banReason || 'Terms of service violation';

    const bannedMessage = `
🚫 **Account Suspended**

Your account has been suspended from the marketplace.

**Reason:** ${banReason}
**Date:** ${user.bannedAt ? new Date(user.bannedAt).toLocaleDateString() : 'N/A'}

**What you can do:**
• Review our Terms of Service
• Submit an appeal using /appeal if you believe this was a mistake
• Contact support with /question for more information

**Appeal Process:**
Type: \`/appeal [your explanation]\`
Example: \`/appeal I believe this ban was issued in error because...\`
    `.trim();

    const keyboard = new InlineKeyboard()
      .text('📝 Submit Appeal', 'submit_appeal')
      .row()
      .text('💬 Contact Support', 'contact_support');

    await ctx.reply(bannedMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  }

  /**
   * Send error message when something goes wrong
   */
  private async sendErrorMessage(ctx: Context): Promise<void> {
    const errorMessage = `
❌ **Oops! Something went wrong**

We're experiencing a temporary issue. Please try again in a few moments.

If the problem persists:
• Use /help for assistance
• Contact support with /question
• Check our status page

**Error Code:** START_CMD_ERROR_${Date.now()}
    `.trim();

    const keyboard = new InlineKeyboard()
      .text('🔄 Try Again', 'retry_start')
      .text('💬 Get Help', 'contact_support');

    await ctx.reply(errorMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  }

  /**
   * Handle callback queries from inline keyboard buttons
   */
  async handleCallback(ctx: Context, data: string): Promise<void> {
    try {
      switch (data) {
        case 'help_guide':
          await this.sendHelpGuide(ctx);
          break;
        case 'contact_support':
          await this.sendContactSupport(ctx);
          break;
        case 'my_account':
          await this.sendMyAccount(ctx);
          break;
        case 'user_settings':
          await this.sendUserSettings(ctx);
          break;
        case 'submit_appeal':
          await this.sendAppealInstructions(ctx);
          break;
        case 'retry_start':
          await this.handle(ctx);
          break;
        default:
          await ctx.answerCallbackQuery('Unknown action');
      }
    } catch (error) {
      console.error('Error handling callback:', error);
      await ctx.answerCallbackQuery('Error processing request');
    }
  }

  /**
   * Send help guide
   */
  private async sendHelpGuide(ctx: Context): Promise<void> {
    const helpMessage = `
📚 **Marketplace Guide**

**For Buyers:**
• Browse categories and search for products
• Read reviews and ratings
• Contact sellers directly
• Make secure purchases

**For Sellers:**
• Create detailed product listings
• Upload high-quality images
• Set competitive prices
• Respond to buyer inquiries

**Tips for Success:**
• Use clear, honest descriptions
• Respond quickly to messages
• Maintain a good rating
• Follow marketplace guidelines

Type /help for more commands!
    `.trim();

    await ctx.editMessageText(helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('← Back to Start', 'back_to_start'),
    });
  }

  /**
   * Send contact support options
   */
  private async sendContactSupport(ctx: Context): Promise<void> {
    const supportMessage = `
💬 **Contact Support**

Need help? Our support team is here for you!

**How to get help:**
1. Use /question followed by your message
2. Be specific about your issue
3. Include relevant details (listing ID, error messages, etc.)

**Response Time:**
• General questions: Within 24 hours
• Technical issues: Within 12 hours
• Urgent matters: Within 4 hours

**Example:**
\`/question I can't upload images to my listing. Getting error code 123.\`

Our team will respond directly to you!
    `.trim();

    await ctx.editMessageText(supportMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('← Back to Start', 'back_to_start'),
    });
  }

  /**
   * Send account information
   */
  private async sendMyAccount(ctx: Context): Promise<void> {
    try {
      const user = await this.userService.getUserByTelegramId(ctx.from?.id?.toString() || '');

      if (!user) {
        await ctx.answerCallbackQuery('User not found');
        return;
      }

      const accountMessage = `
📊 **My Account**

**Profile Information:**
• Name: ${user.firstName} ${user.lastName || ''}
• Username: @${user.username || 'not set'}
• Member since: ${new Date(user.createdAt).toLocaleDateString()}
• Status: ${user.banned ? '🚫 Suspended' : '✅ Active'}

**Marketplace Stats:**
• Active listings: Loading...
• Total sales: Loading...
• Rating: Loading...
• Reviews: Loading...

**Account Level:** ${user.isPremium ? '⭐ Premium' : '🆓 Standard'}

Open the marketplace to see detailed statistics!
      `.trim();

      await ctx.editMessageText(accountMessage, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .webApp(
            '📊 View Full Stats',
            `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/profile`
          )
          .row()
          .text('← Back to Start', 'back_to_start'),
      });
    } catch (error) {
      console.error('Error getting account info:', error);
      await ctx.answerCallbackQuery('Error loading account information');
    }
  }

  /**
   * Send user settings
   */
  private async sendUserSettings(ctx: Context): Promise<void> {
    const settingsMessage = `
⚙️ **Settings**

**Notification Preferences:**
• 🔔 New messages: Enabled
• 📝 Listing updates: Enabled
• 💰 Payment notifications: Enabled
• 📊 Weekly reports: Disabled

**Privacy Settings:**
• Profile visibility: Public
• Contact preferences: Telegram only
• Show online status: Yes

**Language:** English (EN)

**Note:** Advanced settings are available in the web app.
    `.trim();

    await ctx.editMessageText(settingsMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .webApp(
          '⚙️ Advanced Settings',
          `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/settings`
        )
        .row()
        .text('← Back to Start', 'back_to_start'),
    });
  }

  /**
   * Send appeal instructions
   */
  private async sendAppealInstructions(ctx: Context): Promise<void> {
    const appealMessage = `
📝 **Submit Appeal**

To appeal your account suspension:

**Format:**
\`/appeal [Your detailed explanation]\`

**Include:**
• Why you believe the ban was incorrect
• Any relevant context or evidence
• Your commitment to follow guidelines

**Example:**
\`/appeal I was banned for spam, but I only posted one legitimate listing for my digital artwork. I believe this was flagged by mistake as I followed all posting guidelines.\`

**Review Process:**
• Appeals are reviewed within 48 hours
• You'll receive a response via this chat
• Decision will include detailed explanation

**Note:** Only submit appeals if you genuinely believe there was an error.
    `.trim();

    await ctx.editMessageText(appealMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('← Back to Start', 'back_to_start'),
    });
  }
}
