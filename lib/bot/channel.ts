/**
 * Contrato de desacoplamiento de canal (documentacion/chatbot_diseno.md §6). Nada
 * aquí sabe de Telegram ni de WhatsApp — el dominio del bot (Tarea 13+) solo habla
 * con estos 3 tipos; cada adaptador concreto (lib/bot/adapters/*.ts) los implementa.
 */

export interface InboundMessage {
  channel: "telegram" | "whatsapp";
  externalId: string;
  text: string;
  callbackData?: string;
}

export interface BotMessage {
  text: string;
  buttons?: { label: string; value: string }[];
}

export interface ChannelAdapter {
  parseInbound(rawPayload: unknown): InboundMessage;
  sendMessage(externalId: string, message: BotMessage): Promise<void>;
}
