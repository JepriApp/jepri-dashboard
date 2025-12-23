import { SupabaseClient } from "@supabase/supabase-js";

export async function listProducts(supabaseClient: SupabaseClient) {
  const { data, error } = await supabaseClient
    .from("product")
    .select("id, name, unit, reference_price")
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}
