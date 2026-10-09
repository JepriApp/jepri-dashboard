import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import { withPrivilegedClient } from "@/lib/bot/test-fixtures";
import { errorResult, logInteraction } from "@/lib/bot/services/audit";
import { BotServiceError } from "@/lib/bot/errors";

// Cliente de prueba de la Tarea 1 (customer.whatsapp_id=8703567026), en staging.
const TEST_CUSTOMER_ID = "28679e91-8caa-45f4-b5f5-3ed04f9decf9";

afterEach(async () => {
  await withPrivilegedClient(async (client) => {
    await client.query("delete from bot_interaction_log where customer_id = $1", [TEST_CUSTOMER_ID]);
  });
});

describe("logInteraction", () => {
  it("inserta exactamente una fila con channel/action/payload/result", async () => {
    const supabase = createTestSupabaseClient();

    await logInteraction(supabase, {
      customer_id: TEST_CUSTOMER_ID,
      channel: "telegram",
      action: "create_order",
      payload: { items: [{ product_id: "p1", required_quantity: 3 }] },
      result: { order_id: "order-test", order_code: "9999" },
    });

    const rows = await withPrivilegedClient(
      (client) =>
        client.query(
          "select channel, action, payload, result from bot_interaction_log where customer_id = $1",
          [TEST_CUSTOMER_ID],
        ),
    );

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      channel: "telegram",
      action: "create_order",
      result: { order_id: "order-test", order_code: "9999" },
    });
  });

  it("acepta customer_id null sin lanzar (ej. no se pudo resolver el cliente antes de loguear)", async () => {
    const supabase = createTestSupabaseClient();

    await expect(
      logInteraction(supabase, {
        customer_id: null,
        channel: "telegram",
        action: "search",
        payload: { query: "tomate" },
        result: { count: 0 },
      }),
    ).resolves.toBeUndefined();

    await withPrivilegedClient(async (client) => {
      await client.query("delete from bot_interaction_log where customer_id is null and action = 'search'");
    });
  });

  it("nunca lanza, aunque la escritura de auditoría falle — no debe impedir responder al cliente", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingSupabase = {
      rpc: async () => ({ data: null, error: new Error("conexión caída") }),
    } as unknown as Parameters<typeof logInteraction>[0];

    await expect(
      logInteraction(failingSupabase, {
        customer_id: TEST_CUSTOMER_ID,
        channel: "telegram",
        action: "cancel_order",
        payload: { order_id: "order-x" },
        result: { error: "simulado" },
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("errorResult", () => {
  it("devuelve el code de un BotServiceError", () => {
    expect(errorResult(new BotServiceError("PAST_CUTOFF", "PAST_CUTOFF: detalle"))).toEqual({
      error: "PAST_CUTOFF",
    });
  });

  it("devuelve UNKNOWN para cualquier otro error", () => {
    expect(errorResult(new Error("ECONNRESET"))).toEqual({ error: "UNKNOWN" });
  });
});
