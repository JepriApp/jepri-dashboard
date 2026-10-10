import { apiErrorResponse, isAuthorizedRequest, unauthorizedResponse } from "@/lib/bot/httpApi";
import { searchCatalog } from "@/lib/bot/services/products";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * `GET /api/bot/products/search?q=` (§4) — equivalente HTTP de `searchCatalog`, para
 * un adaptador de canal fuera de proceso (Tarea 21). Protegida con API key (§4.1);
 * Telegram (en proceso) no la usa, llama el servicio directo.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  if (!(await isAuthorizedRequest(req, supabase))) {
    return unauthorizedResponse();
  }

  const q = new URL(req.url).searchParams.get("q");
  if (!q) {
    return NextResponse.json({ error: "q es requerido" }, { status: 400 });
  }

  try {
    const results = await searchCatalog(supabase, q);
    return NextResponse.json(results);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
