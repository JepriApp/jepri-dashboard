import { Database, Json } from "@/database.types";
import { parsePostgresError } from "@/lib/bot/errors";
import { SupabaseClient } from "@supabase/supabase-js";

export const IDLE_STATE = "idle";

const EXPIRATION_MS = 15 * 60 * 1000;

export type ConversationContext = Record<string, Json>;

export type ConversationState = {
  state: string;
  context: ConversationContext;
};

const IDLE: ConversationState = { state: IDLE_STATE, context: {} };

/**
 * Lee el estado de conversación (§8). Si no hay ninguna fila guardada, o si la
 * última actualización tiene más de 15 minutos, devuelve 'idle' con contexto vacío
 * — una conversación abandonada a medias se trata como si nunca hubiera empezado,
 * en vez de quedar atascada en un paso viejo.
 */
export async function getConversationState(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  channel: string,
): Promise<ConversationState> {
  const { data, error } = await supabaseClient.rpc("bot_get_conversation_state", {
    p_customer_id: customerId,
    p_channel: channel,
  });

  if (error) throw parsePostgresError(error);

  const row = data?.[0];
  if (!row) return IDLE;

  const updatedAtMs = new Date(row.updated_at).getTime();
  if (Date.now() - updatedAtMs > EXPIRATION_MS) {
    return IDLE;
  }

  return { state: row.state, context: (row.context ?? {}) as ConversationContext };
}

/**
 * Persiste una transición de estado (§8) — una fila por (customer_id, channel), se
 * sobreescribe en cada paso.
 */
export async function setConversationState(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  channel: string,
  state: string,
  context: ConversationContext = {},
): Promise<void> {
  const { error } = await supabaseClient.rpc("bot_set_conversation_state", {
    p_customer_id: customerId,
    p_channel: channel,
    p_state: state,
    p_context: context,
  });

  if (error) throw parsePostgresError(error);
}

/** Reinicia la conversación a 'idle' con contexto vacío — al terminar o abandonar un flujo. */
export async function resetConversationState(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  channel: string,
): Promise<void> {
  await setConversationState(supabaseClient, customerId, channel, IDLE_STATE, {});
}
