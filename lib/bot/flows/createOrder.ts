import { Database } from "@/database.types";
import { BotMessage } from "@/lib/bot/channel";
import { BotServiceError } from "@/lib/bot/errors";
import { ConversationContext } from "@/lib/bot/services/conversation";
import { CurrentOrder, createOrder, updateOrder } from "@/lib/bot/services/orders";
import { CatalogGroup, getFrequentProducts, ProductVariant, searchCatalog } from "@/lib/bot/services/products";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Flujo "🛒 Crear nuevo pedido" / "📋 Ver / modificar" (documentacion/chatbot_diseno.md
 * §7), aislado de domain.ts por tamaño. Acumula uno o más productos (elegir → [unidad] →
 * cantidad → "¿agregar otro o confirmar?") antes de llamar a createOrder/updateOrder una
 * sola vez con la lista completa — "modificar" (Tarea 17) reutiliza exactamente el mismo
 * loop, precargado con los items del pedido existente y terminando en `updateOrder` en
 * vez de `createOrder` (se distingue por si el context carga `order_id`/`order_code`).
 */

export const CREATE_FLOW_STATES = {
  CHOOSING_PRODUCT: "create:choosing_product",
  CHOOSING_UNIT: "create:choosing_unit",
  AWAITING_QUANTITY: "create:awaiting_quantity",
  REVIEWING_ORDER: "create:reviewing_order",
} as const;

type CreateFlowState = (typeof CREATE_FLOW_STATES)[keyof typeof CREATE_FLOW_STATES];

function isCreateFlowState(state: string): state is CreateFlowState {
  return (Object.values(CREATE_FLOW_STATES) as string[]).includes(state);
}

type PendingItem = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
};

type StepResult = {
  reply: BotMessage;
  nextState: string; // IDLE_STATE ("idle") cuando el flujo termina o se aborta
  nextContext: ConversationContext;
};

const CALLBACK_SEARCH = "create:search";
const CALLBACK_ADD_MORE = "create:add_more";
const CALLBACK_CONFIRM = "create:confirm";
const CALLBACK_ABORT = "create:abort";
const GROUP_PREFIX = "create:group:";
const VARIANT_PREFIX = "create:variant:";

function formatPrice(price: number | null): string {
  return price === null ? "precio no disponible" : `$${price.toLocaleString("es-CO")}`;
}

function groupButtons(groups: CatalogGroup[]) {
  return groups.map((group) => ({
    label: group.canonical_name,
    value:
      group.variants.length === 1
        ? `${VARIANT_PREFIX}${group.variants[0].product_id}`
        : `${GROUP_PREFIX}${group.canonical_group_id}`,
  }));
}

function getItems(context: ConversationContext): PendingItem[] {
  return (context.items as unknown as PendingItem[]) ?? [];
}

/** Reemplaza el item si ya hay uno con el mismo product_id (permite "editar cantidad"
 * re-eligiendo el mismo producto); lo agrega al final si no. */
function upsertItem(items: PendingItem[], newItem: PendingItem): PendingItem[] {
  const index = items.findIndex((item) => item.product_id === newItem.product_id);
  if (index === -1) return [...items, newItem];
  const copy = [...items];
  copy[index] = newItem;
  return copy;
}

type OrderMeta = { order_id: string; order_code: string } | null;

/** Presente solo en el flujo de "modificar" (Tarea 17) — su ausencia es lo que distingue
 * crear de editar en cada paso que lo necesita. */
function getOrderMeta(context: ConversationContext): OrderMeta {
  const orderId = context.order_id as string | undefined;
  const orderCode = context.order_code as string | undefined;
  return orderId && orderCode ? { order_id: orderId, order_code: orderCode } : null;
}

/** Serializa solo lo necesario para resolver el próximo paso sin otro round-trip a la
 * base — carga `orderMeta` tal cual si viene de un flujo de editar en curso. */
function withGroups(
  groups: CatalogGroup[],
  items: PendingItem[],
  orderMeta: OrderMeta = null,
): ConversationContext {
  return {
    groups: groups.map((g) => ({
      canonical_group_id: g.canonical_group_id,
      canonical_name: g.canonical_name,
      variants: g.variants,
    })),
    items,
    ...(orderMeta ?? {}),
  } as unknown as ConversationContext;
}

function findVariantAmongGroups(
  context: ConversationContext,
  productId: string,
): { variant: ProductVariant; groupName: string } | null {
  const groups = (context.groups as unknown as CatalogGroup[]) ?? [];
  for (const group of groups) {
    const variant = group.variants.find((v) => v.product_id === productId);
    if (variant) return { variant, groupName: group.canonical_name };
  }
  return null;
}

function findGroup(context: ConversationContext, groupId: string): CatalogGroup | null {
  const groups = (context.groups as unknown as CatalogGroup[]) ?? [];
  return groups.find((g) => g.canonical_group_id === groupId) ?? null;
}

async function showProductChoices(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  items: PendingItem[],
  intro: string,
  orderMeta: OrderMeta = null,
): Promise<StepResult> {
  const frequent = await getFrequentProducts(supabaseClient, customerId);

  if (frequent.length === 0) {
    // "Todavía no tienes productos frecuentes" describe el historial del cliente, no
    // el pedido en curso — solo aplica al arrancar la charla (items vacío). En el loop
    // de "agregar otro producto" repetirla en cada vuelta es ruido.
    const explanation = items.length === 0 ? "Todavía no tienes productos frecuentes. " : "";
    return {
      reply: {
        text: `${intro}\n\n${explanation}Escribe el nombre del producto que buscas.`,
      },
      nextState: CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      nextContext: withGroups([], items, orderMeta),
    };
  }

  return {
    reply: {
      text: `${intro}\n\nEstos son tus productos más pedidos — toca uno, o escribe el nombre del que buscas:`,
      buttons: [...groupButtons(frequent), { label: "🔍 Buscar otro producto", value: CALLBACK_SEARCH }],
    },
    nextState: CREATE_FLOW_STATES.CHOOSING_PRODUCT,
    nextContext: withGroups(frequent, items, orderMeta),
  };
}

export async function startCreateOrderFlow(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
): Promise<StepResult> {
  return showProductChoices(supabaseClient, customerId, [], "🛒 Vamos a crear tu pedido.");
}

/**
 * Flujo "📋 Ver / modificar" cuando ya hay un pedido (Tarea 17) — reutiliza el mismo
 * loop de crear, precargado con los items existentes y saltando directo a la revisión
 * (no hace falta volver a elegir producto por producto solo para verlos). El
 * `order_id`/`order_code` viajan en el context durante todo el flujo; su presencia es lo
 * que hace que `handleReviewingOrder` llame `updateOrder` en vez de `createOrder`.
 */
export function startEditOrderFlow(order: CurrentOrder): StepResult {
  const items: PendingItem[] = order.items.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    unit: item.unit,
    quantity: item.required_quantity,
  }));
  const orderMeta: OrderMeta = { order_id: order.order_id, order_code: order.order_code };

  return {
    reply: reviewMessage(items, order.order_code),
    nextState: CREATE_FLOW_STATES.REVIEWING_ORDER,
    nextContext: withGroups([], items, orderMeta),
  };
}

async function handleChoosingProduct(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  context: ConversationContext,
  inbound: { text: string; callbackData?: string },
): Promise<StepResult> {
  const items = getItems(context);
  const orderMeta = getOrderMeta(context);

  if (inbound.callbackData === CALLBACK_SEARCH) {
    return {
      reply: { text: "Escribe el nombre del producto que buscas." },
      nextState: CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      nextContext: context,
    };
  }

  if (inbound.callbackData?.startsWith(VARIANT_PREFIX)) {
    const productId = inbound.callbackData.slice(VARIANT_PREFIX.length);
    const found = findVariantAmongGroups(context, productId);
    if (!found) {
      return showProductChoices(
        supabaseClient,
        customerId,
        items,
        "No reconocí esa opción, probemos de nuevo.",
        orderMeta,
      );
    }
    return {
      reply: {
        text: `¿Cuántos ${found.variant.unit} de "${found.groupName}" quieres? Escribe solo el número.`,
      },
      nextState: CREATE_FLOW_STATES.AWAITING_QUANTITY,
      nextContext: {
        product_id: found.variant.product_id,
        product_name: found.groupName,
        unit: found.variant.unit,
        items,
        ...(orderMeta ?? {}),
      } as unknown as ConversationContext,
    };
  }

  if (inbound.callbackData?.startsWith(GROUP_PREFIX)) {
    const groupId = inbound.callbackData.slice(GROUP_PREFIX.length);
    const group = findGroup(context, groupId);
    if (!group) {
      return showProductChoices(
        supabaseClient,
        customerId,
        items,
        "No reconocí esa opción, probemos de nuevo.",
        orderMeta,
      );
    }
    return {
      reply: {
        text: `"${group.canonical_name}" — ¿en qué unidad?`,
        buttons: group.variants.map((variant) => ({
          label: `${variant.unit} - ${formatPrice(variant.reference_price)}`,
          value: `${VARIANT_PREFIX}${variant.product_id}`,
        })),
      },
      nextState: CREATE_FLOW_STATES.CHOOSING_UNIT,
      nextContext: withGroups([group], items, orderMeta),
    };
  }

  // Ni un botón reconocido ni vacío: texto libre, se trata como búsqueda.
  const query = inbound.text.trim();
  if (!query) {
    return showProductChoices(supabaseClient, customerId, items, "No entendí eso, probemos de nuevo.", orderMeta);
  }

  const results = await searchCatalog(supabaseClient, query);
  if (results.length === 0) {
    return {
      reply: { text: `No encontré ningún producto con "${query}". Intenta con otra palabra.` },
      nextState: CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      nextContext: context,
    };
  }

  return {
    reply: {
      text: "Encontré esto — toca el que quieres:",
      buttons: groupButtons(results),
    },
    nextState: CREATE_FLOW_STATES.CHOOSING_PRODUCT,
    nextContext: withGroups(results, items, orderMeta),
  };
}

function handleChoosingUnit(context: ConversationContext, inbound: { callbackData?: string }): StepResult {
  const items = getItems(context);
  const orderMeta = getOrderMeta(context);

  if (inbound.callbackData?.startsWith(VARIANT_PREFIX)) {
    const productId = inbound.callbackData.slice(VARIANT_PREFIX.length);
    const found = findVariantAmongGroups(context, productId);
    if (found) {
      return {
        reply: {
          text: `¿Cuántos ${found.variant.unit} de "${found.groupName}" quieres? Escribe solo el número.`,
        },
        nextState: CREATE_FLOW_STATES.AWAITING_QUANTITY,
        nextContext: {
          product_id: found.variant.product_id,
          product_name: found.groupName,
          unit: found.variant.unit,
          items,
          ...(orderMeta ?? {}),
        } as unknown as ConversationContext,
      };
    }
  }

  const group = (context.groups as unknown as CatalogGroup[])?.[0];
  return {
    reply: {
      text: "No reconocí esa opción. ¿En qué unidad?",
      buttons: (group?.variants ?? []).map((variant) => ({
        label: `${variant.unit} - ${formatPrice(variant.reference_price)}`,
        value: `${VARIANT_PREFIX}${variant.product_id}`,
      })),
    },
    nextState: CREATE_FLOW_STATES.CHOOSING_UNIT,
    nextContext: context,
  };
}

function formatItemLines(items: PendingItem[]): string {
  return items.map((item) => `• ${item.quantity} ${item.unit} de "${item.product_name}"`).join("\n");
}

function reviewMessage(items: PendingItem[], orderCode: string | null = null): BotMessage {
  const intro = orderCode ? `Tu pedido ${orderCode} hasta ahora:` : "Tu pedido hasta ahora:";
  const question = orderCode
    ? "¿Agregas otro producto o confirmas los cambios?"
    : "¿Agregas otro producto o confirmas el pedido?";
  return {
    text: `${intro}\n${formatItemLines(items)}\n\n${question}`,
    buttons: [
      { label: "➕ Agregar otro producto", value: CALLBACK_ADD_MORE },
      { label: orderCode ? "✅ Confirmar cambios" : "✅ Confirmar pedido", value: CALLBACK_CONFIRM },
      { label: "❌ Cancelar", value: CALLBACK_ABORT },
    ],
  };
}

function handleAwaitingQuantity(context: ConversationContext, inbound: { text: string }): StepResult {
  const normalized = inbound.text.trim().replace(",", ".");
  const quantity = Number(normalized);
  const orderMeta = getOrderMeta(context);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      reply: { text: "Escribe solo un número mayor a 0 (ej. 3 o 2.5)." },
      nextState: CREATE_FLOW_STATES.AWAITING_QUANTITY,
      nextContext: context,
    };
  }

  const newItem: PendingItem = {
    product_id: context.product_id as string,
    product_name: context.product_name as string,
    unit: context.unit as string,
    quantity,
  };
  // Re-elegir un producto que ya estaba en la lista reemplaza su cantidad en vez de
  // agregar una línea duplicada — así es como se "edita" una cantidad con este mismo loop.
  const items = upsertItem(getItems(context), newItem);

  return {
    reply: reviewMessage(items, orderMeta?.order_code ?? null),
    nextState: CREATE_FLOW_STATES.REVIEWING_ORDER,
    nextContext: { items, ...(orderMeta ?? {}) } as unknown as ConversationContext,
  };
}

function orderErrorMessage(error: unknown, isEdit: boolean): string {
  if (error instanceof BotServiceError) {
    switch (error.code) {
      case "NO_ACTIVE_PLAN":
        return "⏰ Ya no hay una ventana de pedidos activa. Intenta de nuevo más tarde.";
      case "PAST_CUTOFF":
        return isEdit
          ? "⏰ Ya pasó la hora límite de hoy para modificar pedidos."
          : "⏰ Ya pasó la hora límite de hoy para hacer pedidos.";
      case "ORDER_ALREADY_EXISTS":
        return 'Ya tienes un pedido para el próximo plan de entrega. Usa "📋 Ver / modificar mi pedido de hoy" para editarlo.';
      case "ORDER_NOT_FOUND":
        return "No encontré ese pedido — puede que ya haya sido cancelado. Revisa el menú principal.";
      case "ORDER_NOT_EDITABLE":
        return "Ese pedido ya no se puede modificar (está cancelado o ya salió a reparto).";
      case "PLAN_NOT_EDITABLE":
        return "El plan de entrega de este pedido ya no acepta cambios.";
    }
  }
  return isEdit
    ? "Ocurrió un error inesperado modificando tu pedido. Por favor intenta de nuevo."
    : "Ocurrió un error inesperado creando tu pedido. Por favor intenta de nuevo.";
}

async function handleReviewingOrder(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  context: ConversationContext,
  inbound: { callbackData?: string },
  planDate: string,
): Promise<StepResult> {
  const items = getItems(context);
  const orderMeta = getOrderMeta(context);

  if (inbound.callbackData === CALLBACK_ABORT) {
    return {
      reply: { text: orderMeta ? "No se guardó ningún cambio." : "Pedido cancelado, no se guardó nada." },
      nextState: "idle",
      nextContext: {},
    };
  }

  if (inbound.callbackData === CALLBACK_ADD_MORE) {
    return showProductChoices(supabaseClient, customerId, items, "Elige otro producto:", orderMeta);
  }

  if (inbound.callbackData === CALLBACK_CONFIRM) {
    const itemInputs = items.map((item) => ({ product_id: item.product_id, required_quantity: item.quantity }));
    try {
      if (orderMeta) {
        await updateOrder(supabaseClient, orderMeta.order_id, customerId, itemInputs);
        return {
          reply: {
            text: `✅ Pedido ${orderMeta.order_code} actualizado. Se entrega el ${planDate}.\n\n${formatItemLines(items)}`,
          },
          nextState: "idle",
          nextContext: {},
        };
      }

      const created = await createOrder(supabaseClient, customerId, itemInputs);
      return {
        reply: {
          text: `✅ Pedido ${created.order_code} creado. Se entrega el ${planDate}.\n\n${formatItemLines(items)}`,
        },
        nextState: "idle",
        nextContext: {},
      };
    } catch (error) {
      return {
        reply: { text: orderErrorMessage(error, orderMeta !== null) },
        nextState: "idle",
        nextContext: {},
      };
    }
  }

  return {
    reply: reviewMessage(items, orderMeta?.order_code ?? null),
    nextState: CREATE_FLOW_STATES.REVIEWING_ORDER,
    nextContext: context,
  };
}

/**
 * Despacha un mensaje entrante según en qué paso del flujo esté el cliente. Llamar
 * solo cuando `state` es uno de CREATE_FLOW_STATES (domain.ts decide eso).
 */
export async function handleCreateOrderStep(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  state: string,
  context: ConversationContext,
  inbound: { text: string; callbackData?: string },
  planDate: string,
): Promise<StepResult> {
  if (!isCreateFlowState(state)) {
    // No debería pasar — domain.ts solo llama acá con un estado create:*. Defensivo:
    // se reinicia en vez de reventar.
    return startCreateOrderFlow(supabaseClient, customerId);
  }

  switch (state) {
    case CREATE_FLOW_STATES.CHOOSING_PRODUCT:
      return handleChoosingProduct(supabaseClient, customerId, context, inbound);
    case CREATE_FLOW_STATES.CHOOSING_UNIT:
      return handleChoosingUnit(context, inbound);
    case CREATE_FLOW_STATES.AWAITING_QUANTITY:
      return handleAwaitingQuantity(context, inbound);
    case CREATE_FLOW_STATES.REVIEWING_ORDER:
      return handleReviewingOrder(supabaseClient, customerId, context, inbound, planDate);
  }
}
