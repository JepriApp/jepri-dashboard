/**
 * Los 8 códigos de error de negocio documentados en documentacion/chatbot_diseno.md
 * (§5/§7). Cada función bot_* de Postgres los antepone a su RAISE EXCEPTION, separados
 * por ":" del mensaje legible (ej. "PAST_CUTOFF: ya pasó la hora límite de hoy").
 */
export const BOT_ERROR_CODES = [
  "NO_ACTIVE_PLAN",
  "PAST_CUTOFF",
  "ORDER_ALREADY_EXISTS",
  "ORDER_NOT_FOUND",
  "ORDER_NOT_EDITABLE",
  "ORDER_NOT_CANCELLABLE",
  "PLAN_NOT_EDITABLE",
  "PLAN_NOT_CANCELLABLE",
] as const;

export type BotErrorCode = (typeof BOT_ERROR_CODES)[number];

/**
 * Error tipado que la capa de servicio lanza en vez de dejar pasar el error crudo de
 * Postgres/PostgREST. `code` es uno de los 8 códigos conocidos, o "UNKNOWN" si el
 * mensaje no trae ninguno (un error real de infraestructura, no de negocio).
 *
 * `message` conserva el texto original para logs/auditoría/alertas de ops — pero la
 * capa de canal (Tarea 13+) debe traducir SIEMPRE a partir de `code`, nunca mostrar
 * `message` directo en el chat (ver §5/§7 del diseño: nunca se expone el error SQL
 * crudo al cliente).
 */
export class BotServiceError extends Error {
  readonly code: BotErrorCode | "UNKNOWN";

  constructor(code: BotErrorCode | "UNKNOWN", message: string) {
    super(message);
    this.name = "BotServiceError";
    this.code = code;
  }
}

function isBotErrorCode(value: string): value is BotErrorCode {
  return (BOT_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Traduce un error de Postgres/PostgREST (p. ej. el `error` que devuelve
 * supabase-js al llamar una función bot_*) a un BotServiceError. Si el mensaje no
 * trae ninguno de los 8 códigos conocidos antes del primer ":", el resultado queda
 * con code="UNKNOWN" en vez de inventar uno — nunca se asume un código que el
 * mensaje no trae explícito.
 */
export function parsePostgresError(error: { message: string }): BotServiceError {
  const match = /^([A-Z_]+):/.exec(error.message);
  const code = match?.[1];

  if (code && isBotErrorCode(code)) {
    return new BotServiceError(code, error.message);
  }

  return new BotServiceError("UNKNOWN", error.message);
}

/**
 * Distingue un error de negocio esperado (uno de los 8 códigos, ej. PAST_CUTOFF) de uno
 * no controlado (Tarea 20, §10) — "UNKNOWN" cuenta como no controlado: es la etiqueta de
 * `parsePostgresError` para un error real de infraestructura que no trae ninguno de los
 * 8 códigos. Solo los no controlados deben disparar `notifyOps`.
 */
export function isUnexpectedError(error: unknown): boolean {
  return !(error instanceof BotServiceError) || error.code === "UNKNOWN";
}
