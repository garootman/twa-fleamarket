import { hmacSha256, hex } from './cryptoUtils';
import { TelegramUserSchema } from '../db/schema';
import { z } from 'zod';

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org/bot';

const TelegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.any().optional(),
  error_code: z.number().optional(),
  description: z.string().optional(),
});

type TelegramResponse = z.infer<typeof TelegramResponseSchema>;

type TelegramUser = z.infer<typeof TelegramUserSchema>;

interface WebAppInitData {
  user?: TelegramUser;
  receiver?: any;
  chat?: any;
  auth_date: number;
  start_param?: string;
  [key: string]: any;
}

interface HashResult {
  expectedHash: string | null;
  calculatedHash: string;
  data: WebAppInitData;
}

class TelegramAPI {
  private token: string;
  private apiBaseUrl: string;

  constructor(token: string, useTestApi: string = 'false') {
    this.token = token;
    let testApiAddendum = useTestApi === 'true' ? 'test/' : '';
    this.apiBaseUrl = `${TELEGRAM_API_BASE_URL}${token}/${testApiAddendum}`;
  }

  async calculateHashes(initData: string): Promise<HashResult> {
    const urlParams = new URLSearchParams(initData);

    const expectedHash = urlParams.get('hash');
    urlParams.delete('hash');
    urlParams.sort();

    let dataCheckString = '';

    for (const [key, value] of urlParams.entries()) {
      dataCheckString += `${key}=${value}\n`;
    }

    dataCheckString = dataCheckString.slice(0, -1);
    let data: WebAppInitData = Object.fromEntries(urlParams) as any;
    data.user = JSON.parse((data.user as any) || 'null');
    try {
      data.user = TelegramUserSchema.parse(data.user);
    } catch (error) {
      console.error('Error validating user data:', error);
      throw new Error(
        `Invalid user data: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    data.receiver = JSON.parse((data.receiver as any) || 'null');
    data.chat = JSON.parse((data.chat as any) || 'null');

    const secretKey = await hmacSha256(this.token, 'WebAppData');
    const calculatedHash = hex(await hmacSha256(dataCheckString, secretKey));

    return { expectedHash, calculatedHash, data };
  }

  async getUpdates(lastUpdateId?: number): Promise<TelegramResponse> {
    const url = `${this.apiBaseUrl}getUpdates`;
    const params: any = {};
    if (lastUpdateId) {
      params.offset = lastUpdateId + 1;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    return TelegramResponseSchema.parse(await response.json());
  }

  async sendMessage(
    chatId: number,
    text: string,
    parse_mode?: string,
    reply_to_message_id?: number
  ): Promise<TelegramResponse> {
    const url = `${this.apiBaseUrl}sendMessage`;
    const params: any = {
      chat_id: chatId,
      text: text,
    };
    if (parse_mode) {
      params.parse_mode = parse_mode;
    }
    if (reply_to_message_id) {
      params.reply_to_message_id = reply_to_message_id;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    return TelegramResponseSchema.parse(await response.json());
  }

  async setWebhook(externalUrl: string, secretToken?: string): Promise<TelegramResponse> {
    const params: any = {
      url: externalUrl,
    };
    if (secretToken) {
      params.secret_token = secretToken;
    }
    const url = `${this.apiBaseUrl}setWebhook`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    return TelegramResponseSchema.parse(await response.json());
  }

  async getMe(): Promise<TelegramResponse> {
    const url = `${this.apiBaseUrl}getMe`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return TelegramResponseSchema.parse(await response.json());
  }
}

export { TelegramAPI as Telegram, type TelegramResponse, type TelegramUser, type WebAppInitData };
