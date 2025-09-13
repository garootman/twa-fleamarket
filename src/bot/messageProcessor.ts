import { MessageSender } from './messageSender';

interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
  };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message: TelegramMessage;
}

interface AppContext {
  telegram: any;
  db: any;
  botName: string | null;
  [key: string]: any;
}

const processMessage = async (json: TelegramUpdate, app: AppContext): Promise<string> => {
  const { telegram, db } = app;

  const messageSender = new MessageSender(app, telegram);

  const chatId = json.message.chat.id;
  const replyToMessageId = json.message.message_id;

  const messageToSave = JSON.stringify(json, null, 2);
  // Message logging has been removed - using console instead
  console.log('Message processed:', messageToSave, json.update_id);

  if (json.message.text === '/start') {
    return await messageSender.sendGreeting(chatId, replyToMessageId);
  }

  return 'Skipped message';
};

export { processMessage, type TelegramUpdate, type TelegramMessage };
