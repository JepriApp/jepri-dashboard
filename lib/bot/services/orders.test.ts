import { afterEach, describe, expect, it } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import {
  cleanupCustomerOrders,
  withNoActivePlan,
  withSingleActivePlan,
} from "@/lib/bot/test-fixtures";
import { searchCatalog } from "@/lib/bot/services/products";
import { cancelOrder, createOrder, getCurrentOrders, updateOrder } from "@/lib/bot/services/orders";
import { BotServiceError } from "@/lib/bot/errors";

// Cliente de prueba de la Tarea 1 (customer.whatsapp_id=8703567026), en staging.
const TEST_CUSTOMER_ID = "28679e91-8caa-45f4-b5f5-3ed04f9decf9";

async function getTomatoProduct(): Promise<{ product_id: string; product_name: string; unit: string }> {
  const supabase = createTestSupabaseClient();
  const [group] = await searchCatalog(supabase, "tomate", 1);
  const variant = group.variants[0];
  return { product_id: variant.product_id, product_name: group.canonical_name, unit: variant.unit };
}

afterEach(async () => {
  await cleanupCustomerOrders(TEST_CUSTOMER_ID);
});

describe("getCurrentOrders", () => {
  it("devuelve una lista vacía cuando el cliente no tiene pedidos activos", async () => {
    const supabase = createTestSupabaseClient();
    const result = await getCurrentOrders(supabase, TEST_CUSTOMER_ID);
    expect(result).toEqual([]);
  });
});

describe("camino feliz: crear -> ver -> modificar -> cancelar", () => {
  it("createOrder, getCurrentOrders, updateOrder y cancelOrder funcionan de punta a punta", async () => {
    await withSingleActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const tomato = await getTomatoProduct();

      const created = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomato.product_id, required_quantity: 3 },
      ]);
      expect(created.order_id).toBeTruthy();
      expect(created.order_code).toBeTruthy();

      const afterCreate = (await getCurrentOrders(supabase, TEST_CUSTOMER_ID))[0];
      expect(afterCreate?.order_id).toBe(created.order_id);
      expect(afterCreate?.status).toBe("pending");
      expect(afterCreate?.items).toEqual([
        { product_id: tomato.product_id, product_name: tomato.product_name, unit: tomato.unit, required_quantity: 3 },
      ]);

      await updateOrder(supabase, created.order_id, TEST_CUSTOMER_ID, [
        { product_id: tomato.product_id, required_quantity: 5 },
      ]);
      const afterUpdate = (await getCurrentOrders(supabase, TEST_CUSTOMER_ID))[0];
      expect(afterUpdate?.items).toEqual([
        { product_id: tomato.product_id, product_name: tomato.product_name, unit: tomato.unit, required_quantity: 5 },
      ]);

      await cancelOrder(supabase, created.order_id, TEST_CUSTOMER_ID);
      const afterCancel = await getCurrentOrders(supabase, TEST_CUSTOMER_ID);
      expect(afterCancel).toEqual([]);
    });
  });
});

describe("varios pedidos el mismo día para el mismo cliente (Tarea 25)", () => {
  it("createOrder permite un segundo pedido, y getCurrentOrders los devuelve en orden de creación", async () => {
    await withSingleActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const tomato = await getTomatoProduct();

      const first = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomato.product_id, required_quantity: 1 },
      ]);
      const second = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomato.product_id, required_quantity: 2 },
      ]);

      expect(second.order_id).not.toBe(first.order_id);

      const orders = await getCurrentOrders(supabase, TEST_CUSTOMER_ID);
      expect(orders.map((o) => o.order_id)).toEqual([first.order_id, second.order_id]);
    });
  });

  it("un reintento idéntico (doble toque en Confirmar) no duplica el pedido", async () => {
    await withSingleActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const tomato = await getTomatoProduct();
      const items = [{ product_id: tomato.product_id, required_quantity: 4 }];

      const [a, b] = await Promise.all([
        createOrder(supabase, TEST_CUSTOMER_ID, items),
        createOrder(supabase, TEST_CUSTOMER_ID, items),
      ]);

      expect(a.order_id).toBe(b.order_id);
      expect(await getCurrentOrders(supabase, TEST_CUSTOMER_ID)).toHaveLength(1);
    });
  });

  it("cancelar uno de varios deja el otro activo", async () => {
    await withSingleActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const tomato = await getTomatoProduct();

      const first = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomato.product_id, required_quantity: 1 },
      ]);
      const second = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomato.product_id, required_quantity: 2 },
      ]);

      await cancelOrder(supabase, first.order_id, TEST_CUSTOMER_ID);

      const orders = await getCurrentOrders(supabase, TEST_CUSTOMER_ID);
      expect(orders.map((o) => o.order_id)).toEqual([second.order_id]);
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
      const tomato = await getTomatoProduct();
      const created = await createOrder(supabase, TEST_CUSTOMER_ID, [
        { product_id: tomato.product_id, required_quantity: 1 },
      ]);
      await cancelOrder(supabase, created.order_id, TEST_CUSTOMER_ID);
      await expect(cancelOrder(supabase, created.order_id, TEST_CUSTOMER_ID)).rejects.toMatchObject({
        code: "ORDER_NOT_CANCELLABLE",
      });
    });
  });
});
