import { describe, expect, it } from "vitest";
import { createTestSupabaseClient } from "@/lib/bot/test-helpers";
import { withNoActivePlan, withSingleActivePlan } from "@/lib/bot/test-fixtures";
import { getActivePlanStatus } from "@/lib/bot/services/plan";

describe("getActivePlanStatus", () => {
  it("sin ningún plan activo devuelve null", async () => {
    await withNoActivePlan(async () => {
      const supabase = createTestSupabaseClient();
      const result = await getActivePlanStatus(supabase);
      expect(result).toBeNull();
    });
  });

  it("con un plan de cutoff abierto, is_within_cutoff es true", async () => {
    await withSingleActivePlan(
      async (planId) => {
        const supabase = createTestSupabaseClient();
        const result = await getActivePlanStatus(supabase);
        expect(result?.plan_id).toBe(planId);
        expect(result?.is_within_cutoff).toBe(true);
      },
      { cutoffAt: new Date(Date.now() + 60 * 60 * 1000) },
    );
  });

  it("con un plan de cutoff pasado, is_within_cutoff es false", async () => {
    await withSingleActivePlan(
      async () => {
        const supabase = createTestSupabaseClient();
        const result = await getActivePlanStatus(supabase);
        expect(result?.is_within_cutoff).toBe(false);
      },
      { cutoffAt: new Date(Date.now() - 60 * 60 * 1000) },
    );
  });
});
