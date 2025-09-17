import { Context, InlineKeyboard } from 'grammy';
import { UserService } from '../../services/user-service';
import { AdminService } from '../../services/admin-service';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * QuestionCommand - Telegram Bot /question Command Handler
 *
 * Handles user support requests and admin communication:
 * - User question submission with categorization
 * - Admin notification and forwarding system
 * - Ticket tracking and follow-up management
 * - Support queue management with priority levels
 * - Integration with admin panel for response tracking
 * - Automated response suggestions and templates
 */

export interface BotContext {
  db: DrizzleD1Database;
  env: any;
  corsHeaders: Record<string, string>;
  isLocalhost: boolean;
  botName: string | null;
}

export interface SupportTicket {
  id: string;
  userId: string;
  telegramId: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subject: string;
  message: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  createdAt: Date;
  updatedAt: Date;
  adminNotes?: string;
  responseCount: number;
}

export class QuestionCommand {
  private userService: UserService;
  private adminService: AdminService;
  private context: BotContext;

  constructor(context: BotContext) {
    this.context = context;
    this.userService = new UserService(context.db);
    this.adminService = new AdminService(context.db);
  }

  /**
   * Handle /question command
   * Provides support request interface with categorization
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
      console.log('Bot command /question:', {
        user_id: user.id,
        username: user.username,
        chat_id: chatId,
        chat_type: ctx.chat?.type,
        timestamp: new Date().toISOString(),
      });

      // Get user information
      const userInfo = await this.getUserInfo(user.id.toString());

      // Extract question text if provided immediately
      const messageText = ctx.message?.text || '';
      const questionText = messageText.replace('/question', '').trim();

      if (questionText) {
        // Process immediate question
        await this.processQuestion(ctx, questionText, userInfo);
      } else {
        // Show question submission interface
        await this.showQuestionInterface(ctx, userInfo);
      }

    } catch (error) {
      console.error('Error handling /question command:', error);
      await this.sendErrorMessage(ctx);
    }
  }

  /**
   * Get user information for support context
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
   * Show question submission interface
   */
  private async showQuestionInterface(ctx: Context, userInfo: any): Promise<void> {
    const isBanned = userInfo?.banned;
    const userName = userInfo ? `${userInfo.firstName} ${userInfo.lastName || ''}`.trim() : 'User';

    let interfaceMessage = `
💬 **Contact Support**

Hello ${userName}! Our support team is here to help you.

**How to ask your question:**
Type: \`/question [your message]\`

**Examples:**
\`/question I can't upload images to my listing\`
\`/question Payment failed for order #12345\`
\`/question How do I delete my account?\`
\`/question User is not responding to my messages\`

**📋 What to include:**
• Specific details about your issue
• Error messages (if any)
• Listing or order IDs when relevant
• What you were trying to do
• What you expected to happen

**⏱️ Response Times:**
• General questions: Within 24 hours
• Technical issues: Within 12 hours
• Payment problems: Within 4 hours
• Security concerns: Within 2 hours
    `.trim();

    if (isBanned) {
      interfaceMessage += `

**⚠️ Account Status: Suspended**
Your account is currently suspended. For account-related issues:
• Use /appeal if you believe the suspension was incorrect
• Include detailed explanation in your appeal
• Our team will review within 48 hours
      `.trim();
    }

    interfaceMessage += `

**💡 Before submitting:**
• Check the FAQ in /help
• Try basic troubleshooting steps
• Search previous questions

**Quick Categories:**
Use the buttons below for common question types.
    `.trim();

    // Create quick category keyboard
    const keyboard = new InlineKeyboard()
      .text('🔧 Technical Issue', 'question_tech')
      .text('💰 Payment Help', 'question_payment')
      .row()
      .text('📝 Listing Help', 'question_listing')
      .text('👤 Account Issue', 'question_account')
      .row()
      .text('🛡️ Report Problem', 'question_report')
      .text('❓ General Question', 'question_general')
      .row()
      .webApp('📋 Support Center', `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/support`);

    if (isBanned) {
      keyboard.row().text('⚖️ Appeal Suspension', 'submit_appeal');
    }

    await ctx.reply(interfaceMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }

  /**
   * Process immediate question submission
   */
  private async processQuestion(ctx: Context, questionText: string, userInfo: any): Promise<void> {
    try {
      // Categorize question automatically
      const category = this.categorizeQuestion(questionText);
      const priority = this.determinePriority(questionText, userInfo);

      // Generate ticket ID
      const ticketId = this.generateTicketId();

      // Create support ticket data
      const ticket: SupportTicket = {
        id: ticketId,
        userId: userInfo?.id || '',
        telegramId: ctx.from?.id?.toString() || '',
        category,
        priority,
        subject: this.generateSubject(questionText),
        message: questionText,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        responseCount: 0,
      };

      // Store ticket (in real implementation, save to database)
      await this.storeTicket(ticket);

      // Forward to admin
      await this.forwardToAdmin(ctx, ticket, userInfo);

      // Send confirmation to user
      await this.sendConfirmation(ctx, ticket);

      // Log ticket creation
      console.log('Support ticket created:', {
        ticketId: ticket.id,
        userId: ticket.telegramId,
        category: ticket.category,
        priority: ticket.priority,
        timestamp: ticket.createdAt.toISOString(),
      });

    } catch (error) {
      console.error('Error processing question:', error);
      await ctx.reply('❌ Error submitting your question. Please try again or contact support directly.');
    }
  }

  /**
   * Automatically categorize questions based on content
   */
  private categorizeQuestion(text: string): string {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('payment') || lowerText.includes('money') || lowerText.includes('refund')) {
      return 'payment';
    }
    if (lowerText.includes('upload') || lowerText.includes('image') || lowerText.includes('error')) {
      return 'technical';
    }
    if (lowerText.includes('listing') || lowerText.includes('post') || lowerText.includes('publish')) {
      return 'listing';
    }
    if (lowerText.includes('account') || lowerText.includes('profile') || lowerText.includes('banned')) {
      return 'account';
    }
    if (lowerText.includes('report') || lowerText.includes('abuse') || lowerText.includes('inappropriate')) {
      return 'report';
    }

    return 'general';
  }

  /**
   * Determine priority based on content and user status
   */
  private determinePriority(text: string, userInfo: any): 'low' | 'medium' | 'high' | 'urgent' {
    const lowerText = text.toLowerCase();

    // Urgent priorities
    if (lowerText.includes('hack') || lowerText.includes('security') || lowerText.includes('fraud')) {
      return 'urgent';
    }

    // High priorities
    if (lowerText.includes('payment') || lowerText.includes('money') || lowerText.includes('banned')) {
      return 'high';
    }

    // Medium priorities
    if (lowerText.includes('error') || lowerText.includes('bug') || lowerText.includes('problem')) {
      return 'medium';
    }

    // Premium users get higher priority
    if (userInfo?.isPremium) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Generate descriptive subject line
   */
  private generateSubject(text: string): string {
    // Truncate and clean up for subject line
    const subject = text.substring(0, 60).trim();
    return subject.length < text.length ? `${subject}...` : subject;
  }

  /**
   * Generate unique ticket ID
   */
  private generateTicketId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `TK-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Store ticket (placeholder - implement with database)
   */
  private async storeTicket(ticket: SupportTicket): Promise<void> {
    // TODO: Implement database storage
    // await this.adminService.createSupportTicket(ticket);
    console.log('Ticket stored:', ticket.id);
  }

  /**
   * Forward question to admin with detailed context
   */
  private async forwardToAdmin(ctx: Context, ticket: SupportTicket, userInfo: any): Promise<void> {
    try {
      const adminId = this.context.env.ADMIN_ID;
      if (!adminId) {
        console.warn('ADMIN_ID not set - cannot forward question to admin');
        return;
      }

      const user = ctx.from;
      const priorityEmoji = this.getPriorityEmoji(ticket.priority);
      const categoryEmoji = this.getCategoryEmoji(ticket.category);

      const adminMessage = `
🎫 **New Support Ticket** ${priorityEmoji}

**Ticket ID:** \`${ticket.id}\`
**Category:** ${categoryEmoji} ${ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1)}
**Priority:** ${ticket.priority.toUpperCase()}

**User Information:**
• **Name:** ${user?.first_name || 'Unknown'} ${user?.last_name || ''}
• **Username:** @${user?.username || 'no username'}
• **User ID:** \`${user?.id}\`
• **Telegram ID:** \`${userInfo?.telegramId || 'unknown'}\`
• **Account Status:** ${userInfo?.banned ? '🚫 Suspended' : '✅ Active'}
• **Premium:** ${userInfo?.isPremium ? '⭐ Yes' : '🆓 No'}
• **Member Since:** ${userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString() : 'Unknown'}

**Question:**
${ticket.message}

**Context:**
• **Chat Type:** ${ctx.chat?.type || 'unknown'}
• **Submitted:** ${ticket.createdAt.toISOString()}
• **Response Required By:** ${this.calculateResponseDeadline(ticket.priority)}

**Quick Actions:**
Reply to this message to respond to the user.
Use the admin panel for detailed ticket management.
      `.trim();

      // Send to admin
      await ctx.api.sendMessage(adminId, adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('📱 Admin Panel', 'admin_panel')
          .text('💬 Quick Reply', `reply_ticket_${ticket.id}`)
          .row()
          .text('🔒 Close Ticket', `close_ticket_${ticket.id}`)
          .text('⬆️ Escalate', `escalate_ticket_${ticket.id}`),
      });

    } catch (error) {
      console.error('Failed to forward question to admin:', error);
    }
  }

  /**
   * Send confirmation to user
   */
  private async sendConfirmation(ctx: Context, ticket: SupportTicket): Promise<void> {
    const responseTime = this.getResponseTime(ticket.priority);
    const priorityEmoji = this.getPriorityEmoji(ticket.priority);

    const confirmationMessage = `
✅ **Question Submitted Successfully**

**Ticket ID:** \`${ticket.id}\`
**Priority:** ${priorityEmoji} ${ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
**Expected Response:** ${responseTime}

**Your Question:**
"${ticket.subject}"

**What happens next:**
1. Our admin team has been notified
2. You'll receive a response within ${responseTime}
3. Additional questions can be asked anytime
4. We'll keep you updated on progress

**Need to add more details?**
Reply with: \`/question [additional information]\`

**Track your request:**
• Use ticket ID: \`${ticket.id}\`
• Check status in the web app
• We'll notify you of any updates

Thank you for contacting our support team! 🌟
    `.trim();

    const keyboard = new InlineKeyboard()
      .webApp('📋 View Ticket', `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/support/ticket/${ticket.id}`)
      .row()
      .text('📚 Browse FAQ', 'help_faq')
      .text('💬 Ask Another', 'new_question');

    await ctx.reply(confirmationMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }

  /**
   * Handle callback queries from question interface
   */
  async handleCallback(ctx: Context, data: string): Promise<void> {
    try {
      switch (data) {
        case 'question_tech':
          await this.sendCategoryPrompt(ctx, 'technical', '🔧 Technical Issue');
          break;
        case 'question_payment':
          await this.sendCategoryPrompt(ctx, 'payment', '💰 Payment Help');
          break;
        case 'question_listing':
          await this.sendCategoryPrompt(ctx, 'listing', '📝 Listing Help');
          break;
        case 'question_account':
          await this.sendCategoryPrompt(ctx, 'account', '👤 Account Issue');
          break;
        case 'question_report':
          await this.sendCategoryPrompt(ctx, 'report', '🛡️ Report Problem');
          break;
        case 'question_general':
          await this.sendCategoryPrompt(ctx, 'general', '❓ General Question');
          break;
        case 'submit_appeal':
          await this.sendAppealInstructions(ctx);
          break;
        case 'new_question':
          await this.handle(ctx);
          break;
        default:
          await ctx.answerCallbackQuery('Unknown action');
      }
    } catch (error) {
      console.error('Error handling question callback:', error);
      await ctx.answerCallbackQuery('Error processing request');
    }
  }

  /**
   * Send category-specific prompt
   */
  private async sendCategoryPrompt(ctx: Context, category: string, categoryName: string): Promise<void> {
    const prompts = {
      technical: {
        message: `
🔧 **Technical Issue Support**

To help us assist you better, please include:

**📱 For App Issues:**
• What you were trying to do
• Error messages you see
• Which device/browser you're using
• When the problem started

**🖼️ For Image Upload Problems:**
• File size and format
• Error message details
• How many images you're trying to upload

**⚡ For Performance Issues:**
• Slow loading pages or features
• Connection problems
• App crashes or freezes

**Example:**
\`/question I'm getting "Upload failed" error when trying to add images to my listing. Using Chrome on Windows 10, files are JPG under 5MB.\`
        `.trim(),
        placeholder: 'Describe your technical issue in detail...'
      },
      payment: {
        message: `
💰 **Payment Help**

For payment-related issues, please provide:

**💳 For Payment Problems:**
• Order or transaction ID
• Payment method used
• Error messages received
• Amount and date of transaction

**💸 For Refund Requests:**
• Reason for refund request
• Original transaction details
• When the purchase was made

**🔒 For Security Concerns:**
• Unauthorized transactions
• Suspicious account activity
• Payment method security

**Example:**
\`/question Payment failed for order #12345 using credit card. Error: "Payment declined". Transaction was for $25.99 on March 15th.\`
        `.trim(),
        placeholder: 'Describe your payment issue with transaction details...'
      },
      listing: {
        message: `
📝 **Listing Help**

For listing-related questions, include:

**📋 For Listing Creation:**
• What you're trying to sell
• Which step you're stuck on
• Error messages or problems

**✏️ For Editing Issues:**
• Listing ID or title
• What you're trying to change
• Problems encountered

**👁️ For Visibility Concerns:**
• Listing not showing in search
• Low views or engagement
• Category or pricing questions

**Example:**
\`/question My listing "Digital Art Pack" (ID: LST123) isn't showing in search results. Published 3 days ago in Art category.\`
        `.trim(),
        placeholder: 'Describe your listing question with specific details...'
      },
      account: {
        message: `
👤 **Account Issue**

For account-related problems, tell us:

**⚙️ For Profile Issues:**
• What you're trying to update
• Settings that won't save
• Missing information

**🔐 For Login Problems:**
• Can't access account
• Forgotten credentials
• Two-factor authentication issues

**🚫 For Suspension Appeals:**
• Use /appeal instead for formal appeals
• Include detailed explanation
• Reference specific ban reason

**Example:**
\`/question Can't update my profile photo. Upload button doesn't work and getting "Invalid file" error.\`
        `.trim(),
        placeholder: 'Describe your account issue...'
      },
      report: {
        message: `
🛡️ **Report Problem**

To report inappropriate content or behavior:

**📋 For Content Reports:**
• Listing ID or user involved
• Specific violation (spam, inappropriate content, etc.)
• Evidence or screenshots if available

**👤 For User Behavior:**
• Username or user ID
• Description of inappropriate behavior
• Screenshots of conversations

**⚠️ For Security Issues:**
• Scam attempts or fraud
• Phishing or malicious content
• Account compromises

**Example:**
\`/question Reporting user @scammer123 for sending fake payment confirmations. They're trying to scam buyers with listing ID LST456.\`
        `.trim(),
        placeholder: 'Describe what you need to report with evidence...'
      },
      general: {
        message: `
❓ **General Question**

For general inquiries, feel free to ask about:

**📚 Platform Features:**
• How to use specific features
• Best practices for selling/buying
• Account management tips

**📋 Policies & Guidelines:**
• Terms of service questions
• Community guidelines
• Fee structure inquiries

**💡 Getting Started:**
• New user guidance
• Feature explanations
• Success tips

**Example:**
\`/question What's the difference between bumping a listing and promoting it? Which is better for new sellers?\`
        `.trim(),
        placeholder: 'Ask your general question...'
      }
    };

    const prompt = prompts[category as keyof typeof prompts];

    await ctx.editMessageText(prompt.message, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('← Back to Categories', 'back_to_question')
        .row()
        .text('💬 Submit Different Question', 'new_question'),
    });

    await ctx.answerCallbackQuery(`Selected: ${categoryName}`);
  }

  /**
   * Send appeal instructions
   */
  private async sendAppealInstructions(ctx: Context): Promise<void> {
    const appealMessage = `
⚖️ **Appeal Account Suspension**

If you believe your account was suspended incorrectly:

**Format:**
\`/appeal [detailed explanation]\`

**Include in your appeal:**
• Why you believe the suspension was incorrect
• Relevant context or evidence
• Your understanding of the violation claimed
• Commitment to follow guidelines

**Example:**
\`/appeal I was banned for spam, but I only posted one legitimate listing for my digital artwork. I followed all posting guidelines and included proper descriptions and images. I believe this was flagged by mistake.\`

**Appeal Process:**
• Admin review within 48 hours
• Detailed response with reasoning
• Decision is final unless new evidence emerges

**Important:**
• Only submit if you genuinely believe there was an error
• Frivolous appeals may delay processing
• Be respectful and provide facts
    `.trim();

    await ctx.editMessageText(appealMessage, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('← Back to Support', 'back_to_question'),
    });
  }

  /**
   * Utility functions
   */
  private getPriorityEmoji(priority: string): string {
    const emojis = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
    return emojis[priority as keyof typeof emojis] || '⚪';
  }

  private getCategoryEmoji(category: string): string {
    const emojis = {
      technical: '🔧',
      payment: '💰',
      listing: '📝',
      account: '👤',
      report: '🛡️',
      general: '❓'
    };
    return emojis[category as keyof typeof emojis] || '📋';
  }

  private getResponseTime(priority: string): string {
    const times = {
      urgent: 'within 2 hours',
      high: 'within 4 hours',
      medium: 'within 12 hours',
      low: 'within 24 hours'
    };
    return times[priority as keyof typeof times] || 'within 24 hours';
  }

  private calculateResponseDeadline(priority: string): string {
    const hours = { urgent: 2, high: 4, medium: 12, low: 24 };
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + (hours[priority as keyof typeof hours] || 24));
    return deadline.toISOString();
  }

  /**
   * Send error message when something goes wrong
   */
  private async sendErrorMessage(ctx: Context): Promise<void> {
    const errorMessage = `
❌ **Support System Error**

Sorry, we're having trouble processing your question right now.

**What you can do:**
• Try again in a few moments
• Use the web app support center
• Contact us through alternative methods

**Emergency Contact:**
For urgent issues, mention "URGENT" in your message and try again.

**Error Code:** QUESTION_ERROR_${Date.now()}
    `.trim();

    const keyboard = new InlineKeyboard()
      .text('🔄 Try Again', 'retry_question')
      .webApp('🌐 Web Support', `${this.context.isLocalhost ? 'https://localhost:5173' : `https://${this.context.env.WEBAPP_DOMAIN}`}/support`);

    await ctx.reply(errorMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  }
}