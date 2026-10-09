import { Database } from "@/database.types";
import { parsePostgresError } from "@/lib/bot/errors";
import { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export type ResolvedCustomer = {
  customer_id: string;
  name: string | null;
};

/**
 * Resuelve la whitelist (§2): busca un customer por su whatsapp_id/external_id de
 * canal (chat_id de Telegram, etc). Sin match devuelve null — nunca lanza; el
 * llamador debe ignorar el mensaje en silencio, no responder nada (tal como pide
 * la spec: nada de interacción con desconocidos).
 */
export async function resolveCustomer(
  supabaseClient: SupabaseClient<Database>,
  externalId: string,
): Promise<ResolvedCustomer | null> {
  const { data, error } = await supabaseClient.rpc("bot_resolve_customer", {
    p_external_id: externalId,
  });

  if (error) throw parsePostgresError(error);

  const row = data?.[0];
  if (!row) return null;

  return { customer_id: row.customer_id, name: row.name };
}

/**
 * sha256 en hex — misma función que usa tanto validateApiKey como (Tarea 20) el
 * script que genera una API key nueva, para que el hash que se guarda en
 * bot_api_key.key_hash sea siempre el mismo que se valida acá.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Valida una API key de un adaptador de canal fuera de proceso (§4.1). Nunca compara
 * el valor en texto plano: solo su hash sha256 llega a la base, contra
 * bot_api_key.key_hash (que tampoco guarda el valor en texto plano).
 */
export async function validateApiKey(
  supabaseClient: SupabaseClient<Database>,
  rawKey: string,
): Promise<boolean> {
  const { data, error } = await supabaseClient.rpc("bot_validate_api_key", {
    p_key_hash: hashApiKey(rawKey),
  });

  if (error) throw parsePostgresError(error);

  return data ?? false;
}
