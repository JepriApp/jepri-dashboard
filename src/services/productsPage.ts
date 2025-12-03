import { SupabaseClient } from "@supabase/supabase-js";

export type SupplierMinimal = {
  id: string;
  name: string;
  phone?: string | null;
};

export type OfferWithSupplier = {
  id: string;
  price: number;
  available: boolean;
  supplier: SupplierMinimal | null;
};

export interface ProductWithOffers {
  id: string;
  name: string;
  description?: string | null;
  unit: string;
  reference_price?: number | null;
  main_photo?: string | null;
  offers?: OfferWithSupplier[];
}

export async function getProductsWithOffers(
  supabase: SupabaseClient
): Promise<ProductWithOffers[]> {
  const { data, error } = await supabase
    .from("product")
    .select(
      `id, name, description, unit, reference_price, main_photo,
       offers:offer(id, price, available, supplier:supplier_id(id, name, phone))`
    )
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((p: any) => ({
    ...p,
    offers: (p.offers || []).map((o: any) => {
      const supplierObj = Array.isArray(o.supplier)
        ? o.supplier[0]
        : o.supplier;
      return {
        ...o,
        supplier: supplierObj || null,
      } as OfferWithSupplier;
    }),
  })) as ProductWithOffers[];
}
