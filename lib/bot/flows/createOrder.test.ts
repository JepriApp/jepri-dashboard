import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATE_FLOW_STATES,
  handleCreateOrderStep,
  startCreateOrderFlow,
} from "@/lib/bot/flows/createOrder";
import { getFrequentProducts, searchCatalog } from "@/lib/bot/services/products";
import { createOrder } from "@/lib/bot/services/orders";
import { BotServiceError } from "@/lib/bot/errors";

vi.mock("@/lib/bot/services/products", () => ({
  getFrequentProducts: vi.fn(),
  searchCatalog: vi.fn(),
}));
vi.mock("@/lib/bot/services/orders", () => ({
  createOrder: vi.fn(),
}));

const mockGetFrequentProducts = vi.mocked(getFrequentProducts);
const mockSearchCatalog = vi.mocked(searchCatalog);
const mockCreateOrder = vi.mocked(createOrder);

const fakeSupabase = {} as Parameters<typeof startCreateOrderFlow>[0];
const CUSTOMER_ID = "cust-1";
const PLAN_DATE = "2026-10-10";

const TOMATO_GROUP = {
  canonical_group_id: "group-tomato",
  canonical_name: "Tomate chonto",
  variants: [
    { product_id: "p-tomato-kg", unit: "kg", reference_price: 4500 },
    { product_id: "p-tomato-caja", unit: "caja x20", reference_price: 85000 },
  ],
};

const ONION_GROUP = {
  canonical_group_id: "group-onion",
  canonical_name: "Cebolla cabezona",
  variants: [{ product_id: "p-onion-kg", unit: "kg", reference_price: 3800 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startCreateOrderFlow", () => {
  it("muestra los productos frecuentes como botones, uno por grupo", async () => {
    mockGetFrequentProducts.mockResolvedValue([
      { ...TOMATO_GROUP, times_ordered: 5 },
      { ...ONION_GROUP, times_ordered: 2 },
    ]);

    const result = await startCreateOrderFlow(fakeSupabase, CUSTOMER_ID);

    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_PRODUCT);
    expect(result.reply.buttons).toHaveLength(3); // 2 grupos + "buscar"
    expect(result.reply.buttons?.[0].label).toBe("Tomate chonto");
    // el grupo con 1 sola variante salta directo a variant:, no a group:
    expect(result.reply.buttons?.[1].value).toBe("create:variant:p-onion-kg");
    expect(result.reply.buttons?.[0].value).toBe("create:group:group-tomato");
    expect((result.nextContext as Record<string, unknown>).items).toEqual([]);
  });

  it("sin productos frecuentes, invita a escribir en vez de mostrar botones", async () => {
    mockGetFrequentProducts.mockResolvedValue([]);

    const result = await startCreateOrderFlow(fakeSupabase, CUSTOMER_ID);

    expect(result.reply.buttons).toBeUndefined();
    expect(result.reply.text).toMatch(/escribe el nombre del producto/i);
    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_PRODUCT);
  });
});

describe("handleCreateOrderStep — CHOOSING_PRODUCT", () => {
  const context = { groups: [TOMATO_GROUP, ONION_GROUP], items: [] };

  it('tocar "buscar" solo pide que escriban, sin tocar el context', async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      context,
      { text: "", callbackData: "create:search" },
      PLAN_DATE,
    );

    expect(result.reply.text).toMatch(/escribe el nombre/i);
    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_PRODUCT);
    expect(result.nextContext).toBe(context);
  });

  it("elegir una variante directo (grupo de una sola unidad) pasa a pedir cantidad, conservando los items previos", async () => {
    const existingItem = { product_id: "p-x", product_name: "Papa", unit: "kg", quantity: 2 };
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      { ...context, items: [existingItem] },
      { text: "", callbackData: "create:variant:p-onion-kg" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.AWAITING_QUANTITY);
    expect(result.nextContext).toEqual({
      product_id: "p-onion-kg",
      product_name: "Cebolla cabezona",
      unit: "kg",
      items: [existingItem],
    });
    expect(result.reply.text).toContain("Cebolla cabezona");
    expect(result.reply.text).toContain("kg");
  });

  it("elegir un grupo con varias unidades pregunta cuál, con precios formateados", async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      context,
      { text: "", callbackData: "create:group:group-tomato" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_UNIT);
    expect(result.reply.buttons).toEqual([
      { label: "kg - $4.500", value: "create:variant:p-tomato-kg" },
      { label: "caja x20 - $85.000", value: "create:variant:p-tomato-caja" },
    ]);
  });

  it("un callback de variante que no está en el context cae de vuelta a mostrar opciones", async () => {
    mockGetFrequentProducts.mockResolvedValue([]);

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      context,
      { text: "", callbackData: "create:variant:no-existe" },
      PLAN_DATE,
    );

    expect(result.reply.text).toMatch(/no reconocí esa opción/i);
    expect(mockGetFrequentProducts).toHaveBeenCalled();
  });

  it("texto libre se trata como búsqueda y muestra resultados", async () => {
    mockSearchCatalog.mockResolvedValue([ONION_GROUP]);

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      context,
      { text: "cebolla" },
      PLAN_DATE,
    );

    expect(mockSearchCatalog).toHaveBeenCalledWith(fakeSupabase, "cebolla");
    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_PRODUCT);
    expect(result.reply.buttons).toEqual([{ label: "Cebolla cabezona", value: "create:variant:p-onion-kg" }]);
  });

  it("búsqueda sin resultados avisa y mantiene el context anterior", async () => {
    mockSearchCatalog.mockResolvedValue([]);

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      context,
      { text: "producto-inexistente" },
      PLAN_DATE,
    );

    expect(result.reply.text).toMatch(/no encontré ningún producto/i);
    expect(result.nextContext).toBe(context);
  });

  it("texto vacío (ni callback ni texto real) vuelve a mostrar las opciones", async () => {
    mockGetFrequentProducts.mockResolvedValue([ONION_GROUP].map((g) => ({ ...g, times_ordered: 1 })));

    await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      context,
      { text: "   " },
      PLAN_DATE,
    );

    expect(mockSearchCatalog).not.toHaveBeenCalled();
    expect(mockGetFrequentProducts).toHaveBeenCalled();
  });
});

describe("handleCreateOrderStep — CHOOSING_UNIT", () => {
  const context = { groups: [TOMATO_GROUP], items: [] };

  it("elegir una unidad pasa a pedir cantidad con el product_id correcto", async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_UNIT,
      context,
      { text: "", callbackData: "create:variant:p-tomato-caja" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.AWAITING_QUANTITY);
    expect(result.nextContext).toEqual({
      product_id: "p-tomato-caja",
      product_name: "Tomate chonto",
      unit: "caja x20",
      items: [],
    });
  });

  it("un callback no reconocido vuelve a preguntar la unidad", async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.CHOOSING_UNIT,
      context,
      { text: "", callbackData: "create:variant:no-existe" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_UNIT);
    expect(result.reply.text).toMatch(/no reconocí esa opción/i);
  });
});

describe("handleCreateOrderStep — AWAITING_QUANTITY", () => {
  const context = { product_id: "p-tomato-kg", product_name: "Tomate chonto", unit: "kg", items: [] };

  it("un número entero válido agrega el item y pasa a revisión con el resumen correcto", async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.AWAITING_QUANTITY,
      context,
      { text: "3" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.REVIEWING_ORDER);
    expect(result.nextContext).toEqual({
      items: [{ product_id: "p-tomato-kg", product_name: "Tomate chonto", unit: "kg", quantity: 3 }],
    });
    expect(result.reply.text).toContain("3 kg");
    expect(result.reply.text).toContain("Tomate chonto");
    expect(result.reply.buttons?.map((b) => b.value)).toEqual([
      "create:add_more",
      "create:confirm",
      "create:abort",
    ]);
  });

  it("acumula sobre los items que ya existían (segundo producto del pedido)", async () => {
    const existingItem = { product_id: "p-onion-kg", product_name: "Cebolla cabezona", unit: "kg", quantity: 2 };
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.AWAITING_QUANTITY,
      { ...context, items: [existingItem] },
      { text: "3" },
      PLAN_DATE,
    );

    expect((result.nextContext as Record<string, unknown>).items).toEqual([
      existingItem,
      { product_id: "p-tomato-kg", product_name: "Tomate chonto", unit: "kg", quantity: 3 },
    ]);
    expect(result.reply.text).toContain("Cebolla cabezona");
    expect(result.reply.text).toContain("Tomate chonto");
  });

  it("acepta coma decimal (2,5 -> 2.5)", async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.AWAITING_QUANTITY,
      context,
      { text: "2,5" },
      PLAN_DATE,
    );

    expect((result.nextContext as Record<string, unknown>).items).toMatchObject([{ quantity: 2.5 }]);
  });

  it.each(["abc", "0", "-1", ""])("rechaza una cantidad inválida (%s) y vuelve a pedirla", async (text) => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.AWAITING_QUANTITY,
      context,
      { text },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.AWAITING_QUANTITY);
    expect(result.reply.text).toMatch(/escribe solo un número mayor a 0/i);
    expect(result.nextContext).toBe(context);
  });
});

describe("handleCreateOrderStep — REVIEWING_ORDER", () => {
  const oneItem = [{ product_id: "p-tomato-kg", product_name: "Tomate chonto", unit: "kg", quantity: 3 }];
  const twoItems = [
    ...oneItem,
    { product_id: "p-onion-kg", product_name: "Cebolla cabezona", unit: "kg", quantity: 2 },
  ];

  it("confirmar con un solo item crea el pedido y responde con el order_code", async () => {
    mockCreateOrder.mockResolvedValue({ order_id: "order-1", order_code: "1326" });

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.REVIEWING_ORDER,
      { items: oneItem },
      { text: "", callbackData: "create:confirm" },
      PLAN_DATE,
    );

    expect(mockCreateOrder).toHaveBeenCalledWith(fakeSupabase, CUSTOMER_ID, [
      { product_id: "p-tomato-kg", required_quantity: 3 },
    ]);
    expect(result.reply.text).toContain("1326");
    expect(result.reply.text).toContain(PLAN_DATE);
    expect(result.reply.text).toContain('3 kg de "Tomate chonto"');
    expect(result.nextState).toBe("idle");
  });

  it("confirmar con varios items los manda todos juntos a createOrder y los resume en el mensaje final", async () => {
    mockCreateOrder.mockResolvedValue({ order_id: "order-2", order_code: "1327" });

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.REVIEWING_ORDER,
      { items: twoItems },
      { text: "", callbackData: "create:confirm" },
      PLAN_DATE,
    );

    expect(mockCreateOrder).toHaveBeenCalledWith(fakeSupabase, CUSTOMER_ID, [
      { product_id: "p-tomato-kg", required_quantity: 3 },
      { product_id: "p-onion-kg", required_quantity: 2 },
    ]);
    expect(result.reply.text).toContain('3 kg de "Tomate chonto"');
    expect(result.reply.text).toContain('2 kg de "Cebolla cabezona"');
  });

  it('"agregar otro producto" vuelve a elegir producto conservando los items acumulados', async () => {
    mockGetFrequentProducts.mockResolvedValue([{ ...ONION_GROUP, times_ordered: 1 }]);

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.REVIEWING_ORDER,
      { items: oneItem },
      { text: "", callbackData: "create:add_more" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_PRODUCT);
    expect((result.nextContext as Record<string, unknown>).items).toEqual(oneItem);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["NO_ACTIVE_PLAN", /ya no hay una ventana/i],
    ["PAST_CUTOFF", /pasó la hora límite/i],
    ["ORDER_ALREADY_EXISTS", /ya tienes un pedido/i],
  ] as const)("confirmar con error %s responde el mensaje amigable correspondiente, nunca el crudo", async (code, expectedPattern) => {
    mockCreateOrder.mockRejectedValue(new BotServiceError(code, `${code}: detalle técnico interno`));

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.REVIEWING_ORDER,
      { items: oneItem },
      { text: "", callbackData: "create:confirm" },
      PLAN_DATE,
    );

    expect(result.reply.text).toMatch(expectedPattern);
    expect(result.reply.text).not.toContain("detalle técnico interno");
    expect(result.nextState).toBe("idle");
  });

  it("un error inesperado (no BotServiceError) responde un mensaje genérico, nunca el crudo", async () => {
    mockCreateOrder.mockRejectedValue(new Error("ECONNRESET algo de red"));

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.REVIEWING_ORDER,
      { items: oneItem },
      { text: "", callbackData: "create:confirm" },
      PLAN_DATE,
    );

    expect(result.reply.text).toMatch(/error inesperado/i);
    expect(result.reply.text).not.toContain("ECONNRESET");
    expect(result.nextState).toBe("idle");
  });

  it("abortar no crea ningún pedido", async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.REVIEWING_ORDER,
      { items: oneItem },
      { text: "", callbackData: "create:abort" },
      PLAN_DATE,
    );

    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(result.reply.text).toMatch(/cancelado/i);
    expect(result.nextState).toBe("idle");
  });

  it("un callback no reconocido vuelve a mostrar la revisión", async () => {
    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      CREATE_FLOW_STATES.REVIEWING_ORDER,
      { items: oneItem },
      { text: "", callbackData: "algo-raro" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.REVIEWING_ORDER);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});

describe("handleCreateOrderStep — estado desconocido (defensivo)", () => {
  it("un estado que no es create:* reinicia el flujo en vez de reventar", async () => {
    mockGetFrequentProducts.mockResolvedValue([]);

    const result = await handleCreateOrderStep(
      fakeSupabase,
      CUSTOMER_ID,
      "algo-que-no-es-create",
      {},
      { text: "hola" },
      PLAN_DATE,
    );

    expect(result.nextState).toBe(CREATE_FLOW_STATES.CHOOSING_PRODUCT);
    expect(mockGetFrequentProducts).toHaveBeenCalled();
  });
});
