import { CommandContext } from 'grammy';

export async function handleHelpCommand(ctx: CommandContext<any>, frontendUrl: string) {
  const helpText = `📖 **Marketplace Help**

**Available Commands:**
/start - Welcome message and main menu
/help - Show this help message
/question <text> - Ask admin a question

**How to use the marketplace:**

1. **Buying:** Click "Open Marketplace" → Browse → Contact seller
2. **Selling:** Open marketplace → "Create Listing" → Add details
3. **Safety:** Always verify items before payment

**Need help?** Use /question followed by your message, and an admin will respond within 24 hours.

**Example:** \`/question How do I create a listing?\``;

  await ctx.reply(helpText, {
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
}