import { Database } from "@/database.types";
import { BotServiceError } from "@/lib/bot/errors";
import { validateApiKey } from "@/lib/bot/services/auth";
import { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Autenticación de la API HTTP con API key (§4.1, Tarea 21) — capa separada del
 * `secret_token` de cada webhook de canal (§9): esto autentica "qué adaptador llama",
 * no "esto viene de verdad de Telegram/WhatsApp". Sin match -> el llamador debe
 * responder 401 sin ejecutar nada (nunca se asume autorizado por defecto).
 */
export async function isAuthorizedRequest(
  req: Request,
  supabaseClient: SupabaseClient<Database>,
): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;

  return validateApiKey(supabaseClient, match[1]);
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/**
 * Traduce un error de las funciones de servicio (Tareas 7-8) a una respuesta HTTP —
 * los 7 códigos de negocio (§5/§7) son 400 (el llamador mandó algo que no se puede
 * hacer ahora), cualquier otro error es 500. Nunca se expone el mensaje crudo de
 * Postgres para un 500, igual que el bot nunca lo expone en el chat.
 */
export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof BotServiceError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "UNKNOWN", message: "Ocurrió un error inesperado." }, { status: 500 });
}
