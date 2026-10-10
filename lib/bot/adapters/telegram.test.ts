import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyOps, parseInbound, sendMessage } from "@/lib/bot/adapters/telegram";

// Fixtures reales, capturados de getUpdates contra @Jepridevbot (Tarea 1).
const REAL_TEXT_UPDATE = {
  update_id: 309045614,
  message: {
    message_id: 2,
    from: { id: 8703567026, is_bot: false, first_name: "Ryuma", last_name: "Nakano" },
    chat: { id: 8703567026, first_name: "Ryuma", last_name: "Nakano", type: "private" },
    date: 1791488649,
    text: "Hola",
  },
};

const REAL_CALLBACK_QUERY_UPDATE = {
  update_id: 309045700,
  callback_query: {
    id: "123456789",
    from: { id: 8703567026, is_bot: false, first_name: "Ryuma" },
    message: {
      message_id: 10,
      chat: { id: 8703567026, type: "private" },
      date: 1791488700,
      text: "¿Qué quieres hacer?",
    },
    chat_instance: "abc",
    data: "menu:create_order",
  },
};

describe("parseInbound", () => {
  it("traduce un mensaje de texto", () => {
    const result = parseInbound(REAL_TEXT_UPDATE);
    expect(result).toEqual({
      channel: "telegram",
      externalId: "8703567026",
      text: "Hola",
    });
  });

  it("traduce un callback_query (botón inline) resolviendo el chat desde message.chat", () => {
    const result = parseInbound(REAL_CALLBACK_QUERY_UPDATE);
    expect(result).toEqual({
      channel: "telegram",
      externalId: "8703567026",
      text: "",
      callbackData: "menu:create_order",
    });
  });

  it("lanza para un tipo de update no soportado (ni message ni callback_query)", () => {
    expect(() => parseInbound({ update_id: 1, my_chat_member: {} })).toThrow();
  });

  it("lanza si un callback_query no trae message (no se puede saber a qué chat responder)", () => {
    expect(() =>
      parseInbound({
        update_id: 1,
        callback_query: { id: "1", from: { id: 1 }, data: "x" },
      }),
    ).toThrow();
  });
});

describe("sendMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("envía texto plano sin reply_markup cuando no hay botones", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("8703567026", { text: "Hola" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botfake-token/sendMessage");
    const body = JSON.parse(options.body);
    expect(body).toEqual({ chat_id: "8703567026", text: "Hola" });
  });

  it("traduce buttons a un teclado inline, un botón por fila", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("8703567026", {
      text: "¿Qué quieres hacer?",
      buttons: [
        { label: "🛒 Crear nuevo pedido", value: "menu:create_order" },
        { label: "❌ Cancelar pedido", value: "menu:cancel_order" },
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reply_markup).toEqual({
      inline_keyboard: [
        [{ text: "🛒 Crear nuevo pedido", callback_data: "menu:create_order" }],
        [{ text: "❌ Cancelar pedido", callback_data: "menu:cancel_order" }],
      ],
    });
  });

  it("buttonRows agrupa varios botones en la misma fila (ej. [5] para los 5 juntos)", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("8703567026", {
      text: "¿Cuántos kg quieres?",
      buttons: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: `create:qty:${n}` })),
      buttonRows: [5],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reply_markup).toEqual({
      inline_keyboard: [
        [1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `create:qty:${n}` })),
      ],
    });
  });

  it("buttonRows con varios tamaños reparte los botones fila por fila (ej. [2, 1])", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage("8703567026", {
      text: "Elige",
      buttons: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
        { label: "C", value: "c" },
      ],
      buttonRows: [2, 1],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reply_markup).toEqual({
      inline_keyboard: [
        [
          { text: "A", callback_data: "a" },
          { text: "B", callback_data: "b" },
        ],
        [{ text: "C", callback_data: "c" }],
      ],
    });
  });

  it("lanza si la Bot API responde con un error", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "Bad Request" }),
    );

    await expect(sendMessage("8703567026", { text: "Hola" })).rejects.toThrow(/400/);
  });

  it("lanza si TELEGRAM_BOT_TOKEN no está seteada", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    await expect(sendMessage("8703567026", { text: "Hola" })).rejects.toThrow(
      "TELEGRAM_BOT_TOKEN",
    );
  });
});

describe("notifyOps", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("llama a sendMessage con TELEGRAM_OPS_CHAT_ID como destino", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    vi.stubEnv("TELEGRAM_OPS_CHAT_ID", "-100999");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await notifyOps("algo se rompió");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ chat_id: "-100999", text: "algo se rompió" });
  });

  it("lanza si TELEGRAM_OPS_CHAT_ID no está seteada", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "fake-token");
    vi.stubEnv("TELEGRAM_OPS_CHAT_ID", "");
    await expect(notifyOps("algo se rompió")).rejects.toThrow("TELEGRAM_OPS_CHAT_ID");
  });
});
