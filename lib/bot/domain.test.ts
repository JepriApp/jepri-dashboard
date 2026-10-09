import { describe, expect, it, vi } from "vitest";
import { handleInboundMessage } from "@/lib/bot/domain";
import { getActivePlanStatus } from "@/lib/bot/services/plan";
import { getCurrentOrder } from "@/lib/bot/services/orders";

vi.mock("@/lib/bot/services/plan", () => ({
  getActivePlanStatus: vi.fn(),
}));
vi.mock("@/lib/bot/services/orders", () => ({
  getCurrentOrder: vi.fn(),
}));

const mockGetActivePlanStatus = vi.mocked(getActivePlanStatus);
const mockGetCurrentOrder = vi.mocked(getCurrentOrder);

// El cliente Supabase nunca se usa de verdad acá — getActivePlanStatus/getCurrentOrder
// están mockeados — así que un objeto vacío alcanza para satisfacer el tipo.
const fakeSupabase = {} as Parameters<typeof handleInboundMessage>[0];
const customer = { customer_id: "cust-1", name: "Ryuma" };

describe("handleInboundMessage", () => {
  it("sin plan activo responde que no hay ventana de pedidos, sin importar el mensaje", async () => {
    mockGetActivePlanStatus.mockResolvedValue(null);

    const result = await handleInboundMessage(fakeSupabase, customer, { text: "hola" });

    expect(result.text).toMatch(/no hay ventana de pedidos activa/i);
    expect(result.buttons).toBeUndefined();
    expect(mockGetCurrentOrder).not.toHaveBeenCalled();
  });

  it("con plan activo pero fuera de horario, responde que no hay ventana activa", async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: false,
    });

    const result = await handleInboundMessage(fakeSupabase, customer, { text: "hola" });

    expect(result.text).toMatch(/no hay ventana de pedidos activa/i);
  });

  it("dentro de la ventana, sin callback, muestra el Menú Principal con las 3 opciones", async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: true,
    });

    const result = await handleInboundMessage(fakeSupabase, customer, { text: "hola" });

    expect(result.text).toContain("Ryuma");
    expect(result.buttons).toHaveLength(3);
    expect(result.buttons?.map((b) => b.value)).toEqual([
      "menu:create_order",
      "menu:view_order",
      "menu:cancel_order",
    ]);
  });

  it("el saludo del menú no revienta si el cliente no tiene name", async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: true,
    });

    const result = await handleInboundMessage(
      fakeSupabase,
      { customer_id: "cust-1", name: null },
      { text: "hola" },
    );

    expect(result.text).toMatch(/^¡Hola!/);
  });

  it('"Ver pedido" sin pedido activo invita a crear uno', async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: true,
    });
    mockGetCurrentOrder.mockResolvedValue(null);

    const result = await handleInboundMessage(fakeSupabase, customer, {
      text: "",
      callbackData: "menu:view_order",
    });

    expect(result.text).toMatch(/no tienes ningún pedido activo/i);
  });

  it('"Ver pedido" con un pedido activo muestra su código, estado y cantidad de productos', async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: true,
    });
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
      text: "",
      callbackData: "menu:view_order",
    });

    expect(result.text).toContain("1326");
    expect(result.text).toContain("pendiente");
    expect(result.text).toContain("2 productos");
  });

  it('"Ver pedido" con un solo producto usa el singular', async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: true,
    });
    mockGetCurrentOrder.mockResolvedValue({
      order_id: "order-1",
      order_code: "1327",
      status: "pending",
      items: [{ product_id: "p1", required_quantity: 3 }],
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      text: "",
      callbackData: "menu:view_order",
    });

    expect(result.text).toContain("1 producto");
    expect(result.text).not.toContain("1 productos");
  });

  it('"Crear pedido" todavía responde que no está disponible (Tarea 15)', async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: true,
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      text: "",
      callbackData: "menu:create_order",
    });

    expect(result.text).toMatch(/todavía no está disponible/i);
  });

  it('"Cancelar pedido" todavía responde que no está disponible (Tarea 17)', async () => {
    mockGetActivePlanStatus.mockResolvedValue({
      plan_id: "plan-1",
      plan_date: "2026-10-10",
      is_within_cutoff: true,
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      text: "",
      callbackData: "menu:cancel_order",
    });

    expect(result.text).toMatch(/todavía no está disponible/i);
  });
});
