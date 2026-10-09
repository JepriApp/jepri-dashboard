import { Database } from "@/database.types";
import { BotMessage } from "@/lib/bot/channel";
import { CREATE_FLOW_STATES, handleCreateOrderStep, startCreateOrderFlow } from "@/lib/bot/flows/createOrder";
import { ResolvedCustomer } from "@/lib/bot/services/auth";
import {
  ConversationContext,
  getConversationState,
  IDLE_STATE,
  resetConversationState,
  setConversationState,
} from "@/lib/bot/services/conversation";
import { getActivePlanStatus } from "@/lib/bot/services/plan";
import { getCurrentOrder } from "@/lib/bot/services/orders";
import { SupabaseClient } from "@supabase/supabase-js";

type InboundForDomain = { channel: string; text: string; callbackData?: string };

const NO_ACTIVE_WINDOW_MESSAGE: BotMessage = {
  text: "⏰ Hoy no hay ventana de pedidos activa. Los pedidos se reciben lunes, miércoles y viernes hasta las 9:00 PM.",
};

const NOT_IMPLEMENTED_YET_MESSAGE: BotMessage = {
  text: "Esta opción todavía no está disponible — vuelve pronto.",
};

const CALLBACK_CREATE_ORDER = "menu:create_order";
const CALLBACK_VIEW_ORDER = "menu:view_order";
const CALLBACK_CANCEL_ORDER = "menu:cancel_order";

const CREATE_FLOW_STATE_VALUES: string[] = Object.values(CREATE_FLOW_STATES);

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

async function viewOrderMessage(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
): Promise<BotMessage> {
  const order = await getCurrentOrder(supabaseClient, customerId);

  if (!order) {
    return {
      text: 'No tienes ningún pedido activo todavía. Usa "🛒 Crear nuevo pedido" en el menú para empezar uno.',
    };
  }

  const statusLabel = order.status === "pending" ? "pendiente" : order.status;
  const itemWord = order.items.length === 1 ? "producto" : "productos";

  return {
    text: `📋 Tu pedido ${order.order_code} está ${statusLabel}, con ${order.items.length} ${itemWord}.`,
  };
}

type Turn = { reply: BotMessage; nextState: string; nextContext: ConversationContext };

function idleTurn(reply: BotMessage): Turn {
  return { reply, nextState: IDLE_STATE, nextContext: {} };
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
    return idleTurn(await viewOrderMessage(supabaseClient, customer.customer_id));
  }
  if (inbound.callbackData === CALLBACK_CANCEL_ORDER) {
    return idleTurn(NOT_IMPLEMENTED_YET_MESSAGE);
  }
  if (inbound.callbackData === CALLBACK_CREATE_ORDER) {
    const step = await startCreateOrderFlow(supabaseClient, customer.customer_id);
    return { reply: step.reply, nextState: step.nextState, nextContext: step.nextContext };
  }

  // Ni un botón del menú — ¿estamos a mitad del flujo de "crear pedido"?
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

  // idle (o expiró), sin callback reconocido -> Menú Principal.
  return idleTurn(mainMenu(customer.name));
}

/**
 * Punto de entrada channel-agnostic del dominio del bot (§7) — no sabe si el mensaje
 * vino de Telegram o WhatsApp. El webhook de cada canal ya resolvió la whitelist antes
 * de llamar esto (recibe el customer ya resuelto, nunca null).
 *
 * Flujos conectados de verdad: 📋 Ver pedido (Tarea 13) y 🛒 Crear pedido (Tarea 15,
 * `lib/bot/flows/createOrder.ts`). ❌ Cancelar devuelve un placeholder hasta la Tarea 17.
 *
 * Estado de conversación (§8): cada turno persiste el `nextState`/`nextContext` que
 * decide `computeTurn` — `idle` reinicia (vía `resetConversationState`), cualquier otra
 * cosa (los estados `create:*`) se guarda para el próximo mensaje.
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
 * Sin estado nuevo: si alguno de los candidatos está a mitad del flujo de crear pedido,
 * el mensaje es para ese (tiene prioridad, igual que hoy un botón del Menú Principal
 * abandona un flujo en curso). Si nadie está a mitad de flujo y tocan una acción del
 * Menú Principal, primero se pregunta para cuál cliente es — la respuesta llega
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
  const activeIndex = states.findIndex((s) => CREATE_FLOW_STATE_VALUES.includes(s.state));
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
