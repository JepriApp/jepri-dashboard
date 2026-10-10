import { apiErrorResponse, isAuthorizedRequest, unauthorizedResponse } from "@/lib/bot/httpApi";
import { createOrder, OrderItemInput } from "@/lib/bot/services/orders";
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
 * `POST /api/bot/orders` (§4) — equivalente HTTP de `createOrder`, para un adaptador
 * de canal fuera de proceso (Tarea 21). Protegida con API key (§4.1); Telegram (en
 * proceso) no la usa, llama el servicio directo.
 */
export async function POST(req: Request) {
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
    const created = await createOrder(supabase, customerId, items);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
