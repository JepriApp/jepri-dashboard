import { SupabaseClient } from "@supabase/supabase-js";

export async function listCustomers(supabaseClient: SupabaseClient) {
      const { data, error } = await supabaseClient
        .from("customer")
        .select(
          `
          id,
          name,
          phone,
          contact,
          identification_type,
          identification_number
        `
        )
        .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}