import { describe, expect, it, vi } from "vitest";
import { withApiKey, withRevokedApiKey } from "@/lib/bot/test-fixtures";
import { searchCatalog } from "@/lib/bot/services/products";
import { GET } from "./route";

vi.mock("@/lib/bot/services/products", () => ({
  searchCatalog: vi.fn(),
}));

const mockSearchCatalog = vi.mocked(searchCatalog);

function makeRequest(authHeader: string | undefined, q = "tomate") {
  return new Request(`http://localhost/api/bot/products/search?q=${q}`, {
    headers: authHeader !== undefined ? { Authorization: authHeader } : {},
  });
}

describe("GET /api/bot/products/search (Tarea 21)", () => {
  it("sin Authorization devuelve 401 sin llamar al servicio", async () => {
    const response = await GET(makeRequest(undefined));

    expect(response.status).toBe(401);
    expect(mockSearchCatalog).not.toHaveBeenCalled();
  });

  it("con una key inexistente devuelve 401 sin llamar al servicio", async () => {
    const response = await GET(makeRequest("Bearer una-key-que-nunca-se-generó"));

    expect(response.status).toBe(401);
    expect(mockSearchCatalog).not.toHaveBeenCalled();
  });

  it("con una key revocada devuelve 401 sin llamar al servicio", async () => {
    await withRevokedApiKey(async (rawKey) => {
      const response = await GET(makeRequest(`Bearer ${rawKey}`));

      expect(response.status).toBe(401);
      expect(mockSearchCatalog).not.toHaveBeenCalled();
    });
  });

  it("sin q devuelve 400", async () => {
    await withApiKey(async (rawKey) => {
      const response = await GET(
        new Request("http://localhost/api/bot/products/search", {
          headers: { Authorization: `Bearer ${rawKey}` },
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  it("con una key válida ejecuta searchCatalog y devuelve el mismo resultado", async () => {
    const results = [{ canonical_group_id: "g1", canonical_name: "Tomate chonto", variants: [] }];
    mockSearchCatalog.mockResolvedValue(results);

    await withApiKey(async (rawKey) => {
      const response = await GET(makeRequest(`Bearer ${rawKey}`, "cebolla"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(results);
      expect(mockSearchCatalog).toHaveBeenCalledWith(expect.anything(), "cebolla");
    });
  });
});
