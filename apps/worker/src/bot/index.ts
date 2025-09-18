import { Bot, webhookCallback } from 'grammy';
import { handleStartCommand } from './commands/start';
import { handleHelpCommand } from './commands/help';
import { handleQuestionCommand } from './commands/question';
import { handleCallbackQuery } from './handlers/callback';
import { handleTextMessage } from './handlers/message';

interface BotEnv {
  TELEGRAM_BOT_TOKEN: string;
  FRONTEND_URL: string;
}

export function createBot(env: BotEnv) {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Register command handlers
  bot.command('start', (ctx) => handleStartCommand(ctx, env.FRONTEND_URL));
  bot.command('help', (ctx) => handleHelpCommand(ctx, env.FRONTEND_URL));
  bot.command('question', (ctx) => handleQuestionCommand(ctx, env.FRONTEND_URL));

  // Register callback query handler
  bot.on('callback_query:data', (ctx) => handleCallbackQuery(ctx, env.FRONTEND_URL));

  // Register text message handler
  bot.on('message:text', (ctx) => handleTextMessage(ctx, env.FRONTEND_URL));

  return bot;
}

export function createWebhookHandler(env: BotEnv) {
  const bot = createBot(env);
  return webhookCallback(bot, 'hono');
}