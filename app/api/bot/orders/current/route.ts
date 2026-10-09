import { apiErrorResponse, isAuthorizedRequest, unauthorizedResponse } from "@/lib/bot/httpApi";
import { getCurrentOrder } from "@/lib/bot/services/orders";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * `GET /api/bot/orders/current?customer_id=` (§4) — equivalente HTTP de
 * `getCurrentOrder`, para un adaptador de canal fuera de proceso (Tarea 21). Protegida
 * con API key (§4.1); Telegram (en proceso) no la usa, llama el servicio directo.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  if (!(await isAuthorizedRequest(req, supabase))) {
    return unauthorizedResponse();
  }

  const customerId = new URL(req.url).searchParams.get("customer_id");
  if (!customerId) {
    return NextResponse.json({ error: "customer_id es requerido" }, { status: 400 });
  }

  try {
    const order = await getCurrentOrder(supabase, customerId);
    return NextResponse.json(order);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
