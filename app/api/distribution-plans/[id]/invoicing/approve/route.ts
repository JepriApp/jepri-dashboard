import { getSiigoClient } from "@/lib/siigo/getSiigoClient";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface InvoiceValuesRow {
  order_id: string;
  order_code: string | null;
  identification_type: string;
  identification_number: string;
  product_name: string;
  siigo_id: string | null;
  order_quantity: number;
  purchase_unit_price: number;
  unit_price: number;
}

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

  const { data: review, error: reviewError } = await supabase
    .from("invoice_review")
    .select("id, status")
    .eq("sale_order_id", saleOrderId)
    .eq("distribution_plan_id", planId)
    .single();
  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 });
  }

  // Reclamo atómico: solo avanza si nadie más ya está procesando o ya
  // facturó esta orden (evita crear dos facturas por una condición de
  // carrera entre llamadas concurrentes al botón de aprobar/reintentar).
  const { data: claimed, error: claimError } = await supabase
    .from("invoice_review")
    .update({ status: "invoicing", error_message: null })
    .eq("id", review.id)
    .in("status", ["pending_review", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "Esta orden ya fue facturada o ya se está procesando." },
      { status: 409 },
    );
  }

  const { data: allLines, error: linesError } = await supabase.rpc(
    "get_invoice_values_by_plan",
    { p_plan_code: plan.plan_code! },
  );
  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }
  const lines = ((allLines ?? []) as InvoiceValuesRow[]).filter(
    (line) => line.order_id === saleOrderId,
  );
  if (lines.length === 0) {
    return NextResponse.json(
      {
        error:
          "La orden no tiene líneas facturables (revisa que los productos tengan costo definido).",
      },
      { status: 422 },
    );
  }
  const invalidCostLine = lines.find(
    (line) => !(Number(line.purchase_unit_price) > 0),
  );
  if (invalidCostLine) {
    const message = `El producto "${invalidCostLine.product_name}" tiene un costo inválido ($0 o vacío).`;
    await supabase
      .from("invoice_review")
      .update({ status: "failed", error_message: message })
      .eq("id", review.id);
    return NextResponse.json({ error: message }, { status: 422 });
  }
  const missingSiigoIdLine = lines.find((line) => !line.siigo_id);
  if (missingSiigoIdLine) {
    const message = `El producto "${missingSiigoIdLine.product_name}" no tiene código de Siigo configurado.`;
    await supabase
      .from("invoice_review")
      .update({ status: "failed", error_message: message })
      .eq("id", review.id);
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const siigo = getSiigoClient();
  const identification = lines[0].identification_number;
  const customerLookup = await siigo.findCustomerByIdentification(identification);
  if (!customerLookup.found) {
    const message = `El cliente (${lines[0].identification_type} ${identification}) no existe en Siigo. Debe crearlo manualmente en Siigo antes de facturar esta orden.`;
    await supabase
      .from("invoice_review")
      .update({ status: "failed", error_message: message })
      .eq("id", review.id);
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const documentId = Number(
    process.env.SIIGO_DOCUMENT_ID ?? (process.env.SIIGO_MODE === "live" ? NaN : 1),
  );
  const sellerId = Number(
    process.env.SIIGO_SELLER_ID ?? (process.env.SIIGO_MODE === "live" ? NaN : 1),
  );
  const paymentId = Number(
    process.env.SIIGO_PAYMENT_ID ?? (process.env.SIIGO_MODE === "live" ? NaN : 1),
  );
  if (!documentId || !sellerId || !paymentId) {
    return NextResponse.json(
      {
        error:
          "Falta configurar SIIGO_DOCUMENT_ID, SIIGO_SELLER_ID y/o SIIGO_PAYMENT_ID.",
      },
      { status: 500 },
    );
  }

  const items = lines.map((line) => ({
    code: line.siigo_id!,
    description: line.product_name,
    quantity: Number(line.order_quantity),
    price: Number(line.unit_price),
  }));

  try {
    const result = await siigo.createInvoice({
      documentId,
      date: new Date().toISOString().slice(0, 10),
      customerIdentification: identification,
      sellerId,
      paymentId,
      items,
      observations: `Plan ${plan.plan_code} - Orden ${lines[0].order_code}`,
    });
    await supabase
      .from("invoice_review")
      .update({
        status: "invoiced",
        siigo_invoice_id: result.siigoInvoiceId,
        siigo_invoice_number: result.invoiceNumber,
        siigo_public_url: result.publicUrl,
        invoiced_lines: items,
        invoiced_at: new Date().toISOString(),
      })
      .eq("id", review.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Error desconocido al crear la factura en Siigo.";
    await supabase
      .from("invoice_review")
      .update({ status: "failed", error_message: message })
      .eq("id", review.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
