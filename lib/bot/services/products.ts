import { Database } from "@/database.types";
import { SupabaseClient } from "@supabase/supabase-js";

export type ProductVariant = {
  product_id: string;
  unit: string;
  reference_price: number | null;
};

export type CatalogGroup = {
  canonical_group_id: string;
  canonical_name: string;
  variants: ProductVariant[];
};

export type FrequentProduct = CatalogGroup & {
  times_ordered: number;
};

/**
 * Hasta `limit` productos (agrupados por variante de unidad) más pedidos por ese
 * cliente — el acceso rápido al entrar a "Crear pedido" (documentacion/chatbot_diseno.md
 * §5.1). Nunca lanza por falta de resultados: un cliente sin historial recibe [].
 */
export async function getFrequentProducts(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  limit = 8,
): Promise<FrequentProduct[]> {
  const { data, error } = await supabaseClient.rpc("bot_get_frequent_products", {
    p_customer_id: customerId,
    p_limit: limit,
  });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    canonical_group_id: row.canonical_group_id,
    canonical_name: row.canonical_name,
    variants: (row.variants ?? []) as ProductVariant[],
    times_ordered: row.times_ordered,
  }));
}

/**
 * Búsqueda por texto sobre el catálogo completo (sin filtrar disponibilidad),
 * agrupada por variante de unidad — nunca se lista el catálogo completo de una sola
 * vez (§5.1).
 */
export async function searchCatalog(
  supabaseClient: SupabaseClient<Database>,
  query: string,
  limit = 8,
): Promise<CatalogGroup[]> {
  const { data, error } = await supabaseClient.rpc("bot_search_catalog", {
    p_query: query,
    p_limit: limit,
  });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    canonical_group_id: row.canonical_group_id,
    canonical_name: row.canonical_name,
    variants: (row.variants ?? []) as ProductVariant[],
  }));
}
