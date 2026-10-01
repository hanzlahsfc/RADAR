import { GrammyError, HttpError } from 'grammy';
import { TelegramSendError, type TelegramSender } from '../alerts/deliver.js';

export interface TelegramApiClient {
  api: {
    sendMessage: (
      chatId: string | number,
      text: string,
      other?: Record<string, unknown>,
    ) => Promise<{ message_id: number }>;
  };
}

/**
 * Adapt grammY's API client to the delivery layer's TelegramSender port.
 * Telegram 429 responses carry `retry_after`; 403 means the chat is blocked.
 * Errors are surfaced as a small, classified shape owned by the delivery layer.
 */
export function createGrammySender(bot: TelegramApiClient): TelegramSender {
  return {
    async sendMessage(chatId: bigint, html: string): Promise<bigint> {
      try {
        const message = await bot.api.sendMessage(chatId.toString(), html, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
        return BigInt(message.message_id);
      } catch (error) {
        throw toDeliveryError(error);
      }
    },
  };
}

function toDeliveryError(error: unknown): TelegramSendError {
  if (error instanceof GrammyError) {
    const retryAfter = error.parameters?.retry_after;
    if (error.error_code === 403) {
      return new TelegramSendError(error.description, { retryable: false, blocked: true });
    }
    if (error.error_code === 429) {
      return new TelegramSendError(error.description, {
        retryable: true,
        ...(typeof retryAfter === 'number' ? { retryAfterSeconds: retryAfter } : {}),
      });
    }
    return new TelegramSendError(error.description, { retryable: error.error_code >= 500 });
  }
  if (error instanceof HttpError) {
    return new TelegramSendError(`transport error: ${String(error)}`, { retryable: true });
  }
  return new TelegramSendError(error instanceof Error ? error.message : String(error), {
    retryable: true,
  });
}
