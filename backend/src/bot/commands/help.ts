import { Context, InlineKeyboard } from 'grammy';
import { UserService } from '../../services/user-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * HelpCommand - Telegram Bot /help Command Handler
 *
 * Provides comprehensive help and navigation system:
 * - Contextual help based on user status and chat type
 * - Interactive navigation with categorized help sections
 * - Command reference with usage examples
 * - Integration with marketplace features
 * - Admin-specific help sections for moderators
 */

export interface BotContext {
  db: DrizzleD1Database;
  env: any;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
}

export class HelpCommand {
  private userService: UserService;
  private context: BotContext;

  constructor(context: BotContext) {
    this.context = context;
    this.userService = new UserService(context.db);
  }

  /**
   * Handle /help command
   * Shows contextual help based on user status and chat type
   */
  async handle(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      const user = ctx.from;

      if (!chatId || !user) {
        console.error('Missing chat ID or user information');
        return;
      }

      // Log command usage for analytics
      console.log('Bot command /help:', {
        user_id: user.id,
        username: user.username,
        chat_id: chatId,
        chat_type: ctx.chat?.type,
        timestamp: new Date().toISOString(),
      });

      // Get user information for contextual help
      const userInfo = await this.getUserInfo(user.id.toString());

      // Send different help based on context
      if (ctx.chat?.type === 'private') {
        await this.sendPrivateHelp(ctx, userInfo);
      } else {
        await this.sendGroupHelp(ctx, userInfo);
      }

    } catch (error) {
      console.error('Error handling /help command:', error);
      await this.sendErrorMessage(ctx);
    }
  }

  /**
   * Get user information for contextual help
   */
  private async getUserInfo(telegramId: string): Promise<any> {
    try {
      return await this.userService.getUserByTelegramId(telegramId);
    } catch (error) {
      console.error('Error getting user info:', error);
      return null;
    }
  }

  /**
   * Send comprehensive help for private chat
   */
  private async sendPrivateHelp(ctx: Context, userInfo: any): Promise<void> {
    const isAdmin = ctx.from?.id?.toString() === this.context.env.ADMIN_ID;
    const isBanned = userInfo?.banned;

    const webAppUrl = this.context.isLocalhost
      ? 'https://localhost:5173'
      : `https://${this.context.env.WEBAPP_DOMAIN || 'your-marketplace.com'}`;

    let helpMessage = `
📚 **Marketplace Bot Help**

Welcome to your digital marketplace assistant! Here's everything you need to know:

**🚀 Quick Start Commands:**
/start - Welcome screen and main navigation
/help - Show this help message (you're here!)
/question - Contact admin for support

**🛍️ Marketplace Features:**
• Browse digital products and services
• Create and manage your listings
• Direct messaging with buyers/sellers
• Secure payment processing
• Rating and review system
    `.trim();

    if (isBanned) {
      helpMessage += `

**⚠️ Account Status: Suspended**
Your account is currently suspended. Use these commands:
• /appeal - Submit an appeal for review
• /question - Contact support for help
      `.trim();
    } else {
      helpMessage += `

**💡 Getting Started:**
1. Tap "Open Marketplace" to browse products
2. Create your first listing to start selling
3. Use search and filters to find what you need
4. Message sellers directly through the app
      `.trim();
    }

    if (isAdmin) {
      helpMessage += `

**🔧 Admin Commands:**
/admin_status - Bot and system status
/admin_stats - Marketplace statistics
• Advanced moderation tools in web app
      `.trim();
    }

    helpMessage += `

**📱 Need More Help?**
• Use the buttons below for specific topics
• Contact support with /question
• Visit our FAQ in the web app

**Response Time:** Support typically responds within 24 hours.
    `.trim();

    // Create contextual keyboard
    const keyboard = new InlineKeyboard();

    if (!isBanned) {
      keyboard.webApp('🛍️ Open Marketplace', webAppUrl).row();
    }

    keyboard
      .text('📋 Commands List', 'help_commands')
      .text('🎯 Quick Tips', 'help_tips')
      .row()
      .text('👥 For Buyers', 'help_buyers')
      .text('💼 For Sellers', 'help_sellers')
      .row()
      .text('💬 Contact Support', 'contact_support')
      .text('❓ FAQ', 'help_faq');

    if (isAdmin) {
      keyboard.row().text('🔧 Admin Help', 'help_admin');
    }

    await ctx.reply(helpMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }

  /**
   * Send help for group chat
   */
  private async sendGroupHelp(ctx: Context, userInfo: any): Promise<void> {
    const isAdmin = ctx.from?.id?.toString() === this.context.env.ADMIN_ID;

    const groupHelpMessage = `
📚 **Marketplace Bot Help** (Group Chat)

**Available Commands:**
/start - Get started (works better in private chat)
/help - Show this help message
/question - Contact admin for support

**📱 For Full Features:**
Message me privately for the complete marketplace experience including browsing, listing creation, and account management.

**👥 Group Commands:**
• All users can use basic commands
• Questions are forwarded to admin
• Use private chat for marketplace functions
    `.trim();

    if (isAdmin) {
      groupHelpMessage += `

**🔧 Admin Group Commands:**
• All admin commands work in groups
• Use /admin_status for system info
• Moderation tools available in private chat
      `.trim();
    }

    const keyboard = new InlineKeyboard()
      .url('💬 Open Private Chat', `https://t.me/${this.context.botName}?start=help_referral`)
      .row()
      .text('📋 Commands', 'help_commands_group')
      .text('💬 Support', 'contact_support');

    await ctx.reply(groupHelpMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  }

  /**
   * Handle callback queries from help navigation
   */
  async handleCallback(ctx: Context, data: string): Promise<void> {
    try {
      switch (data) {
        case 'help_commands':
          await this.sendCommandsList(ctx);
          break;
        case 'help_commands_group':
          await this.sendGroupCommandsList(ctx);
          break;
        case 'help_tips':
          await this.sendQuickTips(ctx);
          break;
        case 'help_buyers':
          await this.sendBuyerHelp(ctx);
          break;
        case 'help_sellers':
          await this.sendSellerHelp(ctx);
          break;
        case 'help_faq':
          await this.sendFAQ(ctx);
          break;
        case 'help_admin':
          await this.sendAdminHelp(ctx);
          break;
        case 'contact_support':
          await this.sendContactSupport(ctx);
          break;
        case 'back_to_help':
          await this.handle(ctx);
          break;
        default:
          await ctx.answerCallbackQuery('Unknown help topic');
      }
    } catch (error) {
      console.error('Error handling help callback:', error);
      await ctx.answerCallbackQuery('Error loading help content');
    }
  }

  /**
   * Send detailed commands list
   */
  private async sendCommandsList(ctx: Context): Promise<void> {
    const userInfo = await this.getUserInfo(ctx.from?.id?.toString() || '');
    const isAdmin = ctx.from?.id?.toString() === this.context.env.ADMIN_ID;

    let commandsMessage = `
📋 **Commands Reference**

**🔰 Basic Commands:**
\`/start\` - Welcome message and main menu
\`/help\` - Show help and navigation
\`/question [message]\` - Contact admin support

**💬 Examples:**
\`/question I can't upload images\`
\`/question How do I delete a listing?\`
\`/question Payment issue with order #123\`

**🛍️ Marketplace Commands:**
All marketplace functions are available through the web app interface. Use the "Open Marketplace" button to access:
• Browse and search products
• Create and edit listings
• Manage orders and payments
• View your account and statistics
    `.trim();

    if (userInfo?.banned) {
      commandsMessage += `

**⚠️ Suspended Account Commands:**
\`/appeal [explanation]\` - Submit ban appeal
\`/question [message]\` - Contact support

**Appeal Example:**
\`/appeal I believe my ban was issued in error because I only posted one legitimate listing and followed all guidelines.\`
      `.trim();
    }

    if (isAdmin) {
      commandsMessage += `

**🔧 Admin Commands:**
\`/admin_status\` - System status and info
\`/admin_stats\` - Marketplace statistics
\`/unban_[user_id]\` - Unban user (from appeal)
\`/deny_appeal_[user_id]\` - Deny user appeal

**Admin Features:**
• User management via web app
• Content moderation tools
• Analytics and reporting
• System configuration
      `.trim();
    }

    commandsMessage += `

**💡 Pro Tips:**
• Commands work in both private and group chats
• Use specific details when contacting support
• Check the FAQ for common questions
• Bookmark the web app for quick access
    `.trim();

    await ctx.editMessageText(commandsMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send group-specific commands list
   */
  private async sendGroupCommandsList(ctx: Context): Promise<void> {
    const isAdmin = ctx.from?.id?.toString() === this.context.env.ADMIN_ID;

    let groupCommandsMessage = `
📋 **Group Chat Commands**

**Available for Everyone:**
\`/start\` - Basic welcome message
\`/help\` - Show help (this message)
\`/question [message]\` - Contact admin

**💡 Important Notes:**
• Full marketplace features require private chat
• Commands work but with limited functionality
• For selling/buying, use the web app
• Support requests are forwarded to admin

**🚀 Getting Full Access:**
1. Message the bot privately
2. Use /start in private chat
3. Access the full web app interface
4. Manage your account and listings
    `.trim();

    if (isAdmin) {
      groupCommandsMessage += `

**🔧 Admin Commands (Groups):**
• All admin commands work in groups
• \`/admin_status\` - Quick system check
• \`/admin_stats\` - Basic statistics
• Private chat recommended for full admin tools
      `.trim();
    }

    await ctx.editMessageText(groupCommandsMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .url('💬 Start Private Chat', `https://t.me/${this.context.botName}?start=group_referral`)
        .row()
        .text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send quick tips for users
   */
  private async sendQuickTips(ctx: Context): Promise<void> {
    const tipsMessage = `
🎯 **Quick Tips for Success**

**🏪 For Sellers:**
• Use clear, high-quality product images
• Write detailed descriptions with keywords
• Set competitive but fair prices
• Respond to messages within 24 hours
• Keep your listings up to date

**🛒 For Buyers:**
• Read product descriptions carefully
• Check seller ratings and reviews
• Ask questions before purchasing
• Leave honest reviews after buying
• Report any issues promptly

**💰 Payment & Security:**
• Use secure payment methods
• Never share personal payment info
• Report suspicious activities
• Keep transaction records
• Use the built-in messaging system

**📱 Using the Web App:**
• Bookmark for quick access
• Enable notifications for updates
• Use search filters effectively
• Check your messages regularly
• Update your profile information

**🎯 Pro Strategies:**
• Post in relevant categories
• Use seasonal trends to your advantage
• Build a good reputation through quality service
• Network with other users
• Stay updated with marketplace news
    `.trim();

    await ctx.editMessageText(tipsMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .webApp('🛍️ Apply Tips in App', this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`)
        .row()
        .text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send buyer-specific help
   */
  private async sendBuyerHelp(ctx: Context): Promise<void> {
    const buyerHelpMessage = `
👥 **Guide for Buyers**

**🔍 Finding Products:**
• Use the search bar with specific keywords
• Browse categories for inspiration
• Apply filters for price, location, ratings
• Check "Recently Added" for new items
• Save favorites for later

**💬 Communicating with Sellers:**
• Ask specific questions about products
• Inquire about delivery/access methods
• Clarify any concerns before buying
• Be polite and professional
• Use the built-in messaging system

**💳 Making Purchases:**
• Review product details thoroughly
• Check seller ratings and reviews
• Use secure payment methods only
• Keep transaction confirmations
• Never pay outside the platform

**⭐ After Purchase:**
• Test/review the product promptly
• Leave honest, helpful reviews
• Report any issues immediately
• Contact seller first for problems
• Rate your experience

**🛡️ Safety Tips:**
• Verify seller identity and reputation
• Be cautious of unrealistic prices
• Report suspicious listings
• Don't share personal information
• Use marketplace protection features

**❓ Common Questions:**
• Refund policies vary by seller
• Digital products are usually instant delivery
• Payment disputes can be reported
• Product warranties depend on seller terms
• Support is available 24/7
    `.trim();

    await ctx.editMessageText(buyerHelpMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .webApp('🛒 Start Shopping', this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`)
        .row()
        .text('💬 Contact Support', 'contact_support')
        .text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send seller-specific help
   */
  private async sendSellerHelp(ctx: Context): Promise<void> {
    const sellerHelpMessage = `
💼 **Guide for Sellers**

**📝 Creating Great Listings:**
• Use clear, descriptive titles
• Include multiple high-quality images
• Write detailed product descriptions
• Set competitive prices
• Choose appropriate categories

**📸 Image Guidelines:**
• Maximum 10 images per listing
• Minimum 800x600 resolution
• Show product from multiple angles
• Use good lighting and backgrounds
• Avoid watermarks or logos

**💰 Pricing Strategies:**
• Research similar products
• Consider your costs and time
• Start competitively for new sellers
• Offer bundle deals when possible
• Update prices based on demand

**📞 Customer Service:**
• Respond to messages within 24 hours
• Be helpful and professional
• Provide clear delivery instructions
• Follow up after sales
• Handle complaints gracefully

**📊 Managing Your Business:**
• Track your listing performance
• Monitor competitor prices
• Update inventory regularly
• Analyze your sales data
• Plan seasonal promotions

**🎯 Growing Your Sales:**
• Maintain excellent ratings
• Get positive customer reviews
• Promote your best products
• Use relevant keywords
• Build repeat customer relationships

**⚠️ Important Rules:**
• No prohibited content (check guidelines)
• Accurate product descriptions only
• Respond to buyer inquiries promptly
• Honor your refund policies
• Report any suspicious activity
    `.trim();

    await ctx.editMessageText(sellerHelpMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .webApp('📝 Create Listing', `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/create`)
        .row()
        .text('💬 Contact Support', 'contact_support')
        .text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send frequently asked questions
   */
  private async sendFAQ(ctx: Context): Promise<void> {
    const faqMessage = `
❓ **Frequently Asked Questions**

**Q: How do I create my first listing?**
A: Open the marketplace web app, click "Create Listing", fill in the details, upload images, and publish!

**Q: How long does it take for listings to go live?**
A: Most listings are approved within 2-24 hours. Prohibited content may be rejected.

**Q: What payment methods are accepted?**
A: We support major payment methods. Check the web app for current options in your region.

**Q: How do I contact a seller/buyer?**
A: Use the built-in messaging system in the web app for secure communication.

**Q: Can I edit my listing after publishing?**
A: Yes! Go to "My Listings" in the web app to edit details, price, or images.

**Q: What if I'm not satisfied with a purchase?**
A: Contact the seller first. If unresolved, use /question to contact support.

**Q: How do I delete my account?**
A: Contact support via /question with your deletion request. This action is permanent.

**Q: Are there fees for using the marketplace?**
A: Check the current fee structure in the web app under "Pricing" or "Terms."

**Q: How do I report inappropriate content?**
A: Use the report button on listings or contact support with /question.

**Q: Can I sell physical products?**
A: This marketplace focuses on digital products. Check terms for current policies.

**Q: How do reviews and ratings work?**
A: Both buyers and sellers can rate each other after transactions. Be honest and fair.

**Q: What happens if my account gets suspended?**
A: You'll receive notification with the reason. Use /appeal if you believe it's an error.
    `.trim();

    await ctx.editMessageText(faqMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .webApp('📋 Full FAQ', `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/faq`)
        .row()
        .text('💬 Ask Question', 'contact_support')
        .text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send admin-specific help
   */
  private async sendAdminHelp(ctx: Context): Promise<void> {
    // Verify admin status
    if (ctx.from?.id?.toString() !== this.context.env.ADMIN_ID) {
      await ctx.answerCallbackQuery('❌ Admin access required');
      return;
    }

    const adminHelpMessage = `
🔧 **Admin Help & Commands**

**🎛️ Bot Management:**
\`/admin_status\` - System status and info
\`/admin_stats\` - User and listing statistics
\`/question\` - Still works for admin communication

**👥 User Management:**
\`/unban_[user_id]\` - Unban specific user (from appeals)
\`/deny_appeal_[user_id]\` - Deny user appeal

**📊 Monitoring Commands:**
• View real-time system metrics
• Monitor user activity patterns
• Track content moderation queue
• Analyze marketplace performance

**🛡️ Moderation Tools:**
• Content review and approval
• User ban/unban management
• Appeal processing workflow
• Automated filter configuration

**📱 Web App Admin Panel:**
• Advanced user management
• Detailed analytics dashboard
• Content moderation interface
• System configuration settings
• Financial reporting tools

**⚡ Quick Actions:**
• Process user appeals efficiently
• Monitor system health status
• Review flagged content
• Respond to support requests

**📈 Analytics Available:**
• User registration trends
• Listing creation patterns
• Revenue and transaction data
• Support ticket statistics
• System performance metrics

**🔔 Notifications:**
• Automatic alerts for critical issues
• Daily summary reports
• Appeal submission notifications
• System maintenance reminders
    `.trim();

    await ctx.editMessageText(adminHelpMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .webApp('🔧 Admin Panel', `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/admin`)
        .row()
        .text('📊 Quick Stats', 'admin_quick_stats')
        .text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send contact support information
   */
  private async sendContactSupport(ctx: Context): Promise<void> {
    const supportMessage = `
💬 **Contact Support**

**How to Get Help:**
Use the /question command followed by your message:

**Examples:**
\`/question I can't upload images to my listing\`
\`/question Payment failed for order #12345\`
\`/question User @username is not responding\`
\`/question How do I change my account email?\`

**What to Include:**
• Specific details about your issue
• Error messages if any
• Listing or order IDs when relevant
• Screenshots (upload to chat if needed)
• Your desired outcome

**Response Times:**
• 🟢 General questions: 24 hours
• 🟡 Technical issues: 12 hours
• 🔴 Payment problems: 4 hours
• 🟣 Security issues: 2 hours

**Support Hours:**
Monday-Friday: 9 AM - 9 PM UTC
Weekends: 10 AM - 6 PM UTC
Emergency support: 24/7

**Before Contacting Support:**
1. Check this help section
2. Review the FAQ
3. Try basic troubleshooting
4. Look for system status updates

**Other Contact Methods:**
• Email: Available in web app
• Live chat: Available during business hours
• Emergency: Critical issues only

Our support team is here to help you succeed! 🌟
    `.trim();

    await ctx.editMessageText(supportMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('📝 Submit Question', 'submit_question')
        .row()
        .webApp('💬 Live Chat', `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/support`)
        .row()
        .text('← Back to Help', 'back_to_help'),
    });
  }

  /**
   * Send error message when something goes wrong
   */
  private async sendErrorMessage(ctx: Context): Promise<void> {
    const errorMessage = `
❌ **Help System Error**

Sorry, we're having trouble loading the help content right now.

**What you can do:**
• Try the /help command again in a few moments
• Use /question to contact support directly
• Check the web app for documentation

**Alternative Help:**
• Basic commands: /start, /help, /question
• Web app: Full documentation available
• Support: Use /question for immediate help

**Error Code:** HELP_ERROR_${Date.now()}
    `.trim();

    const keyboard = new InlineKeyboard()
      .text('🔄 Try Again', 'retry_help')
      .text('💬 Contact Support', 'contact_support');

    await ctx.reply(errorMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  }
}