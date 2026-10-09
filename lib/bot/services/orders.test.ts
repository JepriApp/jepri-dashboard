import { afterEach, describe, expect, it } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import {
  cleanupCustomerOrders,
  withNoActivePlan,
  withSingleActivePlan,
} from "@/lib/bot/test-fixtures";
import { searchCatalog } from "@/lib/bot/services/products";
import { cancelOrder, createOrder, getCurrentOrder, updateOrder } from "@/lib/bot/services/orders";
import { BotServiceError } from "@/lib/bot/errors";

// Cliente de prueba de la Tarea 1 (customer.whatsapp_id=8703567026), en staging.
const TEST_CUSTOMER_ID = "28679e91-8caa-45f4-b5f5-3ed04f9decf9";

async function getTomatoProductId(): Promise<string> {
  const supabase = createTestSupabaseClient();
  const [group] = await searchCatalog(supabase, "tomate", 1);
  return group.variants[0].product_id;
}

afterEach(async () => {
  await cleanupCustomerOrders(TEST_CUSTOMER_ID);
});

describe("getCurrentOrder", () => {
  it("devuelve null cuando el cliente no tiene pedido activo", async () => {
    const supabase = createTestSupabaseClient();
    const result = await getCurrentOrder(supabase, TEST_CUSTOMER_ID);
    expect(result).toBeNull();
  });
});

describe("camino feliz: crear -> ver -> modificar -> cancelar", () => {
  it("createOrder, getCurrentOrder, updateOrder y cancelOrder funcionan de punta a punta", async () => {
    await withSingleActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const tomatoId = await getTomatoProductId();

      const created = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomatoId, required_quantity: 3 },
      ]);
      expect(created.order_id).toBeTruthy();
      expect(created.order_code).toBeTruthy();

      const afterCreate = await getCurrentOrder(supabase, TEST_CUSTOMER_ID);
      expect(afterCreate?.order_id).toBe(created.order_id);
      expect(afterCreate?.status).toBe("pending");
      expect(afterCreate?.items).toEqual([
        { product_id: tomatoId, required_quantity: 3 },
      ]);

      await updateOrder(supabase, created.order_id, TEST_CUSTOMER_ID, [
        { product_id: tomatoId, required_quantity: 5 },
      ]);
      const afterUpdate = await getCurrentOrder(supabase, TEST_CUSTOMER_ID);
      expect(afterUpdate?.items).toEqual([
        { product_id: tomatoId, required_quantity: 5 },
      ]);

      await cancelOrder(supabase, created.order_id, TEST_CUSTOMER_ID);
      const afterCancel = await getCurrentOrder(supabase, TEST_CUSTOMER_ID);
      expect(afterCancel).toBeNull();
    });
  });
});

describe("mapeo de errores de negocio a BotServiceError", () => {
  it("createOrder sin plan activo lanza BotServiceError(NO_ACTIVE_PLAN)", async () => {
    await withNoActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      await expect(createOrder(supabase, TEST_CUSTOMER_ID, [])).rejects.toMatchObject({
        code: "NO_ACTIVE_PLAN",
      });
    });
  });

  it("createOrder con un pedido ya activo lanza BotServiceError(ORDER_ALREADY_EXISTS)", async () => {
    await withSingleActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const tomatoId = await getTomatoProductId();
      await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomatoId, required_quantity: 1 },
      ]);
      await expect(createOrder(supabase, TEST_CUSTOMER_ID, [])).rejects.toMatchObject({
        code: "ORDER_ALREADY_EXISTS",
      });
    });
  });

  it("updateOrder sobre un order_id inexistente lanza BotServiceError(ORDER_NOT_FOUND)", async () => {
    const supabase = createTestSupabaseClient();
    const error = await updateOrder(
      supabase,
      "00000000-0000-0000-0000-000000000000",
      TEST_CUSTOMER_ID,
      [],
    ).catch((e) => e);
    expect(error).toBeInstanceOf(BotServiceError);
    expect(error.code).toBe("ORDER_NOT_FOUND");
  });

  it("cancelOrder sobre un order_id inexistente lanza BotServiceError(ORDER_NOT_FOUND)", async () => {
    const supabase = createTestSupabaseClient();
    await expect(
      cancelOrder(supabase, "00000000-0000-0000-0000-000000000000", TEST_CUSTOMER_ID),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("cancelar un pedido ya cancelado lanza BotServiceError(ORDER_NOT_CANCELLABLE)", async () => {
    await withSingleActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const tomatoId = await getTomatoProductId();
      const created = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomatoId, required_quantity: 1 },
      ]);
      await cancelOrder(supabase, created.order_id, TEST_CUSTOMER_ID);
      await expect(cancelOrder(supabase, created.order_id, TEST_CUSTOMER_ID)).rejects.toMatchObject({
        code: "ORDER_NOT_CANCELLABLE",
      });
    });
  });
});
