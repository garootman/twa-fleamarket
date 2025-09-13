import { md } from '@vlad-yakovlev/telegram-md';
import { Telegram } from './telegram';

interface AppContext {
  botName: string | null;
  [key: string]: any;
}

class MessageSender {
  private botName: string | null;
  private telegram: Telegram;

  constructor(app: AppContext, telegram: Telegram) {
    this.botName = app.botName;
    this.telegram = telegram;
  }

  async sendMessage(chatId: number, text: string, reply_to_message_id?: number): Promise<any> {
    return await this.telegram.sendMessage(chatId, text, 'MarkdownV2', reply_to_message_id);
  }

  async sendGreeting(chatId: number, replyToMessageId?: number): Promise<any> {
    const message = md`Hello!

Welcome to the ${md.bold('Telegram WebApp Fleamarket')}! This bot provides user authentication and management for Telegram WebApps.

You can use this bot to:
• Authenticate users securely
• Manage user profiles and data
• Build powerful Telegram WebApps

Get started by exploring the available features!`;

    return await this.sendMessage(chatId, md.build(message), replyToMessageId);
  }
}

export { MessageSender };
