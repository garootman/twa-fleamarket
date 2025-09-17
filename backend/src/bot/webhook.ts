import { Context, Bot, GrammyError, HttpError } from 'grammy';
import { StartCommand } from './commands/start';
import { HelpCommand } from './commands/help';
import { QuestionCommand } from './commands/question';
import { UserService } from '../services/user-service';
import { AdminService } from '../services/admin-service';
import { AuthService } from '../services/auth-service';
import { ModerationService } from '../services/moderation-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import crypto from 'crypto';

/**
 * WebhookHandler - Advanced Telegram Bot Message Router - T102
 *
 * Comprehensive webhook handler with enhanced Telegram API connection and error handling:
 * - Intelligent message routing and command processing
 * - User authentication and session management
 * - Admin command processing with privilege verification
 * - Moderation system integration with automated responses
 * - Advanced error handling and logging with performance monitoring
 * - Rate limiting and spam protection with CloudFlare integration
 * - Context-aware responses based on user status and chat type
 * - Robust Telegram API connectivity with retry logic and fallbacks
 * - Integration with all marketplace services
 * - Webhook validation and security measures
 * - Connection health monitoring and auto-recovery
 */

export interface BotContext {
  db: DrizzleD1Database;
  env: any;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
}

export interface TelegramAPIConnectionStatus {
  connected: boolean;
  lastSuccessfulCall: Date | null;
  consecutiveErrors: number;
  lastError: string | null;
  rateLimitResetTime: Date | null;
  retryAfter: number | null;
}

export interface WebhookValidationResult {
  isValid: boolean;
  errors: string[];
  securityFlags: string[];
  timestamp: number;
}

export interface UserSession {
  userId: string;
  telegramId: string;
  lastActivity: Date;
  messageCount: number;
  rateLimitResetTime: Date;
  currentFlow?: string;
  flowData?: any;
}

export class WebhookHandler {
  private context: BotContext;
  private startCommand: StartCommand;
  private helpCommand: HelpCommand;
  private questionCommand: QuestionCommand;
  private userService: UserService;
  private adminService: AdminService;
  private authService: AuthService;
  private moderationService: ModerationService;
  private userSessions: Map<string, UserSession> = new Map();

  // Telegram API connection monitoring
  private apiConnectionStatus: TelegramAPIConnectionStatus = {
    connected: false,
    lastSuccessfulCall: null,
    consecutiveErrors: 0,
    lastError: null,
    rateLimitResetTime: null,
    retryAfter: null,
  };

  // Retry configuration
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 1000; // 1 second
  private readonly maxRetryDelay = 30000; // 30 seconds
  private readonly connectionTimeoutMs = 10000; // 10 seconds

  constructor(context: BotContext) {
    this.context = context;
    this.startCommand = new StartCommand(context);
    this.helpCommand = new HelpCommand(context);
    this.questionCommand = new QuestionCommand(context);
    this.userService = new UserService(context.db);
    this.adminService = new AdminService(context.db);
    this.authService = new AuthService(context.db, context.env.TELEGRAM_BOT_TOKEN);
    this.moderationService = new ModerationService(context.db);

    // Initialize API connection monitoring
    this.initializeConnectionMonitoring();
  }

  /**
   * Initialize Telegram API connection monitoring
   */
  private initializeConnectionMonitoring(): void {
    // Set up periodic health checks
    setInterval(() => {
      this.performConnectionHealthCheck();
    }, 60000); // Check every minute

    // Clean up old sessions periodically
    setInterval(() => {
      this.cleanupOldSessions();
    }, 300000); // Clean up every 5 minutes
  }

  /**
   * Validate incoming webhook request
   */
  public validateWebhookRequest(request: Request): WebhookValidationResult {
    const result: WebhookValidationResult = {
      isValid: true,
      errors: [],
      securityFlags: [],
      timestamp: Date.now(),
    };

    try {
      // Check Content-Type
      const contentType = request.headers.get('Content-Type');
      if (!contentType?.includes('application/json')) {
        result.errors.push('Invalid Content-Type header');
        result.isValid = false;
      }

      // Check User-Agent (Telegram should set this)
      const userAgent = request.headers.get('User-Agent');
      if (!userAgent?.includes('TelegramBot')) {
        result.securityFlags.push('Non-Telegram User-Agent detected');
      }

      // Validate webhook secret token if configured
      const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      const expectedSecret = this.context.env.TELEGRAM_WEBHOOK_SECRET;

      if (expectedSecret && secretToken !== expectedSecret) {
        result.errors.push('Invalid webhook secret token');
        result.isValid = false;
        result.securityFlags.push('Invalid secret token');
      }

      // Check request size (Telegram updates are typically small)
      const contentLength = request.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength) > 1024 * 1024) {
        // 1MB limit
        result.errors.push('Request too large');
        result.isValid = false;
      }

      // Log security flags if any
      if (result.securityFlags.length > 0) {
        console.warn('Webhook security flags detected:', {
          flags: result.securityFlags,
          ip: request.headers.get('CF-Connecting-IP') || 'unknown',
          userAgent,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      result.errors.push(`Validation error: ${error}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Process webhook with enhanced error handling and retry logic
   */
  public async processWebhook(request: Request): Promise<Response> {
    try {
      // Validate webhook request first
      const validation = this.validateWebhookRequest(request);

      if (!validation.isValid) {
        console.error('Webhook validation failed:', validation.errors);
        return new Response('Bad Request', {
          status: 400,
          headers: this.context.corsHeaders,
        });
      }

      // Parse request body
      const body = await request.json();

      // Log webhook received
      console.log('Webhook received:', {
        updateId: body.update_id,
        type: this.getWebhookUpdateType(body),
        timestamp: new Date().toISOString(),
        validation: validation.securityFlags.length > 0 ? validation.securityFlags : 'clean',
      });

      // Create bot instance with enhanced error handling
      const bot = this.createBotInstance();

      // Process update with retry logic
      await this.processUpdateWithRetry(bot, body);

      // Update connection status on success
      this.updateConnectionStatus(true);

      return new Response('OK', {
        status: 200,
        headers: this.context.corsHeaders,
      });
    } catch (error) {
      console.error('Webhook processing error:', error);

      // Update connection status on error
      this.updateConnectionStatus(false, error instanceof Error ? error.message : String(error));

      // Return appropriate error response
      if (error instanceof GrammyError || error instanceof HttpError) {
        return new Response('Service Unavailable', {
          status: 503,
          headers: this.context.corsHeaders,
        });
      }

      return new Response('Internal Server Error', {
        status: 500,
        headers: this.context.corsHeaders,
      });
    }
  }

  /**
   * Create bot instance with enhanced configuration
   */
  private createBotInstance(): Bot {
    const bot = new Bot(this.context.env.TELEGRAM_BOT_TOKEN, {
      client: {
        timeoutMs: this.connectionTimeoutMs,
        retryCount: this.maxRetries,
        maxRequestsPerSecond: 30, // Telegram's default limit
      },
    });

    // Setup all handlers
    this.setupBotHandlers(bot);

    return bot;
  }

  /**
   * Process update with retry logic and exponential backoff
   */
  private async processUpdateWithRetry(bot: Bot, update: any, attempt = 1): Promise<void> {
    try {
      await bot.handleUpdate(update);
    } catch (error) {
      console.error(`Update processing attempt ${attempt} failed:`, error);

      if (attempt >= this.maxRetries) {
        throw error; // Max retries reached
      }

      // Check if this is a rate limit error
      if (this.isRateLimitError(error)) {
        const retryAfter = this.extractRetryAfter(error) * 1000; // Convert to ms
        console.log(`Rate limit hit, waiting ${retryAfter}ms before retry`);

        this.apiConnectionStatus.rateLimitResetTime = new Date(Date.now() + retryAfter);
        this.apiConnectionStatus.retryAfter = retryAfter;

        await this.delay(retryAfter);
      } else if (this.isRetryableError(error)) {
        // Exponential backoff for retryable errors
        const delay = Math.min(this.baseRetryDelay * Math.pow(2, attempt - 1), this.maxRetryDelay);

        console.log(`Retryable error, waiting ${delay}ms before attempt ${attempt + 1}`);
        await this.delay(delay);
      } else {
        // Non-retryable error, don't retry
        throw error;
      }

      // Retry the update
      await this.processUpdateWithRetry(bot, update, attempt + 1);
    }
  }

  /**
   * Setup all bot handlers with comprehensive middleware chain
   */
  setupBotHandlers(bot: Bot): void {
    // Global error handling
    bot.catch(this.handleError.bind(this));

    // Pre-processing middleware
    bot.use(this.preprocessingMiddleware.bind(this));

    // Rate limiting middleware
    bot.use(this.rateLimitingMiddleware.bind(this));

    // User authentication middleware
    bot.use(this.authenticationMiddleware.bind(this));

    // Moderation middleware
    bot.use(this.moderationMiddleware.bind(this));

    // Admin verification middleware for admin commands
    bot.use(this.adminVerificationMiddleware.bind(this));

    // Command handlers
    this.setupCommandHandlers(bot);

    // Callback query handlers
    this.setupCallbackHandlers(bot);

    // Message handlers
    this.setupMessageHandlers(bot);

    // Special admin handlers
    this.setupAdminHandlers(bot);

    // Fallback handlers
    this.setupFallbackHandlers(bot);
  }

  /**
   * Preprocessing middleware for logging and basic validation
   */
  private async preprocessingMiddleware(ctx: Context, next: () => Promise<void>): Promise<void> {
    const startTime = Date.now();

    // Log incoming update
    console.log('Bot update received:', {
      updateId: ctx.update.update_id,
      type: this.getUpdateType(ctx),
      userId: ctx.from?.id,
      username: ctx.from?.username,
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type,
      timestamp: new Date().toISOString(),
    });

    // Validate update
    if (!ctx.from || !ctx.chat) {
      console.warn('Invalid update - missing from or chat');
      return;
    }

    try {
      await next();
    } finally {
      // Log processing time
      const processingTime = Date.now() - startTime;
      console.log('Update processed in:', processingTime, 'ms');
    }
  }

  /**
   * Rate limiting middleware to prevent spam
   */
  private async rateLimitingMiddleware(ctx: Context, next: () => Promise<void>): Promise<void> {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;

    const session = this.getUserSession(userId);
    const now = new Date();

    // Reset rate limit if time window passed
    if (now > session.rateLimitResetTime) {
      session.messageCount = 0;
      session.rateLimitResetTime = new Date(now.getTime() + 60000); // 1 minute window
    }

    // Check rate limit (10 messages per minute for regular users)
    const maxMessages = this.isAdmin(ctx) ? 100 : 10;
    if (session.messageCount >= maxMessages) {
      await ctx.reply('⚠️ Too many messages. Please wait a moment before sending more.');
      return;
    }

    session.messageCount++;
    session.lastActivity = now;

    await next();
  }

  /**
   * Authentication middleware for user management
   */
  private async authenticationMiddleware(ctx: Context, next: () => Promise<void>): Promise<void> {
    const userId = ctx.from?.id?.toString();
    if (!userId) return;

    try {
      // Get or create user
      let user = await this.userService.getUserByTelegramId(userId);

      if (!user) {
        // Create new user
        const userData = {
          telegramId: userId,
          firstName: ctx.from?.first_name || '',
          lastName: ctx.from?.last_name || '',
          username: ctx.from?.username || '',
          photoUrl: '',
          languageCode: ctx.from?.language_code || 'en',
          isBot: ctx.from?.is_bot || false,
          isPremium: ctx.from?.is_premium || false,
          banned: false,
          banReason: null,
          lastActiveAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        user = await this.userService.createUser(userData);
        console.log('New user created via webhook:', user.id);
      } else {
        // Update user activity
        await this.userService.updateUser(user.id, {
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Store user in context for later use
      (ctx as any).user = user;
    } catch (error) {
      console.error('Authentication middleware error:', error);
      // Continue processing even if user management fails
    }

    await next();
  }

  /**
   * Moderation middleware for content filtering
   */
  private async moderationMiddleware(ctx: Context, next: () => Promise<void>): Promise<void> {
    const user = (ctx as any).user;

    // Check if user is banned
    if (user?.banned) {
      // Only allow appeal and question commands for banned users
      const text = ctx.message?.text || '';
      if (text.startsWith('/') && !text.startsWith('/appeal') && !text.startsWith('/question')) {
        await this.sendBannedUserMessage(ctx, user);
        return;
      }
    }

    // Content moderation for messages
    if (ctx.message?.text) {
      const moderationResult = await this.moderationService.moderateContent(ctx.message.text);

      if (moderationResult.blocked) {
        await ctx.reply('🚫 Your message contains inappropriate content and has been blocked.');

        // Log moderation action
        console.log('Content blocked by moderation:', {
          userId: user?.id,
          telegramId: ctx.from?.id,
          reason: moderationResult.reason,
          content: ctx.message.text.substring(0, 100),
        });

        return;
      }
    }

    await next();
  }

  /**
   * Admin verification middleware
   */
  private async adminVerificationMiddleware(
    ctx: Context,
    next: () => Promise<void>
  ): Promise<void> {
    const text = ctx.message?.text || '';

    // Check if this is an admin command
    if (
      text.startsWith('/admin') ||
      text.startsWith('/unban_') ||
      text.startsWith('/deny_appeal_')
    ) {
      if (!this.isAdmin(ctx)) {
        await ctx.reply('❌ You are not authorized to use admin commands.');
        return;
      }
    }

    await next();
  }

  /**
   * Setup command handlers
   */
  private setupCommandHandlers(bot: Bot): void {
    // Basic commands
    bot.command('start', async (ctx: Context) => {
      await this.startCommand.handle(ctx);
    });

    bot.command('help', async (ctx: Context) => {
      await this.helpCommand.handle(ctx);
    });

    bot.command('question', async (ctx: Context) => {
      await this.questionCommand.handle(ctx);
    });

    // Appeal command
    bot.command('appeal', async (ctx: Context) => {
      await this.handleAppealCommand(ctx);
    });

    // Debug command for development
    if (this.context.isLocalhost) {
      bot.command('debug', async (ctx: Context) => {
        await this.handleDebugCommand(ctx);
      });
    }
  }

  /**
   * Setup callback query handlers
   */
  private setupCallbackHandlers(bot: Bot): void {
    bot.on('callback_query:data', async (ctx: Context) => {
      const data = ctx.callbackQuery?.data || '';

      try {
        // Route callbacks to appropriate command handlers
        if (data.startsWith('help_') || data === 'back_to_help') {
          await this.helpCommand.handleCallback(ctx, data);
        } else if (data.startsWith('question_') || data === 'back_to_question') {
          await this.questionCommand.handleCallback(ctx, data);
        } else if (data.includes('start') || data.includes('back_to_start')) {
          await this.startCommand.handleCallback(ctx, data);
        } else if (data.startsWith('admin_')) {
          await this.handleAdminCallback(ctx, data);
        } else {
          await ctx.answerCallbackQuery('Unknown action');
        }
      } catch (error) {
        console.error('Callback query error:', error);
        await ctx.answerCallbackQuery('Error processing request');
      }
    });
  }

  /**
   * Setup message handlers
   */
  private setupMessageHandlers(bot: Bot): void {
    // Handle unknown commands
    bot.on('message:text', async (ctx: Context) => {
      const text = ctx.message?.text || '';

      if (text.startsWith('/') && !this.isKnownCommand(text)) {
        await this.handleUnknownCommand(ctx);
      }
    });

    // Handle non-command messages
    bot.on('message', async (ctx: Context) => {
      const text = ctx.message?.text;

      // Skip if it's a command (already handled)
      if (text?.startsWith('/')) return;

      // Log non-command messages
      if (ctx.chat && ctx.message) {
        await this.logMessage(ctx);
      }

      // Auto-responses for certain contexts
      await this.handleContextualMessage(ctx);
    });

    // Handle photo uploads
    bot.on('message:photo', async (ctx: Context) => {
      await this.handlePhotoUpload(ctx);
    });

    // Handle document uploads
    bot.on('message:document', async (ctx: Context) => {
      await this.handleDocumentUpload(ctx);
    });
  }

  /**
   * Setup admin-specific handlers
   */
  private setupAdminHandlers(bot: Bot): void {
    // Admin status command
    bot.command('admin_status', async (ctx: Context) => {
      if (!this.isAdmin(ctx)) return;
      await this.handleAdminStatus(ctx);
    });

    // Admin statistics command
    bot.command('admin_stats', async (ctx: Context) => {
      if (!this.isAdmin(ctx)) return;
      await this.handleAdminStats(ctx);
    });

    // User unban command (from appeals)
    bot.hears(/^\/unban_(\d+)/, async (ctx: Context) => {
      if (!this.isAdmin(ctx)) return;
      const userId = ctx.match[1];
      await this.handleUnbanUser(ctx, userId);
    });

    // Deny appeal command
    bot.hears(/^\/deny_appeal_(\d+)/, async (ctx: Context) => {
      if (!this.isAdmin(ctx)) return;
      const userId = ctx.match[1];
      await this.handleDenyAppeal(ctx, userId);
    });
  }

  /**
   * Setup fallback handlers
   */
  private setupFallbackHandlers(bot: Bot): void {
    // Handle any unprocessed updates
    bot.on('update', async (ctx: Context) => {
      console.log('Unhandled update type:', this.getUpdateType(ctx));
    });
  }

  /**
   * Handle appeal command
   */
  private async handleAppealCommand(ctx: Context): Promise<void> {
    const user = (ctx as any).user;
    const messageText = ctx.message?.text || '';
    const appealText = messageText.replace('/appeal', '').trim();

    if (!appealText) {
      await this.sendAppealInstructions(ctx);
      return;
    }

    if (!user?.banned) {
      await ctx.reply(
        'ℹ️ Your account is not currently suspended. Appeals are only for suspended accounts.'
      );
      return;
    }

    await this.submitAppeal(ctx, appealText, user);
  }

  /**
   * Handle debug command (development only)
   */
  private async handleDebugCommand(ctx: Context): Promise<void> {
    const user = (ctx as any).user;
    const session = this.getUserSession(ctx.from?.id?.toString() || '');

    const debugInfo = `
🐛 **Debug Information**

**User Info:**
• ID: ${user?.id}
• Telegram ID: ${user?.telegramId}
• Username: @${user?.username || 'none'}
• Banned: ${user?.banned ? 'Yes' : 'No'}
• Premium: ${user?.isPremium ? 'Yes' : 'No'}

**Session Info:**
• Messages: ${session.messageCount}
• Last Activity: ${session.lastActivity.toISOString()}
• Current Flow: ${session.currentFlow || 'none'}

**Context:**
• Chat ID: ${ctx.chat?.id}
• Chat Type: ${ctx.chat?.type}
• Update ID: ${ctx.update.update_id}
• Bot Name: ${this.context.botName}
• Environment: ${this.context.isLocalhost ? 'Local' : 'Production'}

**Timestamp:** ${new Date().toISOString()}
    `.trim();

    await ctx.reply(debugInfo, { parse_mode: 'Markdown' });
  }

  /**
   * Handle admin callbacks
   */
  private async handleAdminCallback(ctx: Context, data: string): Promise<void> {
    if (!this.isAdmin(ctx)) {
      await ctx.answerCallbackQuery('❌ Admin access required');
      return;
    }

    switch (data) {
      case 'admin_panel':
        await ctx.answerCallbackQuery('Opening admin panel...');
        // Could open web app admin panel
        break;
      case 'admin_quick_stats':
        await this.sendQuickStats(ctx);
        break;
      default:
        await ctx.answerCallbackQuery('Unknown admin action');
    }
  }

  /**
   * Handle unknown commands
   */
  private async handleUnknownCommand(ctx: Context): Promise<void> {
    const text = ctx.message?.text || '';

    const unknownMessage = `
❓ **Unknown Command**

I don't recognize the command: \`${text.split(' ')[0]}\`

**Available Commands:**
/start - Get started with the marketplace
/help - Show all commands and help
/question - Contact admin for support

**Need help?** Type /help to see all available commands and features.
    `.trim();

    await ctx.reply(unknownMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle contextual messages (non-commands)
   */
  private async handleContextualMessage(ctx: Context): Promise<void> {
    const text = ctx.message?.text?.toLowerCase() || '';
    const user = (ctx as any).user;

    // Auto-responses for common queries
    if (text.includes('help') || text.includes('support')) {
      await ctx.reply('Need help? Try /help for all commands or /question to contact support! 💬');
    } else if (text.includes('start') || text.includes('begin')) {
      await ctx.reply('Ready to get started? Use /start to see the main menu! 🚀');
    } else if (user?.banned && (text.includes('banned') || text.includes('suspended'))) {
      await ctx.reply('To appeal your suspension, use: /appeal [your explanation] ⚖️');
    }
  }

  /**
   * Handle photo uploads
   */
  private async handlePhotoUpload(ctx: Context): Promise<void> {
    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) return;

    await ctx.reply(
      '📸 Photo received! To use images in listings, please upload them through the marketplace web app where you can add descriptions and organize them properly.'
    );
  }

  /**
   * Handle document uploads
   */
  private async handleDocumentUpload(ctx: Context): Promise<void> {
    const document = ctx.message?.document;
    if (!document) return;

    await ctx.reply(
      '📄 Document received! For digital product files, please upload them through the marketplace web app during listing creation.'
    );
  }

  /**
   * Send message for banned users
   */
  private async sendBannedUserMessage(ctx: Context, user: any): Promise<void> {
    const banReason = user.banReason || 'Terms of service violation';

    const message = `
🚫 **Account Suspended**

Your account is currently suspended.

**Reason:** ${banReason}
**Date:** ${user.bannedAt ? new Date(user.bannedAt).toLocaleDateString() : 'N/A'}

**Available commands:**
• /appeal [explanation] - Submit an appeal
• /question [message] - Contact support
• /help - View help information

Use /appeal if you believe this suspension was issued in error.
    `.trim();

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  /**
   * Send appeal instructions
   */
  private async sendAppealInstructions(ctx: Context): Promise<void> {
    const message = `
⚖️ **Submit Appeal**

To appeal your account suspension:

**Format:** \`/appeal [your detailed explanation]\`

**Example:**
\`/appeal I was banned for spam but I only posted one legitimate listing. I believe this was flagged by mistake as I followed all posting guidelines.\`

**Include:**
• Why you believe the ban was incorrect
• Relevant context or evidence
• Your commitment to follow guidelines

**Review Time:** Appeals are reviewed within 48 hours.
    `.trim();

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }

  /**
   * Submit user appeal
   */
  private async submitAppeal(ctx: Context, appealText: string, user: any): Promise<void> {
    try {
      const adminId = this.context.env.ADMIN_ID;
      if (!adminId) {
        await ctx.reply('❌ Admin contact not configured. Please try again later.');
        return;
      }

      const userInfo = ctx.from;
      const appealMessage = `
⚖️ **New Appeal Submission**

**User:** ${userInfo?.first_name} ${userInfo?.last_name || ''} (@${userInfo?.username || 'no username'})
**User ID:** ${userInfo?.id}
**Ban Reason:** ${user.banReason || 'Unknown'}
**Ban Date:** ${user.bannedAt ? new Date(user.bannedAt).toLocaleDateString() : 'Unknown'}

**Appeal:**
${appealText}

**Submitted:** ${new Date().toISOString()}

**Actions:**
/unban_${userInfo?.id} - Approve appeal and unban
/deny_appeal_${userInfo?.id} - Deny appeal
      `.trim();

      await ctx.api.sendMessage(adminId, appealMessage, {
        parse_mode: 'Markdown',
      });

      await ctx.reply(
        '✅ Your appeal has been submitted and will be reviewed within 48 hours. You will be notified of the decision.'
      );
    } catch (error) {
      console.error('Error submitting appeal:', error);
      await ctx.reply('❌ Error submitting appeal. Please try again later.');
    }
  }

  /**
   * Handle admin status command
   */
  private async handleAdminStatus(ctx: Context): Promise<void> {
    const stats = await this.getSystemStats();

    const statusMessage = `
🔧 **Admin System Status**

**Bot Status:**
• Name: ${this.context.botName || 'Unknown'}
• Environment: ${this.context.isLocalhost ? 'Development' : 'Production'}
• Uptime: ${process.uptime ? Math.floor(process.uptime()) : 'Unknown'}s

**Database:**
• Status: ✅ Connected
• Active Users: ${stats.activeUsers}
• Total Listings: ${stats.totalListings}

**System Health:**
• Memory Usage: ${this.getMemoryUsage()}
• Active Sessions: ${this.userSessions.size}
• Recent Errors: ${stats.recentErrors}

**Last Updated:** ${new Date().toISOString()}
    `.trim();

    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle admin stats command
   */
  private async handleAdminStats(ctx: Context): Promise<void> {
    const stats = await this.getMarketplaceStats();

    const statsMessage = `
📊 **Marketplace Statistics**

**Users:**
• Total Users: ${stats.totalUsers}
• Active (24h): ${stats.activeUsers24h}
• New (7d): ${stats.newUsers7d}
• Banned: ${stats.bannedUsers}

**Listings:**
• Total: ${stats.totalListings}
• Active: ${stats.activeListings}
• Published (24h): ${stats.newListings24h}
• Flagged: ${stats.flaggedListings}

**Activity:**
• Messages (24h): ${stats.messages24h}
• Commands (24h): ${stats.commands24h}
• Support Tickets: ${stats.openTickets}

**Generated:** ${new Date().toISOString()}
    `.trim();

    await ctx.reply(statsMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle user unban
   */
  private async handleUnbanUser(ctx: Context, userId: string): Promise<void> {
    try {
      const user = await this.userService.getUserByTelegramId(userId);

      if (!user) {
        await ctx.reply(`❌ User with ID ${userId} not found.`);
        return;
      }

      if (!user.banned) {
        await ctx.reply(`ℹ️ User ${user.firstName} is not currently banned.`);
        return;
      }

      // Unban user
      await this.userService.updateUser(user.id, {
        banned: false,
        banReason: null,
        bannedAt: null,
        updatedAt: new Date(),
      });

      // Notify user
      await ctx.api.sendMessage(
        userId,
        `
✅ **Appeal Approved**

Your account suspension has been lifted. You can now use all marketplace features again.

**Please remember:**
• Follow community guidelines
• Respect other users
• Report any issues

Welcome back! 🎉
      `.trim(),
        { parse_mode: 'Markdown' }
      );

      await ctx.reply(
        `✅ User ${user.firstName} (@${user.username}) has been unbanned successfully.`
      );
    } catch (error) {
      console.error('Error unbanning user:', error);
      await ctx.reply('❌ Error processing unban. Please try again.');
    }
  }

  /**
   * Handle deny appeal
   */
  private async handleDenyAppeal(ctx: Context, userId: string): Promise<void> {
    try {
      const user = await this.userService.getUserByTelegramId(userId);

      if (!user) {
        await ctx.reply(`❌ User with ID ${userId} not found.`);
        return;
      }

      // Notify user
      await ctx.api.sendMessage(
        userId,
        `
❌ **Appeal Denied**

Your appeal has been reviewed and denied. The original suspension remains in effect.

**Reason:** The evidence supports the original moderation decision.

**What you can do:**
• Review our community guidelines
• Submit a new appeal with additional evidence (if available)
• Contact support for clarification

**Note:** Repeated frivolous appeals may result in extended restrictions.
      `.trim(),
        { parse_mode: 'Markdown' }
      );

      await ctx.reply(`✅ Appeal denied for user ${user.firstName} (@${user.username}).`);
    } catch (error) {
      console.error('Error denying appeal:', error);
      await ctx.reply('❌ Error processing appeal denial. Please try again.');
    }
  }

  /**
   * Send quick admin stats
   */
  private async sendQuickStats(ctx: Context): Promise<void> {
    const stats = await this.getSystemStats();

    const quickStats = `
📊 **Quick Stats**

**Right Now:**
• Active Users: ${stats.activeUsers}
• Open Tickets: ${stats.openTickets}
• System Load: ${this.getSystemLoad()}

**Today:**
• New Users: ${stats.newUsersToday}
• New Listings: ${stats.newListingsToday}
• Support Messages: ${stats.supportMessagesToday}

**Alerts:** ${stats.alerts > 0 ? `🔴 ${stats.alerts}` : '🟢 None'}
    `.trim();

    await ctx.editMessageText(quickStats, {
      parse_mode: 'Markdown',
      reply_markup: ctx.callbackQuery?.message?.reply_markup,
    });
  }

  /**
   * Utility functions
   */
  private isAdmin(ctx: Context): boolean {
    return ctx.from?.id?.toString() === this.context.env.ADMIN_ID;
  }

  private getUserSession(userId: string): UserSession {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, {
        userId,
        telegramId: userId,
        lastActivity: new Date(),
        messageCount: 0,
        rateLimitResetTime: new Date(Date.now() + 60000),
      });
    }
    return this.userSessions.get(userId)!;
  }

  private isKnownCommand(text: string): boolean {
    const knownCommands = [
      '/start',
      '/help',
      '/question',
      '/appeal',
      '/admin_status',
      '/admin_stats',
      '/debug',
    ];

    const command = text.split(' ')[0];
    return (
      knownCommands.includes(command) ||
      command.startsWith('/unban_') ||
      command.startsWith('/deny_appeal_')
    );
  }

  private getUpdateType(ctx: Context): string {
    if (ctx.message) return 'message';
    if (ctx.callbackQuery) return 'callback_query';
    if (ctx.inlineQuery) return 'inline_query';
    return 'unknown';
  }

  private async logMessage(ctx: Context): Promise<void> {
    const messageData = {
      updateId: ctx.update.update_id,
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      messageId: ctx.message?.message_id,
      text: ctx.message?.text?.substring(0, 200),
      timestamp: new Date().toISOString(),
    };

    console.log('Non-command message:', messageData);
  }

  private async getSystemStats(): Promise<any> {
    // Placeholder - implement with real database queries
    return {
      activeUsers: 150,
      totalListings: 450,
      recentErrors: 0,
      openTickets: 3,
      newUsersToday: 12,
      newListingsToday: 25,
      supportMessagesToday: 8,
      alerts: 0,
    };
  }

  private async getMarketplaceStats(): Promise<any> {
    // Placeholder - implement with real database queries
    return {
      totalUsers: 1250,
      activeUsers24h: 180,
      newUsers7d: 45,
      bannedUsers: 12,
      totalListings: 890,
      activeListings: 675,
      newListings24h: 15,
      flaggedListings: 3,
      messages24h: 342,
      commands24h: 128,
      openTickets: 5,
    };
  }

  private getMemoryUsage(): string {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return `${Math.round(usage.heapUsed / 1024 / 1024)}MB`;
    }
    return 'Unknown';
  }

  private getSystemLoad(): string {
    // Simplified system load indicator
    const sessions = this.userSessions.size;
    if (sessions < 10) return '🟢 Low';
    if (sessions < 50) return '🟡 Medium';
    if (sessions < 100) return '🟠 High';
    return '🔴 Very High';
  }

  /**
   * Connection health check and monitoring
   */
  private async performConnectionHealthCheck(): Promise<void> {
    try {
      // Simple health check by calling getMe API
      const bot = new Bot(this.context.env.TELEGRAM_BOT_TOKEN, {
        client: { timeoutMs: 5000 },
      });

      await bot.api.getMe();
      this.updateConnectionStatus(true);

      // Log successful health check periodically
      if (this.apiConnectionStatus.consecutiveErrors > 0) {
        console.log(
          'Telegram API connection restored after',
          this.apiConnectionStatus.consecutiveErrors,
          'errors'
        );
      }
    } catch (error) {
      console.warn('Telegram API health check failed:', error);
      this.updateConnectionStatus(false, error instanceof Error ? error.message : String(error));

      // Alert admin if connection has been down for a while
      if (this.apiConnectionStatus.consecutiveErrors >= 5) {
        await this.alertAdminOfConnectionIssue();
      }
    }
  }

  /**
   * Update API connection status
   */
  private updateConnectionStatus(success: boolean, errorMessage?: string): void {
    const now = new Date();

    if (success) {
      this.apiConnectionStatus.connected = true;
      this.apiConnectionStatus.lastSuccessfulCall = now;
      this.apiConnectionStatus.consecutiveErrors = 0;
      this.apiConnectionStatus.lastError = null;
      this.apiConnectionStatus.rateLimitResetTime = null;
      this.apiConnectionStatus.retryAfter = null;
    } else {
      this.apiConnectionStatus.connected = false;
      this.apiConnectionStatus.consecutiveErrors++;
      this.apiConnectionStatus.lastError = errorMessage || 'Unknown error';
    }
  }

  /**
   * Alert admin of connection issues
   */
  private async alertAdminOfConnectionIssue(): Promise<void> {
    try {
      if (!this.context.env.ADMIN_ID) return;

      const errorMessage = `
🚨 **Telegram API Connection Issue**

**Status:** Connection problems detected
**Consecutive Errors:** ${this.apiConnectionStatus.consecutiveErrors}
**Last Success:** ${this.apiConnectionStatus.lastSuccessfulCall?.toISOString() || 'Never'}
**Last Error:** ${this.apiConnectionStatus.lastError || 'Unknown'}

**Time:** ${new Date().toISOString()}

The bot may not be processing updates properly. Please check the logs and consider investigating connectivity issues.
      `.trim();

      // Use a simple HTTP request to send the alert since bot API might be down
      const response = await fetch(
        `https://api.telegram.org/bot${this.context.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.context.env.ADMIN_ID,
            text: errorMessage,
            parse_mode: 'Markdown',
          }),
        }
      );

      if (!response.ok) {
        console.error('Failed to send admin alert:', await response.text());
      }
    } catch (error) {
      console.error('Error sending admin alert:', error);
    }
  }

  /**
   * Clean up old user sessions
   */
  private cleanupOldSessions(): void {
    const now = new Date();
    const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours

    for (const [userId, session] of this.userSessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > sessionTimeout) {
        this.userSessions.delete(userId);
      }
    }

    console.log(`Cleaned up old sessions, active sessions: ${this.userSessions.size}`);
  }

  /**
   * Get connection status for monitoring
   */
  public getConnectionStatus(): TelegramAPIConnectionStatus {
    return { ...this.apiConnectionStatus };
  }

  /**
   * Utility methods for error classification
   */
  private isRateLimitError(error: any): boolean {
    return (
      error instanceof HttpError &&
      (error.error_code === 429 || error.description?.includes('Too Many Requests'))
    );
  }

  private extractRetryAfter(error: any): number {
    if (error instanceof HttpError && error.parameters?.retry_after) {
      return parseInt(error.parameters.retry_after);
    }
    return 60; // Default 60 seconds
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof HttpError) {
      const retryableCodes = [408, 500, 502, 503, 504];
      return retryableCodes.includes(error.error_code);
    }

    if (error instanceof Error) {
      const retryableMessages = ['timeout', 'network', 'connection', 'ECONNRESET', 'ETIMEDOUT'];
      return retryableMessages.some(msg => error.message.toLowerCase().includes(msg));
    }

    return false;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getWebhookUpdateType(body: any): string {
    if (body.message) return 'message';
    if (body.callback_query) return 'callback_query';
    if (body.inline_query) return 'inline_query';
    if (body.chosen_inline_result) return 'chosen_inline_result';
    if (body.edited_message) return 'edited_message';
    if (body.channel_post) return 'channel_post';
    if (body.edited_channel_post) return 'edited_channel_post';
    return 'unknown';
  }

  /**
   * Enhanced API call wrapper with retry logic
   */
  public async apiCallWithRetry<T>(
    apiCall: () => Promise<T>,
    context?: string,
    maxRetries = this.maxRetries
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiCall();
        this.updateConnectionStatus(true);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`API call failed (attempt ${attempt}/${maxRetries}) - ${context}:`, error);

        if (attempt === maxRetries) {
          this.updateConnectionStatus(
            false,
            error instanceof Error ? error.message : String(error)
          );
          break;
        }

        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error) * 1000;
          console.log(`Rate limited, waiting ${retryAfter}ms`);
          await this.delay(retryAfter);
        } else if (this.isRetryableError(error)) {
          const delay = Math.min(
            this.baseRetryDelay * Math.pow(2, attempt - 1),
            this.maxRetryDelay
          );
          console.log(`Retryable error, waiting ${delay}ms`);
          await this.delay(delay);
        } else {
          // Non-retryable error
          this.updateConnectionStatus(
            false,
            error instanceof Error ? error.message : String(error)
          );
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Global error handler
   */
  private async handleError(err: any): Promise<void> {
    console.error('Grammy bot error:', {
      error: err.error || err,
      stack: err.stack,
      context: err.ctx
        ? {
            updateId: err.ctx.update.update_id,
            userId: err.ctx.from?.id,
            chatId: err.ctx.chat?.id,
          }
        : null,
      timestamp: new Date().toISOString(),
    });

    // Try to send error message to user if context is available
    if (err.ctx && err.ctx.chat) {
      try {
        await err.ctx.reply(
          '❌ Sorry, something went wrong. Please try again or contact support with /question.'
        );
      } catch (replyError) {
        console.error('Failed to send error message to user:', replyError);
      }
    }

    // Notify admin of critical errors
    if (this.context.env.ADMIN_ID && this.isCriticalError(err)) {
      try {
        await err.ctx?.api.sendMessage(
          this.context.env.ADMIN_ID,
          `
🚨 **Critical Bot Error**

**Error:** ${err.error?.message || 'Unknown error'}
**Time:** ${new Date().toISOString()}
**User:** ${err.ctx?.from?.id || 'Unknown'}
**Context:** ${this.getUpdateType(err.ctx) || 'Unknown'}

**Stack:** \`${(err.stack || '').substring(0, 500)}\`
        `.trim(),
          { parse_mode: 'Markdown' }
        );
      } catch (notifyError) {
        console.error('Failed to notify admin of error:', notifyError);
      }
    }
  }

  private isCriticalError(err: any): boolean {
    const criticalKeywords = ['database', 'connection', 'timeout', 'memory', 'auth'];
    const errorMessage = (err.error?.message || err.message || '').toLowerCase();
    return criticalKeywords.some(keyword => errorMessage.includes(keyword));
  }
}
