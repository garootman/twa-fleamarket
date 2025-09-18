import { Context } from 'grammy';

export async function handleTextMessage(ctx: Context, frontendUrl: string) {
  const messageText = ctx.message?.text;
  if (!messageText) return;

  if (messageText.startsWith('/')) {
    // Unknown command
    await ctx.reply(
      "❓ I don't recognize that command.\n\nTry:\n/start - Main menu\n/help - Help information\n/question <text> - Ask a question",
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏠 Main Menu', callback_data: 'start' },
              { text: '❓ Help', callback_data: 'help' }
            ]
          ]
        }
      }
    );
  } else {
    // Regular text message
    await ctx.reply(
      '👋 Hi there! To use the marketplace, click the button below.\n\nFor commands, try /help',
      {
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
      }
    );
  }
}