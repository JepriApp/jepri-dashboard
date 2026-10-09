import { afterEach, describe, expect, it } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import { withPrivilegedClient } from "@/lib/bot/test-fixtures";
import { hashApiKey, resolveCustomerCandidates, validateApiKey } from "@/lib/bot/services/auth";

// Cliente de prueba de la Tarea 1 (customer.whatsapp_id=8703567026), en staging.
const TEST_CUSTOMER_ID = "28679e91-8caa-45f4-b5f5-3ed04f9decf9";
const TEST_WHATSAPP_ID = "8703567026";

describe("resolveCustomerCandidates", () => {
  it("encuentra al cliente de prueba por whatsapp_id", async () => {
    const supabase = createTestSupabaseClient();
    const result = await resolveCustomerCandidates(supabase, TEST_WHATSAPP_ID);
    expect(result).toEqual([
      {
        customer_id: TEST_CUSTOMER_ID,
        name: "Cliente de prueba (bot Telegram)",
      },
    ]);
  });

  it("sin match devuelve lista vacía, no lanza (se ignora en silencio, no es un error)", async () => {
    const supabase = createTestSupabaseClient();
    const result = await resolveCustomerCandidates(supabase, "no-existe-este-external-id-123");
    expect(result).toEqual([]);
  });

  it("dos customer con el mismo whatsapp_id (varios clientes/puntos de entrega por número, Tarea 16) devuelve ambos", async () => {
    let secondCustomerId = "";

    try {
      await withPrivilegedClient(async (client) => {
        const { rows } = await client.query(
          `insert into customer (name, identification_type, identification_number, whatsapp_id)
           values ('Cliente de prueba (segundo punto de entrega)', 'CC', '999999999-test-tarea16', $1)
           returning id`,
          [TEST_WHATSAPP_ID],
        );
        secondCustomerId = rows[0].id;
      });

      const supabase = createTestSupabaseClient();
      const result = await resolveCustomerCandidates(supabase, TEST_WHATSAPP_ID);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.customer_id).sort()).toEqual([TEST_CUSTOMER_ID, secondCustomerId].sort());
    } finally {
      await withPrivilegedClient(async (client) => {
        await client.query("delete from customer where id = $1", [secondCustomerId]);
      });
    }
  });
});

describe("hashApiKey", () => {
  it("nunca es una función identidad — el hash no es igual al valor original", () => {
    const rawKey = "una-api-key-cualquiera";
    expect(hashApiKey(rawKey)).not.toBe(rawKey);
  });

  it("produce siempre el mismo hash sha256 en hex (64 caracteres) para el mismo input", () => {
    const hash = hashApiKey("otra-api-key");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey("otra-api-key")).toBe(hash);
  });
});

describe("validateApiKey", () => {
  const rawKey = `test-key-tarea-9-${Date.now()}`;
  const keyHash = hashApiKey(rawKey);

  afterEach(async () => {
    await withPrivilegedClient(async (client) => {
      await client.query("delete from bot_api_key where key_hash = $1", [keyHash]);
    });
  });

  it("una key que no existe devuelve false", async () => {
    const supabase = createTestSupabaseClient();
    const result = await validateApiKey(supabase, "una-key-que-nunca-se-generó");
    expect(result).toBe(false);
  });

  it("una key activa devuelve true", async () => {
    await withPrivilegedClient(async (client) => {
      await client.query("insert into bot_api_key (name, key_hash) values ('test-adapter', $1)", [
        keyHash,
      ]);
    });

    const supabase = createTestSupabaseClient();
    const result = await validateApiKey(supabase, rawKey);
    expect(result).toBe(true);
  });

  it("una key revocada devuelve false", async () => {
    await withPrivilegedClient(async (client) => {
      await client.query(
        "insert into bot_api_key (name, key_hash, revoked_at) values ('test-adapter', $1, now())",
        [keyHash],
      );
    });

    const supabase = createTestSupabaseClient();
    const result = await validateApiKey(supabase, rawKey);
    expect(result).toBe(false);
  });
});
