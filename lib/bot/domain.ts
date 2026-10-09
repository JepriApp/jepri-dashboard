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
