import { CallbackQueryContext } from 'grammy';

export async function handleCallbackQuery(ctx: CallbackQueryContext<any>, frontendUrl: string) {
  const data = ctx.callbackQuery.data;

  if (data === 'help') {
    await ctx.answerCallbackQuery();

    const helpText = `📖 **Marketplace Help**

**Available Commands:**
/start - Welcome message and main menu
/help - Show this help message
/question <text> - Ask admin a question

**How to use the marketplace:**

1. **Buying:** Click "Open Marketplace" → Browse → Contact seller
2. **Selling:** Open marketplace → "Create Listing" → Add details
3. **Safety:** Always verify items before payment

**Need help?** Use /question followed by your message.`;

    await ctx.editMessageText(helpText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Marketplace',
              url: frontendUrl
            }
          ]
        ]
      }
    });

  } else if (data === 'support') {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      '📞 **Support**\n\nTo get help:\n1. Use /question followed by your message\n2. An admin will respond within 24 hours\n\n**Example:** `/question I need help with payment`',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔙 Back to Main', callback_data: 'start' }
            ]
          ]
        }
      }
    );

  } else if (data === 'start') {
    await ctx.answerCallbackQuery();

    const user = ctx.from;
    const welcomeText = `🎉 Welcome to the Marketplace!

Hello ${user.first_name}! 👋

This is your gateway to buying and selling items with other Telegram users.

Ready to get started? Use the button below to open the marketplace web app!`;

    await ctx.editMessageText(welcomeText, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Marketplace',
              url: frontendUrl
            }
          ],
          [
            { text: '❓ Help', callback_data: 'help' },
            { text: '📞 Support', callback_data: 'support' }
          ]
        ]
      }
    });
  }
}