import { Database } from "@/database.types";
import { parsePostgresError } from "@/lib/bot/errors";
import { SupabaseClient } from "@supabase/supabase-js";

export type ActivePlanStatus = {
  plan_id: string;
  plan_date: string;
  is_within_cutoff: boolean;
};

/**
 * Verificación inicial del bot (§7): plan activo (§3.1) + si ahora mismo está
 * dentro del horario de corte (§3.2), ya calculado en la base — null si no hay
 * ningún plan activo en absoluto.
 */
export async function getActivePlanStatus(
  supabaseClient: SupabaseClient<Database>,
): Promise<ActivePlanStatus | null> {
  const { data, error } = await supabaseClient.rpc("bot_get_active_plan_status");

  if (error) throw parsePostgresError(error);

  return data?.[0] ?? null;
}
