import { Database } from "@/database.types";
import { BotMessage } from "@/lib/bot/channel";
import { BotServiceError } from "@/lib/bot/errors";
import { ConversationContext } from "@/lib/bot/services/conversation";
import { createOrder } from "@/lib/bot/services/orders";
import { CatalogGroup, getFrequentProducts, ProductVariant, searchCatalog } from "@/lib/bot/services/products";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Flujo "🛒 Crear nuevo pedido" (documentacion/chatbot_diseno.md §7), aislado de
 * domain.ts por tamaño. Soporta UN producto por pedido en esta primera versión — el
 * guion de §7 nunca describe un loop de "agregar otro producto", y si el cliente
 * quiere varios, puede crear uno y de inmediato usar "📋 Ver / modificar mi pedido"
 * (Tarea 16, que reemplaza la lista completa de items) para agregar los demás.
 */

export const CREATE_FLOW_STATES = {
  CHOOSING_PRODUCT: "create:choosing_product",
  CHOOSING_UNIT: "create:choosing_unit",
  AWAITING_QUANTITY: "create:awaiting_quantity",
  AWAITING_CONFIRMATION: "create:awaiting_confirmation",
} as const;

type CreateFlowState = (typeof CREATE_FLOW_STATES)[keyof typeof CREATE_FLOW_STATES];

function isCreateFlowState(state: string): state is CreateFlowState {
  return (Object.values(CREATE_FLOW_STATES) as string[]).includes(state);
}

type StepResult = {
  reply: BotMessage;
  nextState: string; // IDLE_STATE ("idle") cuando el flujo termina o se aborta
  nextContext: ConversationContext;
};

const CALLBACK_SEARCH = "create:search";
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

/** Serializa solo lo necesario para resolver el próximo paso sin otro round-trip a la base. */
function serializeGroups(groups: CatalogGroup[]): ConversationContext {
  return {
    groups: groups.map((g) => ({
      canonical_group_id: g.canonical_group_id,
      canonical_name: g.canonical_name,
      variants: g.variants,
    })),
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
  intro: string,
): Promise<StepResult> {
  const frequent = await getFrequentProducts(supabaseClient, customerId);

  if (frequent.length === 0) {
    return {
      reply: {
        text: `${intro}\n\nTodavía no tienes productos frecuentes. Escribe el nombre del producto que buscas.`,
      },
      nextState: CREATE_FLOW_STATES.CHOOSING_PRODUCT,
      nextContext: serializeGroups([]),
    };
  }

  return {
    reply: {
      text: `${intro}\n\nEstos son tus productos más pedidos — toca uno, o escribe el nombre del que buscas:`,
      buttons: [...groupButtons(frequent), { label: "🔍 Buscar otro producto", value: CALLBACK_SEARCH }],
    },
    nextState: CREATE_FLOW_STATES.CHOOSING_PRODUCT,
    nextContext: serializeGroups(frequent),
  };
}

export async function startCreateOrderFlow(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
): Promise<StepResult> {
  return showProductChoices(supabaseClient, customerId, "🛒 Vamos a crear tu pedido.");
}

async function handleChoosingProduct(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  context: ConversationContext,
  inbound: { text: string; callbackData?: string },
): Promise<StepResult> {
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
      return showProductChoices(supabaseClient, customerId, "No reconocí esa opción, probemos de nuevo.");
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
      },
    };
  }

  if (inbound.callbackData?.startsWith(GROUP_PREFIX)) {
    const groupId = inbound.callbackData.slice(GROUP_PREFIX.length);
    const group = findGroup(context, groupId);
    if (!group) {
      return showProductChoices(supabaseClient, customerId, "No reconocí esa opción, probemos de nuevo.");
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
      nextContext: serializeGroups([group]),
    };
  }

  // Ni un botón reconocido ni vacío: texto libre, se trata como búsqueda.
  const query = inbound.text.trim();
  if (!query) {
    return showProductChoices(supabaseClient, customerId, "No entendí eso, probemos de nuevo.");
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
    nextContext: serializeGroups(results),
  };
}

function handleChoosingUnit(context: ConversationContext, inbound: { callbackData?: string }): StepResult {
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
        },
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

function handleAwaitingQuantity(context: ConversationContext, inbound: { text: string }): StepResult {
  const normalized = inbound.text.trim().replace(",", ".");
  const quantity = Number(normalized);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      reply: { text: "Escribe solo un número mayor a 0 (ej. 3 o 2.5)." },
      nextState: CREATE_FLOW_STATES.AWAITING_QUANTITY,
      nextContext: context,
    };
  }

  const productName = context.product_name as string;
  const unit = context.unit as string;

  return {
    reply: {
      text: `Resumen: ${quantity} ${unit} de "${productName}".\n¿Confirmas el pedido?`,
      buttons: [
        { label: "✅ Confirmar pedido", value: CALLBACK_CONFIRM },
        { label: "❌ Cancelar", value: CALLBACK_ABORT },
      ],
    },
    nextState: CREATE_FLOW_STATES.AWAITING_CONFIRMATION,
    nextContext: { ...context, quantity },
  };
}

function createOrderErrorMessage(error: unknown): string {
  if (error instanceof BotServiceError) {
    switch (error.code) {
      case "NO_ACTIVE_PLAN":
        return "⏰ Ya no hay una ventana de pedidos activa. Intenta de nuevo más tarde.";
      case "PAST_CUTOFF":
        return "⏰ Ya pasó la hora límite de hoy para hacer pedidos.";
      case "ORDER_ALREADY_EXISTS":
        return 'Ya tienes un pedido para el próximo plan de entrega. Usa "📋 Ver / modificar mi pedido de hoy" para editarlo.';
    }
  }
  return "Ocurrió un error inesperado creando tu pedido. Por favor intenta de nuevo.";
}

async function handleAwaitingConfirmation(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  context: ConversationContext,
  inbound: { callbackData?: string },
  planDate: string,
): Promise<StepResult> {
  if (inbound.callbackData === CALLBACK_ABORT) {
    return {
      reply: { text: "Pedido cancelado, no se guardó nada." },
      nextState: "idle",
      nextContext: {},
    };
  }

  if (inbound.callbackData === CALLBACK_CONFIRM) {
    try {
      const created = await createOrder(supabaseClient, customerId, [
        { product_id: context.product_id as string, required_quantity: context.quantity as number },
      ]);
      return {
        reply: { text: `✅ Pedido ${created.order_code} creado. Se entrega el ${planDate}.` },
        nextState: "idle",
        nextContext: {},
      };
    } catch (error) {
      return {
        reply: { text: createOrderErrorMessage(error) },
        nextState: "idle",
        nextContext: {},
      };
    }
  }

  return {
    reply: {
      text: "No reconocí esa opción. ¿Confirmas el pedido?",
      buttons: [
        { label: "✅ Confirmar pedido", value: CALLBACK_CONFIRM },
        { label: "❌ Cancelar", value: CALLBACK_ABORT },
      ],
    },
    nextState: CREATE_FLOW_STATES.AWAITING_CONFIRMATION,
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
    case CREATE_FLOW_STATES.AWAITING_CONFIRMATION:
      return handleAwaitingConfirmation(supabaseClient, customerId, context, inbound, planDate);
  }
}
