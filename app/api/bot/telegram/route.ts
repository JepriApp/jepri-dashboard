import { parseInbound, sendMessage } from "@/lib/bot/adapters/telegram";
import { handleInboundMessage } from "@/lib/bot/domain";
import { resolveCustomer } from "@/lib/bot/services/auth";
import { markUpdateProcessed } from "@/lib/bot/services/idempotency";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Webhook de Telegram (documentacion/chatbot_diseno.md §9).
 *
 * Orden estricto, cada paso corta antes de tocar el siguiente:
 *   1. X-Telegram-Bot-Api-Secret-Token  -> 401 sin tocar ninguna tabla si no coincide
 *   2. bot_mark_update_processed        -> 200 inmediato si el update_id ya se procesó
 *   3. parseInbound                     -> 200 (se ignora) si el tipo de update no se soporta
 *   4. resolveCustomer (whitelist)      -> 200 (se ignora en silencio) si no hay match
 *   5. handleInboundMessage (§7)        -> dominio channel-agnostic del bot (Tarea 13+)
 */
export async function POST(req: Request) {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json();
  const updateId = payload?.update_id;

  const supabase = await createClient();

  if (updateId !== undefined && updateId !== null) {
    const isFirstTime = await markUpdateProcessed(supabase, "telegram", String(updateId));
    if (!isFirstTime) {
      return NextResponse.json({ ok: true });
    }
  }

  let inbound;
  try {
    inbound = parseInbound(payload);
  } catch {
    // Tipo de update no soportado (edited_message, my_chat_member, etc.) — se ignora,
    // no es un error de negocio.
    return NextResponse.json({ ok: true });
  }

  const customer = await resolveCustomer(supabase, inbound.externalId);
  if (!customer) {
    // No whitelisteado: se ignora en silencio, sin responder nada (tal como pide la spec).
    return NextResponse.json({ ok: true });
  }

  const reply = await handleInboundMessage(supabase, customer, {
    text: inbound.text,
    callbackData: inbound.callbackData,
  });
  await sendMessage(inbound.externalId, reply);

  return NextResponse.json({ ok: true });
}
