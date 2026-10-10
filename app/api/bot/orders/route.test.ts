import { describe, expect, it, vi } from "vitest";
import { withApiKey, withRevokedApiKey } from "@/lib/bot/test-fixtures";
import { createOrder } from "@/lib/bot/services/orders";
import { BotServiceError } from "@/lib/bot/errors";
import { POST } from "./route";

vi.mock("@/lib/bot/services/orders", () => ({
  createOrder: vi.fn(),
}));

const mockCreateOrder = vi.mocked(createOrder);
const ITEMS = [{ product_id: "p1", required_quantity: 3 }];

function makeRequest(authHeader: string | undefined, body: unknown = { customer_id: "cust-1", items: ITEMS }) {
  return new Request("http://localhost/api/bot/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authHeader !== undefined ? { Authorization: authHeader } : {}) },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bot/orders (Tarea 21)", () => {
  it("sin Authorization devuelve 401 sin llamar al servicio", async () => {
    const response = await POST(makeRequest(undefined));

    expect(response.status).toBe(401);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("con una key revocada devuelve 401 sin llamar al servicio", async () => {
    await withRevokedApiKey(async (rawKey) => {
      const response = await POST(makeRequest(`Bearer ${rawKey}`));

      expect(response.status).toBe(401);
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });

  it("sin items devuelve 400", async () => {
    await withApiKey(async (rawKey) => {
      const response = await POST(makeRequest(`Bearer ${rawKey}`, { customer_id: "cust-1" }));

      expect(response.status).toBe(400);
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });

  it("con una key válida ejecuta createOrder y devuelve el mismo resultado (201)", async () => {
    mockCreateOrder.mockResolvedValue({ order_id: "order-1", order_code: "1326" });

    await withApiKey(async (rawKey) => {
      const response = await POST(makeRequest(`Bearer ${rawKey}`));
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body).toEqual({ order_id: "order-1", order_code: "1326" });
      expect(mockCreateOrder).toHaveBeenCalledWith(expect.anything(), "cust-1", ITEMS);
    });
  });

  it("un código de negocio (ej. PAST_CUTOFF) responde 400 con el code, nunca el mensaje crudo expuesto como 500", async () => {
    mockCreateOrder.mockRejectedValue(new BotServiceError("PAST_CUTOFF", "PAST_CUTOFF: ya pasó la hora límite"));

    await withApiKey(async (rawKey) => {
      const response = await POST(makeRequest(`Bearer ${rawKey}`));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("PAST_CUTOFF");
    });
  });

  it("un error no controlado responde 500 genérico", async () => {
    mockCreateOrder.mockRejectedValue(new Error("ECONNRESET"));

    await withApiKey(async (rawKey) => {
      const response = await POST(makeRequest(`Bearer ${rawKey}`));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).not.toContain("ECONNRESET");
    });
  });
});
