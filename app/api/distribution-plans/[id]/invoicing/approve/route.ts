import { approveOrderInvoice } from "@/lib/invoicing/approveOrder";
import { getSiigoClient } from "@/lib/siigo/getSiigoClient";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// El timbrado síncrono ante la DIAN puede tardar más que el timeout por
// defecto de una función serverless (10s en Vercel Hobby sin Fluid
// Compute). 60s es el máximo permitido en Hobby.
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const { saleOrderId } = (await req.json()) as { saleOrderId?: string };
  if (!saleOrderId) {
    return NextResponse.json({ error: "Falta saleOrderId." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: plan, error: planError } = await supabase
    .from("distribution_plan")
    .select("id, status, plan_code")
    .eq("id", planId)
    .single();
  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }
  if (plan.status !== "invoicing") {
    return NextResponse.json(
      { error: "El plan no está en estado de facturación." },
      { status: 409 },
    );
  }

  const result = await approveOrderInvoice(
    supabase,
    getSiigoClient(),
    plan,
    saleOrderId,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
