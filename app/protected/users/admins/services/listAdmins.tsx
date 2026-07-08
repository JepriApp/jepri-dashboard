import { SupabaseClient } from "@supabase/supabase-js";

export async function listAdmins(supabaseClient: SupabaseClient) {
  const { data, error } = await supabaseClient
    .from("admins_with_auth")
    .select("*")
    .order("auth_created_at", {
      ascending: false,
    });
  if (error) throw error;
  return data || [];
}
