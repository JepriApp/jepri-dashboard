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
  /**
   * Cuántos botones de `buttons` va en cada fila sucesiva (ej. `[5]` = los 5 juntos en
   * una sola fila; `[2, 3]` = 2 en la primera fila, 3 en la segunda). La suma de
   * `buttonRows` debe calzar con `buttons.length`. Sin especificar, cada botón va en su
   * propia fila (comportamiento de siempre) — cada adaptador decide cómo traducir esto
   * a su propio formato de botones.
   */
  buttonRows?: number[];
}

export interface ChannelAdapter {
  parseInbound(rawPayload: unknown): InboundMessage;
  sendMessage(externalId: string, message: BotMessage): Promise<void>;
}
