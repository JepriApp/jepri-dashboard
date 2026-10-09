import { describe, expect, it, vi } from "vitest";
import { withApiKey, withRevokedApiKey } from "@/lib/bot/test-fixtures";
import { getFrequentProducts } from "@/lib/bot/services/products";
import { GET } from "./route";

vi.mock("@/lib/bot/services/products", () => ({
  getFrequentProducts: vi.fn(),
}));

const mockGetFrequentProducts = vi.mocked(getFrequentProducts);

function makeRequest(authHeader: string | undefined, customerId = "cust-1") {
  return new Request(`http://localhost/api/bot/products/frequent?customer_id=${customerId}`, {
    headers: authHeader !== undefined ? { Authorization: authHeader } : {},
  });
}

describe("GET /api/bot/products/frequent (Tarea 21)", () => {
  it("sin Authorization devuelve 401 sin llamar al servicio", async () => {
    const response = await GET(makeRequest(undefined));

    expect(response.status).toBe(401);
    expect(mockGetFrequentProducts).not.toHaveBeenCalled();
  });

  it("con una key inexistente devuelve 401 sin llamar al servicio", async () => {
    const response = await GET(makeRequest("Bearer una-key-que-nunca-se-generó"));

    expect(response.status).toBe(401);
    expect(mockGetFrequentProducts).not.toHaveBeenCalled();
  });

  it("con una key revocada devuelve 401 sin llamar al servicio", async () => {
    await withRevokedApiKey(async (rawKey) => {
      const response = await GET(makeRequest(`Bearer ${rawKey}`));

      expect(response.status).toBe(401);
      expect(mockGetFrequentProducts).not.toHaveBeenCalled();
    });
  });

  it("sin customer_id devuelve 400", async () => {
    await withApiKey(async (rawKey) => {
      const response = await GET(
        new Request("http://localhost/api/bot/products/frequent", {
          headers: { Authorization: `Bearer ${rawKey}` },
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  it("con una key válida ejecuta getFrequentProducts y devuelve el mismo resultado", async () => {
    const products = [{ canonical_group_id: "g1", canonical_name: "Tomate", variants: [], times_ordered: 3 }];
    mockGetFrequentProducts.mockResolvedValue(products);

    await withApiKey(async (rawKey) => {
      const response = await GET(makeRequest(`Bearer ${rawKey}`, "cust-42"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(products);
      expect(mockGetFrequentProducts).toHaveBeenCalledWith(expect.anything(), "cust-42");
    });
  });
});
