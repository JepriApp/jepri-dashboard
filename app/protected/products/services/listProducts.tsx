import { SupabaseClient } from "@supabase/supabase-js";
import { ProductWithOffers } from "../page";

export async function listProducts(supabaseClient: SupabaseClient) {
  const { data, error } = await supabaseClient
    .from("product_with_active_offers")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data || []).map((p) => ({
    //BUG: Aqui se usa offer. Replantear el uso
    ...p,
    offers: (p.offers || []).map((o: { supplier: unknown[]; }) => {
      const supplierObj = Array.isArray(o.supplier)
        ? o.supplier[0]
        : o.supplier;
      return {
        ...o,
        supplier: supplierObj || null,
      };
    }),
  })) as ProductWithOffers[];
}
