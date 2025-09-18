import { CommandContext } from 'grammy';

export async function handleStartCommand(ctx: CommandContext<any>, frontendUrl: string) {
  const user = ctx.from;
  if (!user) return;

  const welcomeText = `🎉 Welcome to the Marketplace!

Hello ${user.first_name}! 👋

This is your gateway to buying and selling items with other Telegram users. Here's what you can do:

🛍️ **Browse** thousands of listings
💰 **Sell** your items quickly and safely
🔍 **Search** for exactly what you need
💬 **Chat** directly with sellers/buyers
⭐ **Rate** and review transactions

Ready to get started? Use the button below to open the marketplace web app!`;

  await ctx.reply(welcomeText, {
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