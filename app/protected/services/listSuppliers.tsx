import { SupabaseClient } from "@supabase/supabase-js";

export async function listSuppliers(supabaseClient: SupabaseClient) {
  const { data, error } = await supabaseClient
    .from("supplier")
    .select(
      `
          id,
          name,
          contact,
          phone,
          user_id
        `
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}
