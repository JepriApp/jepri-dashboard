import { describe, expect, it, vi } from "vitest";
import { withApiKey, withRevokedApiKey } from "@/lib/bot/test-fixtures";
import { getCurrentOrder } from "@/lib/bot/services/orders";
import { GET } from "./route";

vi.mock("@/lib/bot/services/orders", () => ({
  getCurrentOrder: vi.fn(),
}));

const mockGetCurrentOrder = vi.mocked(getCurrentOrder);

function makeRequest(authHeader: string | undefined, customerId = "cust-1") {
  return new Request(`http://localhost/api/bot/orders/current?customer_id=${customerId}`, {
    headers: authHeader !== undefined ? { Authorization: authHeader } : {},
  });
}

describe("GET /api/bot/orders/current (Tarea 21)", () => {
  it("sin Authorization devuelve 401 sin llamar al servicio", async () => {
    const response = await GET(makeRequest(undefined));

    expect(response.status).toBe(401);
    expect(mockGetCurrentOrder).not.toHaveBeenCalled();
  });

  it("con una key inexistente devuelve 401 sin llamar al servicio", async () => {
    const response = await GET(makeRequest("Bearer una-key-que-nunca-se-generó"));

    expect(response.status).toBe(401);
    expect(mockGetCurrentOrder).not.toHaveBeenCalled();
  });

  it("con una key revocada devuelve 401 sin llamar al servicio", async () => {
    await withRevokedApiKey(async (rawKey) => {
      const response = await GET(makeRequest(`Bearer ${rawKey}`));

      expect(response.status).toBe(401);
      expect(mockGetCurrentOrder).not.toHaveBeenCalled();
    });
  });

  it("sin customer_id devuelve 400", async () => {
    await withApiKey(async (rawKey) => {
      const response = await GET(
        new Request("http://localhost/api/bot/orders/current", {
          headers: { Authorization: `Bearer ${rawKey}` },
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  it("con una key válida ejecuta getCurrentOrder y devuelve el mismo resultado (incluido null)", async () => {
    mockGetCurrentOrder.mockResolvedValue(null);

    await withApiKey(async (rawKey) => {
      const response = await GET(makeRequest(`Bearer ${rawKey}`, "cust-42"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toBeNull();
      expect(mockGetCurrentOrder).toHaveBeenCalledWith(expect.anything(), "cust-42");
    });
  });
});
