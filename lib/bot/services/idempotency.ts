import { Database } from "@/database.types";
import { parsePostgresError } from "@/lib/bot/errors";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Marca (channel, update_id) como procesado (§9) — dedupe de reintentos del webhook
 * antes de llamar cualquier otro servicio. true = primera vez (seguir procesando),
 * false = ya existía (responder 200 sin reprocesar, no llamar nada más).
 */
export async function markUpdateProcessed(
  supabaseClient: SupabaseClient<Database>,
  channel: string,
  updateId: string,
): Promise<boolean> {
  const { data, error } = await supabaseClient.rpc("bot_mark_update_processed", {
    p_channel: channel,
    p_update_id: updateId,
  });

  if (error) throw parsePostgresError(error);

  return data ?? false;
}
