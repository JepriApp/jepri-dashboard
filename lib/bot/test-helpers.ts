import { Database } from "@/database.types";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para tests (Vitest) — usa la misma anon key que el bot usa en
 * producción (sin service_role), apuntando siempre a NEXT_PUBLIC_SUPABASE_URL de
 * .env.local, que en este proyecto es el self-hosted de staging (10.85.96.51), nunca
 * Neptuno. No usa lib/supabase/server.ts porque ese requiere cookies() de un request
 * de Next.js, que no existe fuera de un server component/route handler.
 */
export function createTestSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no están seteadas — revisa .env.local.",
    );
  }

  return createClient<Database>(url, key);
}
