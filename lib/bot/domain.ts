import { Database } from "@/database.types";
import { notifyOps } from "@/lib/bot/adapters/telegram";
import { BotMessage } from "@/lib/bot/channel";
import {
  CONVERSATION_ENDED_NOTE,
  CREATE_FLOW_STATES,
  handleCreateOrderStep,
  startCreateOrderFlow,
  startEditOrderFlow,
} from "@/lib/bot/flows/createOrder";
import { BotServiceError, isUnexpectedError } from "@/lib/bot/errors";
import { errorResult, logInteraction } from "@/lib/bot/services/audit";
import { ResolvedCustomer } from "@/lib/bot/services/auth";
import {
  ConversationContext,
  getConversationState,
  IDLE_STATE,
  resetConversationState,
  setConversationState,
} from "@/lib/bot/services/conversation";
import { getActivePlanStatus } from "@/lib/bot/services/plan";
import { cancelOrder, CurrentOrder, getCurrentOrders } from "@/lib/bot/services/orders";
import { SupabaseClient } from "@supabase/supabase-js";

type InboundForDomain = { channel: string; text: string; callbackData?: string };

const NO_ACTIVE_WINDOW_MESSAGE: BotMessage = {
  text: "⏰ Hoy no hay ventana de pedidos activa. Los pedidos se reciben lunes, miércoles y viernes hasta las 9:00 PM.",
};

const CALLBACK_CREATE_ORDER = "menu:create_order";
const CALLBACK_VIEW_ORDER = "menu:view_order";
const CALLBACK_CANCEL_ORDER = "menu:cancel_order";
const CALLBACK_CANCEL_CONFIRM = "cancel:confirm";
const CALLBACK_CANCEL_DENY = "cancel:deny";

/** Único estado del flujo de cancelar (Tarea 18) — no hace falta un archivo propio
 * como createOrder.ts, es solo "¿seguro?" -> sí/no. */
const CANCEL_CONFIRM_STATE = "cancel:confirming";

/** Un cliente puede tener varios pedidos el mismo día (Tarea 25): antes de modificar o
 * cancelar, si hay más de uno, se pregunta cuál. El context solo guarda la acción — la
 * lista de pedidos se vuelve a leer al elegir, así nunca se actúa sobre uno viejo. */
const ORDER_PICK_STATE = "order:picking";
const CALLBACK_PICK_ORDER_PREFIX = "order:pick:";

const CREATE_FLOW_STATE_VALUES: string[] = Object.values(CREATE_FLOW_STATES);
const MID_FLOW_STATE_VALUES: string[] = [...CREATE_FLOW_STATE_VALUES, CANCEL_CONFIRM_STATE, ORDER_PICK_STATE];

function mainMenu(customerName: string | null): BotMessage {
  const greeting = customerName ? `¡Hola ${customerName}!` : "¡Hola!";
  return {
    text: `${greeting} 👋 ¿Qué quieres hacer?`,
    buttons: [
      { label: "🛒 Crear nuevo pedido", value: CALLBACK_CREATE_ORDER },
      { label: "📋 Ver / modificar mi pedido de hoy", value: CALLBACK_VIEW_ORDER },
      { label: "❌ Cancelar pedido", value: CALLBACK_CANCEL_ORDER },
    ],
  };
}

const NO_ORDER_YET_MESSAGE: BotMessage = {
  text: 'No tienes ningún pedido activo todavía. Usa "🛒 Crear nuevo pedido" en el menú para empezar uno.',
};

function cancelConfirmMessage(orderCode: string): BotMessage {
  return {
    text: `¿Seguro que quieres cancelar el pedido ${orderCode}? Esto no se puede deshacer.`,
    buttons: [
      { label: "✅ Sí, cancelar", value: CALLBACK_CANCEL_CONFIRM },
      { label: "❌ No, mantener pedido", value: CALLBACK_CANCEL_DENY },
    ],
  };
}

function cancelErrorMessage(error: unknown): string {
  if (error instanceof BotServiceError) {
    switch (error.code) {
      case "ORDER_NOT_FOUND":
        return "No encontré ese pedido — puede que ya haya sido cancelado.";
      case "ORDER_NOT_CANCELLABLE":
        return "Ese pedido ya no se puede cancelar (ya fue cancelado o ya salió a reparto).";
      case "PLAN_NOT_CANCELLABLE":
        return "El plan de entrega de este pedido ya no acepta cancelaciones.";
    }
  }
  return "Ocurrió un error inesperado cancelando tu pedido. Por favor intenta de nuevo.";
}

type Turn = { reply: BotMessage; nextState: string; nextContext: ConversationContext };

function idleTurn(reply: BotMessage): Turn {
  return { reply, nextState: IDLE_STATE, nextContext: {} };
}

type OrderAction = "edit" | "cancel";

function orderLabel(order: CurrentOrder): string {
  const first = order.items[0]?.product_name;
  if (!first) return `Pedido ${order.order_code}`;
  const more = order.items.length - 1;
  return more > 0
    ? `Pedido ${order.order_code} — ${first} y ${more} más`
    : `Pedido ${order.order_code} — ${first}`;
}

function orderPickerMessage(orders: CurrentOrder[], action: OrderAction): BotMessage {
  const verb = action === "edit" ? "modificar" : "cancelar";
  return {
    text: `Tienes ${orders.length} pedidos para hoy. ¿Cuál quieres ${verb}?`,
    buttons: orders.map((order) => ({
      label: orderLabel(order),
      value: `${CALLBACK_PICK_ORDER_PREFIX}${order.order_id}`,
    })),
  };
}

function turnForChosenOrder(action: OrderAction, order: CurrentOrder): Turn {
  if (action === "edit") {
    const step = startEditOrderFlow(order);
    return { reply: step.reply, nextState: step.nextState, nextContext: step.nextContext };
  }
  return {
    reply: cancelConfirmMessage(order.order_code),
    nextState: CANCEL_CONFIRM_STATE,
    nextContext: { order_id: order.order_id, order_code: order.order_code } as unknown as ConversationContext,
  };
}

/** 0 pedidos -> avisa; 1 -> directo a la acción (igual que antes de la Tarea 25); varios ->
 * pregunta cuál. */
function turnForOrders(action: OrderAction, orders: CurrentOrder[]): Turn {
  if (orders.length === 0) return idleTurn(NO_ORDER_YET_MESSAGE);
  if (orders.length === 1) return turnForChosenOrder(action, orders[0]);
  return {
    reply: orderPickerMessage(orders, action),
    nextState: ORDER_PICK_STATE,
    nextContext: { action } as unknown as ConversationContext,
  };
}

async function handleOrderPickStep(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  context: ConversationContext,
  inbound: InboundForDomain,
): Promise<Turn> {
  const action = context.action as OrderAction;
  const orders = await getCurrentOrders(supabaseClient, customerId);

  const pickedId = inbound.callbackData?.startsWith(CALLBACK_PICK_ORDER_PREFIX)
    ? inbound.callbackData.slice(CALLBACK_PICK_ORDER_PREFIX.length)
    : null;
  const chosen = pickedId ? orders.find((order) => order.order_id === pickedId) : undefined;

  // Un id que ya no está entre los pedidos activos (se canceló, botón viejo) o texto suelto:
  // se vuelve a mostrar la lista actualizada en vez de actuar sobre algo que no existe.
  return chosen ? turnForChosenOrder(action, chosen) : turnForOrders(action, orders);
}

async function handleCancelConfirmStep(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  context: ConversationContext,
  inbound: InboundForDomain,
): Promise<Turn> {
  const orderId = context.order_id as string;
  const orderCode = context.order_code as string;

  if (inbound.callbackData === CALLBACK_CANCEL_CONFIRM) {
    try {
      await cancelOrder(supabaseClient, orderId, customerId);
      await logInteraction(supabaseClient, {
        customer_id: customerId,
        channel: inbound.channel,
        action: "cancel_order",
        payload: { order_id: orderId },
        result: { order_id: orderId, order_code: orderCode },
      });
      return idleTurn({ text: `❌ Pedido ${orderCode} cancelado.${CONVERSATION_ENDED_NOTE}` });
    } catch (error) {
      await logInteraction(supabaseClient, {
        customer_id: customerId,
        channel: inbound.channel,
        action: "cancel_order",
        payload: { order_id: orderId },
        result: errorResult(error),
      });
      if (isUnexpectedError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        await notifyOps(`⚠️ Error no controlado en cancel_order (customer ${customerId}): ${message}`).catch(
          () => {},
        );
      }
      return idleTurn({ text: `${cancelErrorMessage(error)}${CONVERSATION_ENDED_NOTE}` });
    }
  }

  if (inbound.callbackData === CALLBACK_CANCEL_DENY) {
    return idleTurn({ text: `Ok, no se canceló nada.${CONVERSATION_ENDED_NOTE}` });
  }

  // Ni confirmar ni rechazar (ej. escribió texto suelto): vuelve a preguntar.
  return { reply: cancelConfirmMessage(orderCode), nextState: CANCEL_CONFIRM_STATE, nextContext: context };
}

async function computeTurn(
  supabaseClient: SupabaseClient<Database>,
  customer: ResolvedCustomer,
  inbound: InboundForDomain,
): Promise<Turn> {
  const planStatus = await getActivePlanStatus(supabaseClient);

  if (!planStatus || !planStatus.is_within_cutoff) {
    return idleTurn(NO_ACTIVE_WINDOW_MESSAGE);
  }

  // Los botones del Menú Principal siempre tienen prioridad — abandonan cualquier
  // flujo en curso, incluso a mitad de camino (§8: "reinicio a idle al abandonar un
  // flujo").
  if (inbound.callbackData === CALLBACK_VIEW_ORDER) {
    return turnForOrders("edit", await getCurrentOrders(supabaseClient, customer.customer_id));
  }
  if (inbound.callbackData === CALLBACK_CANCEL_ORDER) {
    return turnForOrders("cancel", await getCurrentOrders(supabaseClient, customer.customer_id));
  }
  if (inbound.callbackData === CALLBACK_CREATE_ORDER) {
    const step = await startCreateOrderFlow(supabaseClient, customer.customer_id);
    return { reply: step.reply, nextState: step.nextState, nextContext: step.nextContext };
  }

  // Ni un botón del menú — ¿estamos a mitad de un flujo de varios pasos ("crear/editar
  // pedido" o "confirmar cancelación")?
  const conversation = await getConversationState(supabaseClient, customer.customer_id, inbound.channel);
  if (CREATE_FLOW_STATE_VALUES.includes(conversation.state)) {
    const step = await handleCreateOrderStep(
      supabaseClient,
      customer.customer_id,
      conversation.state,
      conversation.context,
      inbound,
      planStatus.plan_date,
    );
    return { reply: step.reply, nextState: step.nextState, nextContext: step.nextContext };
  }
  if (conversation.state === CANCEL_CONFIRM_STATE) {
    return handleCancelConfirmStep(supabaseClient, customer.customer_id, conversation.context, inbound);
  }
  if (conversation.state === ORDER_PICK_STATE) {
    return handleOrderPickStep(supabaseClient, customer.customer_id, conversation.context, inbound);
  }

  // idle (o expiró), sin callback reconocido -> Menú Principal.
  return idleTurn(mainMenu(customer.name));
}

/**
 * Punto de entrada channel-agnostic del dominio del bot (§7) — no sabe si el mensaje
 * vino de Telegram o WhatsApp. El webhook de cada canal ya resolvió la whitelist antes
 * de llamar esto (recibe el customer ya resuelto, nunca null).
 *
 * Flujos conectados de verdad: 🛒 Crear pedido y 📋 Ver/modificar pedido (Tareas 15 y 17,
 * ambos en `lib/bot/flows/createOrder.ts` — "modificar" reutiliza el mismo loop,
 * terminando en `updateOrder` en vez de `createOrder`), y ❌ Cancelar pedido (Tarea 18,
 * `cancel:confirming` acá mismo — solo pide "¿seguro?" antes de llamar `cancelOrder`).
 *
 * Estado de conversación (§8): cada turno persiste el `nextState`/`nextContext` que
 * decide `computeTurn` — `idle` reinicia (vía `resetConversationState`), cualquier otra
 * cosa (los estados `create:*`, `order:picking` y `cancel:confirming`) se guarda para el próximo mensaje.
 */
export async function handleInboundMessage(
  supabaseClient: SupabaseClient<Database>,
  customer: ResolvedCustomer,
  inbound: InboundForDomain,
): Promise<BotMessage> {
  const { reply, nextState, nextContext } = await computeTurn(supabaseClient, customer, inbound);

  if (nextState === IDLE_STATE) {
    await resetConversationState(supabaseClient, customer.customer_id, inbound.channel);
  } else {
    await setConversationState(supabaseClient, customer.customer_id, inbound.channel, nextState, nextContext);
  }

  return reply;
}

const CALLBACK_CHOOSE_CUSTOMER_PREFIX = "bot:choose_customer:"; // + "<action>:<customer_id>"

type PendingAction = "create" | "view" | "cancel";

const ACTION_TO_CALLBACK: Record<PendingAction, string> = {
  create: CALLBACK_CREATE_ORDER,
  view: CALLBACK_VIEW_ORDER,
  cancel: CALLBACK_CANCEL_ORDER,
};

const CALLBACK_TO_ACTION: Record<string, PendingAction> = {
  [CALLBACK_CREATE_ORDER]: "create",
  [CALLBACK_VIEW_ORDER]: "view",
  [CALLBACK_CANCEL_ORDER]: "cancel",
};

function disambiguationMessage(candidates: ResolvedCustomer[], action: PendingAction): BotMessage {
  return {
    text: "Este número tiene más de una cuenta asociada. ¿Para cuál es esto?",
    buttons: candidates.map((c) => ({
      label: c.name ?? "(sin nombre)",
      value: `${CALLBACK_CHOOSE_CUSTOMER_PREFIX}${action}:${c.customer_id}`,
    })),
  };
}

/**
 * Un mismo whatsapp_id/external_id de canal puede resolver a más de un `customer`
 * (varios clientes o puntos de entrega compartiendo un número — ver
 * `lib/bot/services/auth.ts`, `resolveCustomerCandidates`). Este es el punto de entrada
 * real que debe usar el webhook de cada canal; decide primero *para cuál* `customer_id`
 * es el turno antes de delegar en `handleInboundMessage`.
 *
 * Sin estado nuevo: si alguno de los candidatos está a mitad de un flujo de varios pasos
 * (crear/editar pedido, eligiendo cuál de varios pedidos, o confirmando una cancelación), el mensaje es para ese (tiene
 * prioridad, igual que hoy un botón del Menú Principal abandona un flujo en curso). Si
 * nadie está a mitad de flujo y tocan una acción del Menú Principal, primero se pregunta
 * para cuál cliente es — la respuesta llega
 * codificada en el propio callbackData del botón que generamos, así que no hace falta
 * persistir nada. Terminado o cancelado el pedido, todos vuelven a quedar en idle y la
 * próxima acción se vuelve a preguntar.
 */
export async function handleInboundMessageForChannel(
  supabaseClient: SupabaseClient<Database>,
  candidates: ResolvedCustomer[],
  inbound: InboundForDomain,
): Promise<BotMessage> {
  if (candidates.length === 1) {
    return handleInboundMessage(supabaseClient, candidates[0], inbound);
  }

  const states = await Promise.all(
    candidates.map((c) => getConversationState(supabaseClient, c.customer_id, inbound.channel)),
  );
  const activeIndex = states.findIndex((s) => MID_FLOW_STATE_VALUES.includes(s.state));
  if (activeIndex !== -1) {
    return handleInboundMessage(supabaseClient, candidates[activeIndex], inbound);
  }

  if (inbound.callbackData?.startsWith(CALLBACK_CHOOSE_CUSTOMER_PREFIX)) {
    const rest = inbound.callbackData.slice(CALLBACK_CHOOSE_CUSTOMER_PREFIX.length);
    const lastColon = rest.lastIndexOf(":");
    const action = rest.slice(0, lastColon) as PendingAction;
    const customerId = rest.slice(lastColon + 1);
    // Nunca confiar en el customer_id del callback sin validar que de verdad pertenece
    // a este número — el payload del webhook es input no confiable.
    const chosen = candidates.find((c) => c.customer_id === customerId);
    if (chosen && action in ACTION_TO_CALLBACK) {
      return handleInboundMessage(supabaseClient, chosen, {
        ...inbound,
        text: "",
        callbackData: ACTION_TO_CALLBACK[action],
      });
    }
    // customer_id ajeno a este número o acción corrupta: cae al menú genérico de abajo.
  }

  const action = CALLBACK_TO_ACTION[inbound.callbackData ?? ""];
  if (action) {
    return disambiguationMessage(candidates, action);
  }

  // Ni acción ni elección reconocida (ej. "hola" en frío): menú genérico, sin nombre
  // porque todavía no sabemos de cuál cliente se trata.
  return mainMenu(null);
}
