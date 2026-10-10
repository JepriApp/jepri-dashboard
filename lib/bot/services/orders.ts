import { Database } from "@/database.types";
import { parsePostgresError } from "@/lib/bot/errors";
import { SupabaseClient } from "@supabase/supabase-js";

export type OrderItemInput = {
  product_id: string;
  required_quantity: number;
};

export type OrderItem = {
  product_id: string;
  product_name: string;
  unit: string;
  required_quantity: number;
};

export type CurrentOrder = {
  order_id: string;
  order_code: string;
  status: string;
  items: OrderItem[];
};

export type CreatedOrder = {
  order_id: string;
  order_code: string;
};

/**
 * Pedidos activos (no cancelados) del cliente en el plan vigente (§3.1), el más antiguo
 * primero — puede haber varios el mismo día (Tarea 25). Lista vacía si no tiene ninguno,
 * nunca lanza por esto (es un estado normal, no un error).
 *
 * La función de Postgres conserva el nombre `bot_get_current_order` (en singular) a
 * propósito: ver la migración 20261012000000.
 */
export async function getCurrentOrders(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
): Promise<CurrentOrder[]> {
  const { data, error } = await supabaseClient.rpc("bot_get_current_order", {
    p_customer_id: customerId,
  });

  if (error) throw parsePostgresError(error);

  return (data ?? []).map((row) => ({
    order_id: row.order_id,
    order_code: row.order_code,
    status: row.status,
    items: (row.items ?? []) as OrderItem[],
  }));
}

/**
 * Crea un pedido para el plan activo (§3.1-§3.3). Errores posibles (BotServiceError.code):
 * NO_ACTIVE_PLAN, PAST_CUTOFF.
 */
export async function createOrder(
  supabaseClient: SupabaseClient<Database>,
  customerId: string,
  items: OrderItemInput[],
): Promise<CreatedOrder> {
  const { data, error } = await supabaseClient.rpc("bot_create_order", {
    p_customer_id: customerId,
    p_items: items,
  });

  if (error) throw parsePostgresError(error);

  const row = data?.[0];
  if (!row) {
    throw new Error("bot_create_order no devolvió ninguna fila (inesperado, no debería pasar)");
  }

  return { order_id: row.order_id, order_code: row.order_code };
}

/**
 * Reemplaza por completo los items de un pedido propio del cliente (§3.4). Errores
 * posibles: ORDER_NOT_FOUND, ORDER_NOT_EDITABLE, PLAN_NOT_EDITABLE, PAST_CUTOFF.
 */
export async function updateOrder(
  supabaseClient: SupabaseClient<Database>,
  orderId: string,
  customerId: string,
  items: OrderItemInput[],
): Promise<void> {
  const { error } = await supabaseClient.rpc("bot_update_order", {
    p_order_id: orderId,
    p_customer_id: customerId,
    p_items: items,
  });

  if (error) throw parsePostgresError(error);
}

/**
 * Soft-cancel (nunca DELETE) de un pedido propio del cliente (§3.4). Errores
 * posibles: ORDER_NOT_FOUND, ORDER_NOT_CANCELLABLE, PLAN_NOT_CANCELLABLE.
 */
export async function cancelOrder(
  supabaseClient: SupabaseClient<Database>,
  orderId: string,
  customerId: string,
): Promise<void> {
  const { error } = await supabaseClient.rpc("bot_cancel_order", {
    p_order_id: orderId,
    p_customer_id: customerId,
  });

  if (error) throw parsePostgresError(error);
}
