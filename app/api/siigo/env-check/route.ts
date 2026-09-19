import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Diagnostic-only endpoint: reports whether the Siigo-related env vars
 * reached this deployment's runtime, without exposing secret values.
 * Requires an authenticated session (no RLS-backed query here to fall
 * back on, since it only reads process.env).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  return NextResponse.json({
    SIIGO_MODE: process.env.SIIGO_MODE === "live" ? "live" : "mock (default)",
    SIIGO_API_USERNAME_set: !!process.env.SIIGO_API_USERNAME,
    SIIGO_API_ACCESS_KEY_set: !!process.env.SIIGO_API_ACCESS_KEY,
    SIIGO_PARTNER_ID_set: !!process.env.SIIGO_PARTNER_ID,
    SIIGO_API_BASE_URL: process.env.SIIGO_API_BASE_URL || "https://api.siigo.com (default)",
    SIIGO_DOCUMENT_ID: process.env.SIIGO_DOCUMENT_ID || null,
    SIIGO_SELLER_ID: process.env.SIIGO_SELLER_ID || null,
    SIIGO_PAYMENT_ID: process.env.SIIGO_PAYMENT_ID || null,
    SIIGO_PAYMENT_REQUIRES_DUE_DATE: process.env.SIIGO_PAYMENT_REQUIRES_DUE_DATE === "true",
    SIIGO_PAYMENT_DUE_DAYS: process.env.SIIGO_PAYMENT_DUE_DAYS || null,
  });
}
