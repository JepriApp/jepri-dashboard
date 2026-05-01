import { SupabaseClient } from "@supabase/supabase-js";
import { ProductWithOffers } from "../page";

export async function listProducts(supabaseClient: SupabaseClient) {
  const { data, error } = await supabaseClient
    .from("product")
    .select(
      `id, name, description, unit, reference_price, main_photo, siigo_id,
           offers:offer(id, price, available, supplier:supplier_id(id, name, phone))`
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((p) => ({  //BUG: Aqui se usa offer. Replantear el uso
    ...p,
    offers: (p.offers || []).map((o) => {
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
