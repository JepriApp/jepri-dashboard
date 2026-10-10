import { apiErrorResponse, isAuthorizedRequest, unauthorizedResponse } from "@/lib/bot/httpApi";
import { cancelOrder, OrderItemInput, updateOrder } from "@/lib/bot/services/orders";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function parseItems(value: unknown): OrderItemInput[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter(
    (item): item is OrderItemInput =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as OrderItemInput).product_id === "string" &&
      typeof (item as OrderItemInput).required_quantity === "number",
  );
  return items.length === value.length ? items : null;
}

/**
 * `PUT /api/bot/orders/:id` (§4) — equivalente HTTP de `updateOrder`, para un
 * adaptador de canal fuera de proceso (Tarea 21). Protegida con API key (§4.1);
 * Telegram (en proceso) no la usa, llama el servicio directo.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params;
  const supabase = await createClient();
  if (!(await isAuthorizedRequest(req, supabase))) {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const customerId = body?.customer_id;
  const items = parseItems(body?.items);

  if (typeof customerId !== "string" || !items) {
    return NextResponse.json(
      { error: "customer_id (string) e items ([{product_id, required_quantity}]) son requeridos" },
      { status: 400 },
    );
  }

  try {
    await updateOrder(supabase, orderId, customerId, items);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * `DELETE /api/bot/orders/:id?customer_id=` (§4) — equivalente HTTP de `cancelOrder`
 * (soft-cancel, nunca borra la fila), para un adaptador de canal fuera de proceso
 * (Tarea 21). Protegida con API key (§4.1); Telegram (en proceso) no la usa, llama el
 * servicio directo.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await params;
  const supabase = await createClient();
  if (!(await isAuthorizedRequest(req, supabase))) {
    return unauthorizedResponse();
  }

  const customerId = new URL(req.url).searchParams.get("customer_id");
  if (!customerId) {
    return NextResponse.json({ error: "customer_id es requerido" }, { status: 400 });
  }

  try {
    await cancelOrder(supabase, orderId, customerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
