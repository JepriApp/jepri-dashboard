import { Database } from "@/database.types";
import { BotMessage } from "@/lib/bot/channel";
import { ResolvedCustomer } from "@/lib/bot/services/auth";
import { getActivePlanStatus } from "@/lib/bot/services/plan";
import { getCurrentOrder } from "@/lib/bot/services/orders";
import { SupabaseClient } from "@supabase/supabase-js";

const NO_ACTIVE_WINDOW_MESSAGE: BotMessage = {
  text: "⏰ Hoy no hay ventana de pedidos activa. Los pedidos se reciben lunes, miércoles y viernes hasta las 9:00 PM.",
};

const NOT_IMPLEMENTED_YET_MESSAGE: BotMessage = {
  text: "Esta opción todavía no está disponible — vuelve pronto.",
};

const CALLBACK_CREATE_ORDER = "menu:create_order";
const CALLBACK_VIEW_ORDER = "menu:view_order";
const CALLBACK_CANCEL_ORDER = "menu:cancel_order";

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

/**
 * Punto de entrada channel-agnostic del dominio del bot (§7) — no sabe si el mensaje
 * vino de Telegram o WhatsApp. El webhook de cada canal ya resolvió la whitelist antes
 * de llamar esto (recibe el customer ya resuelto, nunca null).
 *
 * Todavía solo lectura: 📋 Ver pedido es la única opción conectada de verdad (Tarea
 * 13). 🛒 Crear y ❌ Cancelar devuelven un placeholder hasta las Tareas 15 y 17.
 */
export async function handleInboundMessage(
  supabaseClient: SupabaseClient<Database>,
  customer: ResolvedCustomer,
  inbound: { text: string; callbackData?: string },
): Promise<BotMessage> {
  const planStatus = await getActivePlanStatus(supabaseClient);

  if (!planStatus || !planStatus.is_within_cutoff) {
    return NO_ACTIVE_WINDOW_MESSAGE;
  }

  if (inbound.callbackData === CALLBACK_VIEW_ORDER) {
    return viewOrderMessage(supabaseClient, customer.customer_id);
  }

  if (inbound.callbackData === CALLBACK_CREATE_ORDER || inbound.callbackData === CALLBACK_CANCEL_ORDER) {
    return NOT_IMPLEMENTED_YET_MESSAGE;
  }

  return mainMenu(customer.name);
}
