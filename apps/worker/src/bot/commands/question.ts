import { CommandContext } from 'grammy';

export async function handleQuestionCommand(ctx: CommandContext<any>, frontendUrl: string) {
  const questionText = ctx.message?.text?.replace('/question', '').trim();

  if (!questionText) {
    await ctx.reply(
      '❓ **Ask a Question**\n\nPlease provide your question after the command.\n\n**Example:** `/question How do I create a listing?`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Send confirmation to user
  await ctx.reply(
    '✅ **Question Received!**\n\nThank you for your question. An admin will respond within 24 hours.\n\nIn the meantime, you can continue using the marketplace!',
    {
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
    }
  );

  // TODO: Forward question to admin (implement when admin system is ready)
  // This could involve:
  // - Storing question in database
  // - Sending notification to admin chat
  // - Creating support ticket system
}