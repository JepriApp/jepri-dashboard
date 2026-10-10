import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resolveCustomerCandidates } from "@/lib/bot/services/auth";
import { withPrivilegedClient } from "@/lib/bot/test-fixtures";

/**
 * Tarea 20 (§10): red de seguridad del webhook ante un error NO controlado (uno que
 * escapa de todo lo que domain.ts/createOrder.ts ya atrapan). Archivo separado de
 * route.test.ts porque acá sí hace falta mockear la capa de servicios para forzar ese
 * escape — route.test.ts se mantiene 100% integración real a propósito.
 */
vi.mock("@/lib/bot/services/auth", () => ({
  resolveCustomerCandidates: vi.fn(),
}));

const WHITELISTED_CHAT_ID = 8703567026;
const WEBHOOK_SECRET = "test-webhook-secret-tarea-20";
const mockResolveCustomerCandidates = vi.mocked(resolveCustomerCandidates);

function textUpdate(updateId: number, chatId: number) {
  return {
    update_id: updateId,
    message: { message_id: 1, chat: { id: chatId, type: "private" }, date: 1700000000, text: "hola" },
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/bot/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    body: JSON.stringify(body),
  });
}

/**
 * supabase-js usa fetch para sus propias llamadas REST contra staging — esto solo
 * intercepta las llamadas a la Bot API de Telegram; todo lo demás sigue yendo al fetch
 * real (mismo patrón que route.test.ts).
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
    await client.query("delete from bot_processed_update where channel = 'telegram' and update_id = any($1)", [
      ids.map(String),
    ]);
  });
}

describe("POST /api/bot/telegram — red de seguridad ante un error no controlado (Tarea 20)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("un error no controlado (ej. resolveCustomerCandidates falla) dispara notifyOps, responde genérico al cliente, y devuelve 200", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    vi.stubEnv("TELEGRAM_OPS_CHAT_ID", "ops-chat-123");
    mockResolveCustomerCandidates.mockRejectedValue(new Error("conexión a la base caída"));
    const telegramCalls = mockTelegramFetch();

    const updateId = 900000900;
    const response = await POST(makeRequest(textUpdate(updateId, WHITELISTED_CHAT_ID)));

    expect(response.status).toBe(200);

    const opsAlert = telegramCalls.find((c) => (c.body.chat_id as string) === "ops-chat-123");
    expect(opsAlert).toBeTruthy();
    expect(opsAlert?.body.text as string).toMatch(/error no controlado/i);
    expect(opsAlert?.body.text as string).toContain("conexión a la base caída");

    const customerReply = telegramCalls.find((c) => (c.body.chat_id as string) === String(WHITELISTED_CHAT_ID));
    expect(customerReply).toBeTruthy();
    expect(customerReply?.body.text as string).toMatch(/error inesperado/i);

    await cleanupUpdateIds([updateId]);
  });

  it("si notifyOps también falla (ej. sin TELEGRAM_OPS_CHAT_ID), igual responde 200 y no revienta", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    vi.stubEnv("TELEGRAM_OPS_CHAT_ID", "");
    mockResolveCustomerCandidates.mockRejectedValue(new Error("boom"));
    mockTelegramFetch();

    const updateId = 900000901;
    const response = await POST(makeRequest(textUpdate(updateId, WHITELISTED_CHAT_ID)));

    expect(response.status).toBe(200);

    await cleanupUpdateIds([updateId]);
  });
});
