import { describe, expect, it, vi } from "vitest";
import { handleInboundMessage } from "@/lib/bot/domain";
import { getActivePlanStatus } from "@/lib/bot/services/plan";
import { getCurrentOrder } from "@/lib/bot/services/orders";
import { resetConversationState } from "@/lib/bot/services/conversation";

vi.mock("@/lib/bot/services/plan", () => ({
  getActivePlanStatus: vi.fn(),
}));
vi.mock("@/lib/bot/services/orders", () => ({
  getCurrentOrder: vi.fn(),
}));
vi.mock("@/lib/bot/services/conversation", () => ({
  resetConversationState: vi.fn(),
}));

const mockGetActivePlanStatus = vi.mocked(getActivePlanStatus);
const mockGetCurrentOrder = vi.mocked(getCurrentOrder);
const mockResetConversationState = vi.mocked(resetConversationState);

// El cliente Supabase nunca se usa de verdad acá — todos los servicios que lo usan
// están mockeados — así que un objeto vacío alcanza para satisfacer el tipo.
const fakeSupabase = {} as Parameters<typeof handleInboundMessage>[0];
const customer = { customer_id: "cust-1", name: "Ryuma" };
const ACTIVE_WINDOW = { plan_id: "plan-1", plan_date: "2026-10-10", is_within_cutoff: true };

describe("handleInboundMessage", () => {
  it("sin plan activo responde que no hay ventana de pedidos, sin importar el mensaje", async () => {
    mockGetActivePlanStatus.mockResolvedValue(null);

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "hola",
    });

    expect(result.text).toMatch(/no hay ventana de pedidos activa/i);
    expect(result.buttons).toBeUndefined();
    expect(mockGetCurrentOrder).not.toHaveBeenCalled();
  });

  it("con plan activo pero fuera de horario, responde que no hay ventana activa", async () => {
    mockGetActivePlanStatus.mockResolvedValue({ ...ACTIVE_WINDOW, is_within_cutoff: false });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "hola",
    });

    expect(result.text).toMatch(/no hay ventana de pedidos activa/i);
  });

  it("dentro de la ventana, sin callback, muestra el Menú Principal con las 3 opciones", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "hola",
    });

    expect(result.text).toContain("Ryuma");
    expect(result.buttons).toHaveLength(3);
    expect(result.buttons?.map((b) => b.value)).toEqual([
      "menu:create_order",
      "menu:view_order",
      "menu:cancel_order",
    ]);
  });

  it("el saludo del menú no revienta si el cliente no tiene name", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);

    const result = await handleInboundMessage(
      fakeSupabase,
      { customer_id: "cust-1", name: null },
      { channel: "telegram", text: "hola" },
    );

    expect(result.text).toMatch(/^¡Hola!/);
  });

  it('"Ver pedido" sin pedido activo invita a crear uno', async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetCurrentOrder.mockResolvedValue(null);

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "menu:view_order",
    });

    expect(result.text).toMatch(/no tienes ningún pedido activo/i);
  });

  it('"Ver pedido" con un pedido activo muestra su código, estado y cantidad de productos', async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetCurrentOrder.mockResolvedValue({
      order_id: "order-1",
      order_code: "1326",
      status: "pending",
      items: [
        { product_id: "p1", required_quantity: 3 },
        { product_id: "p2", required_quantity: 1 },
      ],
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "menu:view_order",
    });

    expect(result.text).toContain("1326");
    expect(result.text).toContain("pendiente");
    expect(result.text).toContain("2 productos");
  });

  it('"Ver pedido" con un solo producto usa el singular', async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetCurrentOrder.mockResolvedValue({
      order_id: "order-1",
      order_code: "1327",
      status: "pending",
      items: [{ product_id: "p1", required_quantity: 3 }],
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "menu:view_order",
    });

    expect(result.text).toContain("1 producto");
    expect(result.text).not.toContain("1 productos");
  });

  it('"Crear pedido" todavía responde que no está disponible (Tarea 15)', async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "menu:create_order",
    });

    expect(result.text).toMatch(/todavía no está disponible/i);
  });

  it('"Cancelar pedido" todavía responde que no está disponible (Tarea 17)', async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "menu:cancel_order",
    });

    expect(result.text).toMatch(/todavía no está disponible/i);
  });
});

describe("handleInboundMessage — estado de conversación (§8, Tarea 14)", () => {
  it("reinicia la conversación a idle para el customer_id y channel correctos, al final de cada turno", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);

    await handleInboundMessage(fakeSupabase, customer, { channel: "telegram", text: "hola" });

    expect(mockResetConversationState).toHaveBeenCalledWith(fakeSupabase, "cust-1", "telegram");
  });

  it("también reinicia cuando no hay ventana activa (abandonar un flujo cuenta igual)", async () => {
    mockGetActivePlanStatus.mockResolvedValue(null);

    await handleInboundMessage(fakeSupabase, customer, { channel: "telegram", text: "hola" });

    expect(mockResetConversationState).toHaveBeenCalledWith(fakeSupabase, "cust-1", "telegram");
  });

  it("no hay fugas de estado entre distintos clientes — cada uno reinicia solo el suyo", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    const otherCustomer = { customer_id: "cust-2", name: "Otro" };

    await handleInboundMessage(fakeSupabase, customer, { channel: "telegram", text: "hola" });
    await handleInboundMessage(fakeSupabase, otherCustomer, { channel: "telegram", text: "hola" });

    expect(mockResetConversationState).toHaveBeenNthCalledWith(1, fakeSupabase, "cust-1", "telegram");
    expect(mockResetConversationState).toHaveBeenNthCalledWith(2, fakeSupabase, "cust-2", "telegram");
  });
});
