import { afterEach, describe, expect, it } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import { withPrivilegedClient } from "@/lib/bot/test-fixtures";
import { markUpdateProcessed } from "@/lib/bot/services/idempotency";

afterEach(async () => {
  await withPrivilegedClient(async (client) => {
    await client.query("delete from bot_processed_update where update_id like 'test-%'");
  });
});

describe("markUpdateProcessed", () => {
  it("la primera vez con un (channel, update_id) nuevo devuelve true", async () => {
    const supabase = createTestSupabaseClient();
    const updateId = `test-${Date.now()}-a`;
    const result = await markUpdateProcessed(supabase, "telegram", updateId);
    expect(result).toBe(true);
  });

  it("repetir el mismo (channel, update_id) devuelve false — no reprocesar", async () => {
    const supabase = createTestSupabaseClient();
    const updateId = `test-${Date.now()}-b`;
    await markUpdateProcessed(supabase, "telegram", updateId);
    const second = await markUpdateProcessed(supabase, "telegram", updateId);
    expect(second).toBe(false);
  });

  it("un update_id distinto es independiente del anterior", async () => {
    const supabase = createTestSupabaseClient();
    const base = `test-${Date.now()}`;
    await markUpdateProcessed(supabase, "telegram", `${base}-x`);
    const result = await markUpdateProcessed(supabase, "telegram", `${base}-y`);
    expect(result).toBe(true);
  });
});
