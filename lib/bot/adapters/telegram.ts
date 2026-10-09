import { BotMessage, ChannelAdapter, InboundMessage } from "@/lib/bot/channel";

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  date: number;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está seteada.");
  return token;
}

function getOpsChatId(): string {
  const chatId = process.env.TELEGRAM_OPS_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_OPS_CHAT_ID no está seteada.");
  return chatId;
}

/**
 * Traduce un update de la Bot API de Telegram a InboundMessage (§6). Soporta
 * mensajes de texto (`update.message`) y botones inline (`update.callback_query`,
 * donde el chat se resuelve desde `callback_query.message.chat`, no desde `from` —
 * es el chat donde se mostró el botón, que es a donde hay que responder). Cualquier
 * otro tipo de update (edited_message, my_chat_member, etc.) no es soportado y
 * lanza — el webhook (Tarea 12) debe decidir cómo tratarlo (p. ej. ack sin acción).
 */
export function parseInbound(rawPayload: unknown): InboundMessage {
  const update = rawPayload as TelegramUpdate;

  if (update.message) {
    return {
      channel: "telegram",
      externalId: String(update.message.chat.id),
      text: update.message.text ?? "",
    };
  }

  if (update.callback_query) {
    const { message, data } = update.callback_query;
    if (!message) {
      throw new Error(
        "callback_query de Telegram sin message.chat — no se puede resolver a qué chat responder",
      );
    }
    return {
      channel: "telegram",
      externalId: String(message.chat.id),
      text: "",
      callbackData: data,
    };
  }

  throw new Error(
    "Update de Telegram no soportado (ni message ni callback_query) — ignorar, no es un error de negocio",
  );
}

/** Agrupa `buttons` en filas según `rowSizes` (ej. `[5]` -> todos juntos en una fila,
 * `[2, 3]` -> 2 y después 3); sin especificar, un botón por fila. */
function chunkIntoRows<T>(items: T[], rowSizes?: number[]): T[][] {
  if (!rowSizes) return items.map((item) => [item]);

  const rows: T[][] = [];
  let index = 0;
  for (const size of rowSizes) {
    rows.push(items.slice(index, index + size));
    index += size;
  }
  return rows;
}

/**
 * Envía un mensaje vía la Bot API. `message.buttons` se traduce a un teclado inline —
 * un botón por fila salvo que `message.buttonRows` agrupe varios en la misma fila (sin
 * botones, es un mensaje de texto plano).
 */
export async function sendMessage(externalId: string, message: BotMessage): Promise<void> {
  const token = getBotToken();

  const body: {
    chat_id: string;
    text: string;
    reply_markup?: { inline_keyboard: { text: string; callback_data: string }[][] };
  } = {
    chat_id: externalId,
    text: message.text,
  };

  if (message.buttons && message.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: chunkIntoRows(message.buttons, message.buttonRows).map((row) =>
        row.map((button) => ({ text: button.label, callback_data: button.value })),
      ),
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Telegram sendMessage falló (${response.status}): ${errorBody}`);
  }
}

/**
 * Alerta de fallos (§10) — reusa sendMessage hacia el chat interno de operaciones,
 * cero infraestructura nueva. Solo para errores no controlados (Tarea 19 decide
 * cuándo llamarla); nunca para los 8 códigos de error de negocio esperados.
 */
export async function notifyOps(message: string): Promise<void> {
  await sendMessage(getOpsChatId(), { text: message });
}

export const telegramAdapter: ChannelAdapter = {
  parseInbound,
  sendMessage,
};
