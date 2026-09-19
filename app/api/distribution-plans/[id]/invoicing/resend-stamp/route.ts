import { resendInvoiceStamp } from "@/lib/invoicing/approveOrder";
import { getSiigoClient } from "@/lib/siigo/getSiigoClient";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    .select("id, status")
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

  const result = await resendInvoiceStamp(
    supabase,
    getSiigoClient(),
    saleOrderId,
    planId,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
