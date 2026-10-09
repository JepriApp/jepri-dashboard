import { notifyOps, parseInbound, sendMessage } from "@/lib/bot/adapters/telegram";
import { handleInboundMessageForChannel } from "@/lib/bot/domain";
import { resolveCustomerCandidates } from "@/lib/bot/services/auth";
import { markUpdateProcessed } from "@/lib/bot/services/idempotency";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const GENERIC_ERROR_MESSAGE = {
  text: "Ocurrió un error inesperado. Por favor intenta de nuevo en un momento.",
};

/**
 * Webhook de Telegram (documentacion/chatbot_diseno.md §9).
 *
 * Orden estricto, cada paso corta antes de tocar el siguiente:
 *   1. X-Telegram-Bot-Api-Secret-Token  -> 401 sin tocar ninguna tabla si no coincide
 *   2. bot_mark_update_processed        -> 200 inmediato si el update_id ya se procesó
 *   3. parseInbound                     -> 200 (se ignora) si el tipo de update no se soporta
 *   4. resolveCustomerCandidates (whitelist) -> 200 (se ignora en silencio) si no hay match
 *   5. handleInboundMessageForChannel (§7)   -> dominio channel-agnostic del bot (Tarea 13+);
 *      un mismo whatsapp_id puede resolver a varios customer (Tarea 16) — esa función
 *      decide para cuál antes de delegar en handleInboundMessage.
 *
 * Red de seguridad (Tarea 20, §10): los errores de negocio esperados (los 8 códigos)
 * nunca llegan hasta acá — domain.ts/createOrder.ts ya los atrapan y responden con un
 * mensaje amigable. Lo que sí puede escapar hasta acá es un error NO controlado (una
 * RPC caída, un bug) en cualquiera de los pasos 2-5; ese caso sí dispara `notifyOps` y
 * le deja al cliente una respuesta genérica en vez de dejarlo sin ninguna.
 */
export async function POST(req: Request) {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json();

  try {
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

    const candidates = await resolveCustomerCandidates(supabase, inbound.externalId);
    if (candidates.length === 0) {
      // No whitelisteado: se ignora en silencio, sin responder nada (tal como pide la spec).
      return NextResponse.json({ ok: true });
    }

    const reply = await handleInboundMessageForChannel(supabase, candidates, {
      channel: inbound.channel,
      text: inbound.text,
      callbackData: inbound.callbackData,
    });
    await sendMessage(inbound.externalId, reply);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await notifyOps(`⚠️ Error no controlado en el webhook de Telegram: ${message}`).catch(() => {});

    const externalId = payload?.message?.chat?.id ?? payload?.callback_query?.message?.chat?.id;
    if (externalId !== undefined) {
      await sendMessage(String(externalId), GENERIC_ERROR_MESSAGE).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }
}
