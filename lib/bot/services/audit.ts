import { Database, Json } from "@/database.types";
import { BotServiceError } from "@/lib/bot/errors";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Acciones de dominio auditadas (§10) — las únicas 4 que pide la Tarea 19. No
 * incluye lecturas sin efecto como "ver pedido" o "productos frecuentes".
 */
export type InteractionAction = "create_order" | "update_order" | "cancel_order" | "search";

export type InteractionLogEntry = {
  customer_id: string | null;
  channel: string;
  action: InteractionAction;
  payload: unknown;
  result: unknown;
};

/**
 * Inserta una fila de auditoría en bot_interaction_log (§10) — "¿por qué se creó/
 * canceló este pedido?" sin depender de logs efímeros. Nunca lanza: un fallo acá
 * (ej. la base caída un instante) no debe impedir que el cliente reciba su respuesta,
 * así que cualquier error solo se deja en consola.
 */
export async function logInteraction(
  supabaseClient: SupabaseClient<Database>,
  entry: InteractionLogEntry,
): Promise<void> {
  try {
    const { error } = await supabaseClient.rpc("bot_log_interaction", {
      p_customer_id: entry.customer_id,
      p_channel: entry.channel,
      p_action: entry.action,
      p_payload: entry.payload as Json,
      p_result: entry.result as Json,
    });

    if (error) throw error;
  } catch (error) {
    console.error("bot: fallo al escribir la auditoría de interacción (no se propaga)", error);
  }
}

/** Shape estable para el `result` de una acción que falló — el `code` de
 * BotServiceError si lo es, o "UNKNOWN" para cualquier otro error. */
export function errorResult(error: unknown): { error: string } {
  return { error: error instanceof BotServiceError ? error.code : "UNKNOWN" };
}
