import { afterEach, describe, expect, it, vi } from "vitest";
import { withPrivilegedClient } from "@/lib/bot/test-fixtures";
import { POST } from "./route";

// Cliente de prueba de la Tarea 1 (customer.whatsapp_id=8703567026), en staging.
const WHITELISTED_CHAT_ID = 8703567026;
const NOT_WHITELISTED_CHAT_ID = 1;
const WEBHOOK_SECRET = "test-webhook-secret-tarea-12";

function textUpdate(updateId: number, chatId: number, text = "hola") {
  return {
    update_id: updateId,
    message: {
      message_id: 1,
      chat: { id: chatId, type: "private" },
      date: 1700000000,
      text,
    },
  };
}

function makeRequest(body: unknown, secret: string | undefined = WEBHOOK_SECRET) {
  return new Request("http://localhost/api/bot/telegram", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret !== undefined ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * supabase-js usa fetch para sus propias llamadas REST contra staging — un
 * vi.stubGlobal("fetch", ...) a secas rompería eso también. Esto solo intercepta
 * las llamadas a la Bot API de Telegram; todo lo demás (incluido Supabase) sigue
 * yendo al fetch real.
 */
function mockTelegramFetch(): { url: string; body: Record<string, unknown> }[] {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("https://api.telegram.org")) {
        calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : {} });
        return { ok: true } as Response;
      }
      return realFetch(url as string, init);
    }),
  );

  return calls;
}

async function cleanupUpdateIds(ids: number[]) {
  await withPrivilegedClient(async (client) => {
    await client.query(
      "delete from bot_processed_update where channel = 'telegram' and update_id = any($1)",
      [ids.map(String)],
    );
  });
}

describe("POST /api/bot/telegram", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sin el secreto correcto devuelve 401 y no toca bot_processed_update", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const telegramCalls = mockTelegramFetch();

    const updateId = 900000001;
    const response = await POST(makeRequest(textUpdate(updateId, WHITELISTED_CHAT_ID), "wrong-secret"));

    expect(response.status).toBe(401);
    expect(telegramCalls).toHaveLength(0);

    const exists = await withPrivilegedClient(async (client) => {
      const { rows } = await client.query(
        "select 1 from bot_processed_update where channel='telegram' and update_id=$1",
        [String(updateId)],
      );
      return rows.length > 0;
    });
    expect(exists).toBe(false);
  });

  it("un update_id repetido responde 200 la segunda vez sin reprocesar", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const telegramCalls = mockTelegramFetch();

    const updateId = 900000002;
    const body = textUpdate(updateId, WHITELISTED_CHAT_ID);

    const first = await POST(makeRequest(body));
    expect(first.status).toBe(200);
    expect(telegramCalls).toHaveLength(1); // sendMessage al cliente whitelisteado

    const second = await POST(makeRequest(body));
    expect(second.status).toBe(200);
    expect(telegramCalls).toHaveLength(1); // no se volvió a llamar — no se reprocesó

    await cleanupUpdateIds([updateId]);
  });

  it("un chat_id no whitelisteado responde 200 sin enviar ninguna respuesta", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const telegramCalls = mockTelegramFetch();

    const updateId = 900000003;
    const response = await POST(makeRequest(textUpdate(updateId, NOT_WHITELISTED_CHAT_ID)));

    expect(response.status).toBe(200);
    expect(telegramCalls).toHaveLength(0);

    await cleanupUpdateIds([updateId]);
  });

  it("un chat_id whitelisteado recibe una respuesta", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const telegramCalls = mockTelegramFetch();

    const updateId = 900000004;
    const response = await POST(makeRequest(textUpdate(updateId, WHITELISTED_CHAT_ID)));

    expect(response.status).toBe(200);
    expect(telegramCalls).toHaveLength(1);
    expect(telegramCalls[0].body.chat_id).toBe(String(WHITELISTED_CHAT_ID));

    await cleanupUpdateIds([updateId]);
  });

  it("un tipo de update no soportado responde 200 sin reventar ni enviar nada", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const telegramCalls = mockTelegramFetch();

    const updateId = 900000005;
    const response = await POST(
      makeRequest({ update_id: updateId, my_chat_member: { new_chat_member: {} } }),
    );

    expect(response.status).toBe(200);
    expect(telegramCalls).toHaveLength(0);

    await cleanupUpdateIds([updateId]);
  });
});
