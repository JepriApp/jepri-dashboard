import { describe, expect, it, vi } from "vitest";
import { withApiKey, withRevokedApiKey } from "@/lib/bot/test-fixtures";
import { cancelOrder, updateOrder } from "@/lib/bot/services/orders";
import { BotServiceError } from "@/lib/bot/errors";
import { DELETE, PUT } from "./route";

vi.mock("@/lib/bot/services/orders", () => ({
  updateOrder: vi.fn(),
  cancelOrder: vi.fn(),
}));

const mockUpdateOrder = vi.mocked(updateOrder);
const mockCancelOrder = vi.mocked(cancelOrder);
const ITEMS = [{ product_id: "p1", required_quantity: 5 }];
const PARAMS = { params: Promise.resolve({ id: "order-1" }) };

function putRequest(authHeader: string | undefined, body: unknown = { customer_id: "cust-1", items: ITEMS }) {
  return new Request("http://localhost/api/bot/orders/order-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(authHeader !== undefined ? { Authorization: authHeader } : {}) },
    body: JSON.stringify(body),
  });
}

function deleteRequest(authHeader: string | undefined, customerId = "cust-1") {
  return new Request(`http://localhost/api/bot/orders/order-1?customer_id=${customerId}`, {
    method: "DELETE",
    headers: authHeader !== undefined ? { Authorization: authHeader } : {},
  });
}

describe("PUT /api/bot/orders/:id (Tarea 21)", () => {
  it("sin Authorization devuelve 401 sin llamar al servicio", async () => {
    const response = await PUT(putRequest(undefined), PARAMS);

    expect(response.status).toBe(401);
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("con una key revocada devuelve 401 sin llamar al servicio", async () => {
    await withRevokedApiKey(async (rawKey) => {
      const response = await PUT(putRequest(`Bearer ${rawKey}`), PARAMS);

      expect(response.status).toBe(401);
      expect(mockUpdateOrder).not.toHaveBeenCalled();
    });
  });

  it("con una key válida ejecuta updateOrder con el id de la ruta", async () => {
    mockUpdateOrder.mockResolvedValue(undefined);

    await withApiKey(async (rawKey) => {
      const response = await PUT(putRequest(`Bearer ${rawKey}`), PARAMS);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ ok: true });
      expect(mockUpdateOrder).toHaveBeenCalledWith(expect.anything(), "order-1", "cust-1", ITEMS);
    });
  });

  it("un código de negocio (ej. ORDER_NOT_FOUND) responde 400", async () => {
    mockUpdateOrder.mockRejectedValue(new BotServiceError("ORDER_NOT_FOUND", "ORDER_NOT_FOUND: no existe"));

    await withApiKey(async (rawKey) => {
      const response = await PUT(putRequest(`Bearer ${rawKey}`), PARAMS);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("ORDER_NOT_FOUND");
    });
  });
});

describe("DELETE /api/bot/orders/:id (Tarea 21)", () => {
  it("sin Authorization devuelve 401 sin llamar al servicio", async () => {
    const response = await DELETE(deleteRequest(undefined), PARAMS);

    expect(response.status).toBe(401);
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it("con una key revocada devuelve 401 sin llamar al servicio", async () => {
    await withRevokedApiKey(async (rawKey) => {
      const response = await DELETE(deleteRequest(`Bearer ${rawKey}`), PARAMS);

      expect(response.status).toBe(401);
      expect(mockCancelOrder).not.toHaveBeenCalled();
    });
  });

  it("sin customer_id devuelve 400", async () => {
    await withApiKey(async (rawKey) => {
      const response = await DELETE(
        new Request("http://localhost/api/bot/orders/order-1", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${rawKey}` },
        }),
        PARAMS,
      );

      expect(response.status).toBe(400);
    });
  });

  it("con una key válida ejecuta cancelOrder con el id de la ruta (soft-cancel, nunca DELETE real)", async () => {
    mockCancelOrder.mockResolvedValue(undefined);

    await withApiKey(async (rawKey) => {
      const response = await DELETE(deleteRequest(`Bearer ${rawKey}`, "cust-9"), PARAMS);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ ok: true });
      expect(mockCancelOrder).toHaveBeenCalledWith(expect.anything(), "order-1", "cust-9");
    });
  });

  it("un código de negocio (ej. ORDER_NOT_CANCELLABLE) responde 400", async () => {
    mockCancelOrder.mockRejectedValue(
      new BotServiceError("ORDER_NOT_CANCELLABLE", "ORDER_NOT_CANCELLABLE: ya no se puede"),
    );

    await withApiKey(async (rawKey) => {
      const response = await DELETE(deleteRequest(`Bearer ${rawKey}`), PARAMS);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("ORDER_NOT_CANCELLABLE");
    });
  });
});
