import { describe, expect, it } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import { getFrequentProducts, searchCatalog } from "@/lib/bot/services/products";

// Cliente de prueba de la Tarea 1 (customer.whatsapp_id=8703567026), en staging.
const TEST_CUSTOMER_ID = "28679e91-8caa-45f4-b5f5-3ed04f9decf9";

describe("searchCatalog", () => {
  it("encuentra productos con tilde buscando sin tilde (unaccent)", async () => {
    const supabase = createTestSupabaseClient();
    const results = await searchCatalog(supabase, "pina", 20);
    expect(results.some((r) => r.canonical_name.startsWith("Piña"))).toBe(true);
  });

  it("sin resultados devuelve un array vacío, no lanza", async () => {
    const supabase = createTestSupabaseClient();
    const results = await searchCatalog(supabase, "producto-que-no-existe-xyz-123");
    expect(results).toEqual([]);
  });

  it("cada grupo trae al menos una variante con product_id/unit/reference_price", async () => {
    const supabase = createTestSupabaseClient();
    const results = await searchCatalog(supabase, "tomate", 5);
    expect(results.length).toBeGreaterThan(0);
    for (const group of results) {
      expect(group.variants.length).toBeGreaterThan(0);
      expect(group.variants[0]).toHaveProperty("product_id");
      expect(group.variants[0]).toHaveProperty("unit");
      expect(group.variants[0]).toHaveProperty("reference_price");
    }
  });
});

describe("getFrequentProducts", () => {
  it("para un cliente sin historial devuelve un array vacío, no lanza", async () => {
    const supabase = createTestSupabaseClient();
    const results = await getFrequentProducts(supabase, TEST_CUSTOMER_ID);
    expect(results).toEqual([]);
  });
});
