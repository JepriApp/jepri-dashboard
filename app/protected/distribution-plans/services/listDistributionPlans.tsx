import { SupabaseClient } from "@supabase/supabase-js";

export async function listDistributionPlans(supabaseClient: SupabaseClient) {
      const { data, error } = await supabaseClient
        .from("distribution_plan")
        .select("id, plan_code, plan_date, status, notes, created_at")
        .order("plan_date", { ascending: true });
  if (error) throw error;
  return data || [];
}