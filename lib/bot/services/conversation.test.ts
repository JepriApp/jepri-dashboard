import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import { withPrivilegedClient } from "@/lib/bot/test-fixtures";
import {
  getConversationState,
  IDLE_STATE,
  resetConversationState,
  setConversationState,
} from "@/lib/bot/services/conversation";

// Cliente de prueba de la Tarea 1 (customer.whatsapp_id=8703567026), en staging.
const CUSTOMER_ID = "28679e91-8caa-45f4-b5f5-3ed04f9decf9";

afterEach(async () => {
  vi.useRealTimers();
  await withPrivilegedClient(async (client) => {
    await client.query("delete from bot_conversation_state where customer_id = $1", [CUSTOMER_ID]);
  });
});

describe("getConversationState", () => {
  it("sin ninguna fila guardada devuelve idle con contexto vacío", async () => {
    const supabase = createTestSupabaseClient();
    const result = await getConversationState(supabase, CUSTOMER_ID, "telegram");
    expect(result).toEqual({ state: IDLE_STATE, context: {} });
  });
});

describe("setConversationState / getConversationState", () => {
  it("persiste una transición con su context", async () => {
    const supabase = createTestSupabaseClient();
    await setConversationState(supabase, CUSTOMER_ID, "telegram", "awaiting_quantity", {
      product_id: "p1",
    });

    const result = await getConversationState(supabase, CUSTOMER_ID, "telegram");
    expect(result).toEqual({ state: "awaiting_quantity", context: { product_id: "p1" } });
  });

  it("una segunda transición sobreescribe la anterior, no acumula historial", async () => {
    const supabase = createTestSupabaseClient();
    await setConversationState(supabase, CUSTOMER_ID, "telegram", "awaiting_unit", { a: 1 });
    await setConversationState(supabase, CUSTOMER_ID, "telegram", "awaiting_quantity", { b: 2 });

    const result = await getConversationState(supabase, CUSTOMER_ID, "telegram");
    expect(result).toEqual({ state: "awaiting_quantity", context: { b: 2 } });

    const rowCount = await withPrivilegedClient(async (client) => {
      const { rows } = await client.query(
        "select count(*)::int as n from bot_conversation_state where customer_id = $1",
        [CUSTOMER_ID],
      );
      return rows[0].n;
    });
    expect(rowCount).toBe(1);
  });

  it("canales distintos del mismo cliente no se mezclan entre sí", async () => {
    const supabase = createTestSupabaseClient();
    await setConversationState(supabase, CUSTOMER_ID, "telegram", "awaiting_quantity", {});

    const whatsappState = await getConversationState(supabase, CUSTOMER_ID, "whatsapp");
    expect(whatsappState).toEqual({ state: IDLE_STATE, context: {} });

    await withPrivilegedClient(async (client) => {
      await client.query("delete from bot_conversation_state where channel = 'whatsapp' and customer_id = $1", [
        CUSTOMER_ID,
      ]);
    });
  });
});

describe("expiración por inactividad (15 min)", () => {
  it("una conversación con más de 15 minutos de inactividad vuelve a idle", async () => {
    const supabase = createTestSupabaseClient();
    const realNow = Date.now();

    await setConversationState(supabase, CUSTOMER_ID, "telegram", "awaiting_quantity", {
      product_id: "p1",
    });

    // Solo se congela Date — setTimeout/red siguen reales, así que el round-trip a
    // staging de getConversationState (justo abajo) no se queda colgado.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(realNow + 16 * 60 * 1000);

    const result = await getConversationState(supabase, CUSTOMER_ID, "telegram");
    expect(result).toEqual({ state: IDLE_STATE, context: {} });
  });

  it("a los 14 minutos todavía NO expira (control: el límite es real, no siempre idle)", async () => {
    const supabase = createTestSupabaseClient();
    const realNow = Date.now();

    await setConversationState(supabase, CUSTOMER_ID, "telegram", "awaiting_quantity", {
      product_id: "p1",
    });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(realNow + 14 * 60 * 1000);

    const result = await getConversationState(supabase, CUSTOMER_ID, "telegram");
    expect(result).toEqual({ state: "awaiting_quantity", context: { product_id: "p1" } });
  });
});

describe("resetConversationState", () => {
  it("reinicia a idle con contexto vacío", async () => {
    const supabase = createTestSupabaseClient();
    await setConversationState(supabase, CUSTOMER_ID, "telegram", "awaiting_quantity", { x: 1 });

    await resetConversationState(supabase, CUSTOMER_ID, "telegram");

    const result = await getConversationState(supabase, CUSTOMER_ID, "telegram");
    expect(result).toEqual({ state: IDLE_STATE, context: {} });
  });
});
