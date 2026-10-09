import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleInboundMessage, handleInboundMessageForChannel } from "@/lib/bot/domain";
import { getActivePlanStatus } from "@/lib/bot/services/plan";
import { getCurrentOrder } from "@/lib/bot/services/orders";
import { getConversationState, resetConversationState, setConversationState } from "@/lib/bot/services/conversation";
import { handleCreateOrderStep, startCreateOrderFlow } from "@/lib/bot/flows/createOrder";

vi.mock("@/lib/bot/services/plan", () => ({
  getActivePlanStatus: vi.fn(),
}));
vi.mock("@/lib/bot/services/orders", () => ({
  getCurrentOrder: vi.fn(),
}));
vi.mock("@/lib/bot/services/conversation", () => ({
  IDLE_STATE: "idle",
  getConversationState: vi.fn(),
  setConversationState: vi.fn(),
  resetConversationState: vi.fn(),
}));
vi.mock("@/lib/bot/flows/createOrder", () => ({
  CREATE_FLOW_STATES: {
    CHOOSING_PRODUCT: "create:choosing_product",
    CHOOSING_UNIT: "create:choosing_unit",
    AWAITING_QUANTITY: "create:awaiting_quantity",
    REVIEWING_ORDER: "create:reviewing_order",
  },
  startCreateOrderFlow: vi.fn(),
  handleCreateOrderStep: vi.fn(),
}));

const mockGetActivePlanStatus = vi.mocked(getActivePlanStatus);
const mockGetCurrentOrder = vi.mocked(getCurrentOrder);
const mockGetConversationState = vi.mocked(getConversationState);
const mockSetConversationState = vi.mocked(setConversationState);
const mockResetConversationState = vi.mocked(resetConversationState);
const mockStartCreateOrderFlow = vi.mocked(startCreateOrderFlow);
const mockHandleCreateOrderStep = vi.mocked(handleCreateOrderStep);

// El cliente Supabase nunca se usa de verdad acá — todos los servicios que lo usan
// están mockeados — así que un objeto vacío alcanza para satisfacer el tipo.
const fakeSupabase = {} as Parameters<typeof handleInboundMessage>[0];
const customer = { customer_id: "cust-1", name: "Ryuma" };
const ACTIVE_WINDOW = { plan_id: "plan-1", plan_date: "2026-10-10", is_within_cutoff: true };
const IDLE_CONVERSATION = { state: "idle", context: {} };

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it("dentro de la ventana, en idle, sin callback, muestra el Menú Principal con las 3 opciones", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);

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
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);

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

describe('handleInboundMessage — "Crear pedido" (Tarea 15, dispatch hacia lib/bot/flows/createOrder)', () => {
  it('"🛒 Crear nuevo pedido" arranca el flujo y persiste el estado que devuelve', async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockStartCreateOrderFlow.mockResolvedValue({
      reply: { text: "elige un producto" },
      nextState: "create:choosing_product",
      nextContext: { groups: [] },
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "menu:create_order",
    });

    expect(result.text).toBe("elige un producto");
    expect(mockStartCreateOrderFlow).toHaveBeenCalledWith(fakeSupabase, "cust-1");
    expect(mockSetConversationState).toHaveBeenCalledWith(
      fakeSupabase,
      "cust-1",
      "telegram",
      "create:choosing_product",
      { groups: [] },
    );
    expect(mockResetConversationState).not.toHaveBeenCalled();
  });

  it("un mensaje a mitad del flujo se despacha a handleCreateOrderStep con el estado/contexto guardados", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetConversationState.mockResolvedValue({
      state: "create:awaiting_quantity",
      context: { product_id: "p1", product_name: "Tomate", unit: "kg" },
    });
    mockHandleCreateOrderStep.mockResolvedValue({
      reply: { text: "resumen..." },
      nextState: "create:reviewing_order",
      nextContext: { product_id: "p1", quantity: 3 },
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "3",
    });

    expect(result.text).toBe("resumen...");
    expect(mockHandleCreateOrderStep).toHaveBeenCalledWith(
      fakeSupabase,
      "cust-1",
      "create:awaiting_quantity",
      { product_id: "p1", product_name: "Tomate", unit: "kg" },
      { channel: "telegram", text: "3" },
      "2026-10-10",
    );
    expect(mockSetConversationState).toHaveBeenCalledWith(
      fakeSupabase,
      "cust-1",
      "telegram",
      "create:reviewing_order",
      { product_id: "p1", quantity: 3 },
    );
  });

  it("cuando el paso del flujo termina (nextState idle), se reinicia en vez de guardar un estado", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetConversationState.mockResolvedValue({
      state: "create:reviewing_order",
      context: { product_id: "p1", quantity: 3 },
    });
    mockHandleCreateOrderStep.mockResolvedValue({
      reply: { text: "✅ Pedido 1326 creado." },
      nextState: "idle",
      nextContext: {},
    });

    const result = await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "create:confirm",
    });

    expect(result.text).toBe("✅ Pedido 1326 creado.");
    expect(mockResetConversationState).toHaveBeenCalledWith(fakeSupabase, "cust-1", "telegram");
    expect(mockSetConversationState).not.toHaveBeenCalled();
  });

  it('tocar "Ver pedido" a mitad del flujo de crear lo abandona (no llama a handleCreateOrderStep)', async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetCurrentOrder.mockResolvedValue(null);

    await handleInboundMessage(fakeSupabase, customer, {
      channel: "telegram",
      text: "",
      callbackData: "menu:view_order",
    });

    expect(mockHandleCreateOrderStep).not.toHaveBeenCalled();
    expect(mockResetConversationState).toHaveBeenCalledWith(fakeSupabase, "cust-1", "telegram");
  });
});

describe("handleInboundMessage — estado de conversación (§8, Tarea 14)", () => {
  it("también reinicia cuando no hay ventana activa (abandonar un flujo cuenta igual)", async () => {
    mockGetActivePlanStatus.mockResolvedValue(null);

    await handleInboundMessage(fakeSupabase, customer, { channel: "telegram", text: "hola" });

    expect(mockResetConversationState).toHaveBeenCalledWith(fakeSupabase, "cust-1", "telegram");
  });

  it("no hay fugas de estado entre distintos clientes — cada uno reinicia solo el suyo", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);
    const otherCustomer = { customer_id: "cust-2", name: "Otro" };

    await handleInboundMessage(fakeSupabase, customer, { channel: "telegram", text: "hola" });
    await handleInboundMessage(fakeSupabase, otherCustomer, { channel: "telegram", text: "hola" });

    expect(mockResetConversationState).toHaveBeenNthCalledWith(1, fakeSupabase, "cust-1", "telegram");
    expect(mockResetConversationState).toHaveBeenNthCalledWith(2, fakeSupabase, "cust-2", "telegram");
  });
});

describe("handleInboundMessageForChannel — un número puede resolver a varios customer (Tarea 16)", () => {
  const candidateA = { customer_id: "cust-a", name: "Tienda A" };
  const candidateB = { customer_id: "cust-b", name: "Tienda B" };

  it("con un solo candidato, delega igual que handleInboundMessage (cero cambio de comportamiento)", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);

    const result = await handleInboundMessageForChannel(fakeSupabase, [customer], {
      channel: "telegram",
      text: "hola",
    });

    expect(result.text).toContain("Ryuma");
    expect(mockGetActivePlanStatus).toHaveBeenCalledTimes(1);
  });

  it('varios candidatos, nadie a mitad de flujo, tocan "Crear pedido" -> pregunta para cuál cliente es, un botón por candidato', async () => {
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);

    const result = await handleInboundMessageForChannel(fakeSupabase, [candidateA, candidateB], {
      channel: "telegram",
      text: "",
      callbackData: "menu:create_order",
    });

    expect(result.text).toMatch(/más de una cuenta/i);
    expect(result.buttons).toEqual([
      { label: "Tienda A", value: "bot:choose_customer:create:cust-a" },
      { label: "Tienda B", value: "bot:choose_customer:create:cust-b" },
    ]);
    expect(mockStartCreateOrderFlow).not.toHaveBeenCalled();
    expect(mockGetActivePlanStatus).not.toHaveBeenCalled();
  });

  it("al elegir un candidato desde el menú de desambiguación, se arranca la acción original para ese customer_id", async () => {
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockStartCreateOrderFlow.mockResolvedValue({
      reply: { text: "elige un producto" },
      nextState: "create:choosing_product",
      nextContext: { groups: [] },
    });

    const result = await handleInboundMessageForChannel(fakeSupabase, [candidateA, candidateB], {
      channel: "telegram",
      text: "",
      callbackData: "bot:choose_customer:create:cust-b",
    });

    expect(result.text).toBe("elige un producto");
    expect(mockStartCreateOrderFlow).toHaveBeenCalledWith(fakeSupabase, "cust-b");
    expect(mockSetConversationState).toHaveBeenCalledWith(
      fakeSupabase,
      "cust-b",
      "telegram",
      "create:choosing_product",
      { groups: [] },
    );
  });

  it("un customer_id en el callback que no pertenece a los candidatos resueltos se ignora (no se le atribuye el turno a nadie)", async () => {
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);

    const result = await handleInboundMessageForChannel(fakeSupabase, [candidateA, candidateB], {
      channel: "telegram",
      text: "",
      callbackData: "bot:choose_customer:create:cust-ajeno",
    });

    expect(mockStartCreateOrderFlow).not.toHaveBeenCalled();
    expect(result.text).toMatch(/^¡Hola! /); // menú genérico, cae como si no hubiera callback reconocido
  });

  it("si alguno de los candidatos está a mitad del flujo de crear pedido, el mensaje se despacha a ese sin pedir desambiguación", async () => {
    mockGetActivePlanStatus.mockResolvedValue(ACTIVE_WINDOW);
    mockGetConversationState.mockImplementation(async (_client, customerId) =>
      customerId === "cust-b"
        ? { state: "create:awaiting_quantity", context: { product_id: "p1", unit: "kg", product_name: "Tomate" } }
        : IDLE_CONVERSATION,
    );
    mockHandleCreateOrderStep.mockResolvedValue({
      reply: { text: "resumen..." },
      nextState: "create:reviewing_order",
      nextContext: { items: [] },
    });

    const result = await handleInboundMessageForChannel(fakeSupabase, [candidateA, candidateB], {
      channel: "telegram",
      text: "3",
    });

    expect(result.text).toBe("resumen...");
    expect(mockHandleCreateOrderStep).toHaveBeenCalledWith(
      fakeSupabase,
      "cust-b",
      "create:awaiting_quantity",
      { product_id: "p1", unit: "kg", product_name: "Tomate" },
      { channel: "telegram", text: "3" },
      "2026-10-10",
    );
  });

  it('varios candidatos, todos en idle, sin callback reconocido (ej. "hola") -> menú genérico sin nombre', async () => {
    mockGetConversationState.mockResolvedValue(IDLE_CONVERSATION);

    const result = await handleInboundMessageForChannel(fakeSupabase, [candidateA, candidateB], {
      channel: "telegram",
      text: "hola",
    });

    expect(result.text).toMatch(/^¡Hola! /);
    expect(mockGetActivePlanStatus).not.toHaveBeenCalled();
  });
});
