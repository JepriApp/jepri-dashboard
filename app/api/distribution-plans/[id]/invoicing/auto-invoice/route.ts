import { approveOrderInvoice } from "@/lib/invoicing/approveOrder";
import { findCustomersMissingInSiigo } from "@/lib/invoicing/validateCustomers";
import { getSiigoClient } from "@/lib/siigo/getSiigoClient";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// 60s es el máximo permitido en el plan Hobby de Vercel. Esta ruta factura
// TODAS las órdenes del plan en un solo request — con varias órdenes y el
// timbrado síncrono de la DIAN por cada una, puede no alcanzar igual. Si
// eso pasa, las órdenes ya procesadas quedan en su estado final
// (invoiced/failed) y las restantes deben reintentarse manualmente; ninguna
// queda a medias gracias al reclamo atómico por orden.
export const maxDuration = 60;

interface InvoiceValuesRow {
  order_id: string;
  product_name: string;
  siigo_id: string | null;
  purchase_unit_price: number;
}

/**
 * Invoices every order of a plan in one shot, but only if the whole plan is
 * already "clean" (no invalid costs, no missing Siigo customers, no pending
 * cost change requests). Triggered right after a plan transitions to
 * invoicing when its auto_invoice_enabled toggle is on — intentionally
 * all-or-nothing, never partial.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const supabase = await createClient();

  const { data: plan, error: planError } = await supabase
    .from("distribution_plan")
    .select("id, status, plan_code, auto_invoice_enabled")
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
  if (!plan.auto_invoice_enabled) {
    return NextResponse.json(
      { error: "La autofacturación no está activada en este plan." },
      { status: 409 },
    );
  }

  const siigo = getSiigoClient();

  const { data: orders, error: ordersError } = await supabase
    .from("sale_order")
    .select("id")
    .eq("distribution_plan_id", planId)
    .neq("status", "cancelled");
  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const { data: allLines, error: linesError } = await supabase.rpc(
    "get_invoice_values_by_plan",
    { p_plan_code: plan.plan_code! },
  );
  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }
  const lines = (allLines ?? []) as InvoiceValuesRow[];
  const hasInvalidLine = lines.some(
    (line) => !(Number(line.purchase_unit_price) > 0) || !line.siigo_id,
  );

  const { data: pendingRequests, error: pendingError } = await supabase
    .from("invoice_cost_change_request")
    .select("id")
    .eq("distribution_plan_id", planId)
    .eq("status", "pending")
    .limit(1);
  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }

  let customerCheck;
  try {
    customerCheck = await findCustomersMissingInSiigo(supabase, siigo, planId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo validar los clientes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (
    hasInvalidLine ||
    (pendingRequests && pendingRequests.length > 0) ||
    customerCheck.missing.length > 0
  ) {
    return NextResponse.json({
      ran: false,
      reason: "El plan todavía tiene correcciones pendientes.",
      hasInvalidLine,
      pendingChangeRequests: pendingRequests?.length ?? 0,
      missingCustomers: customerCheck.missing,
    });
  }

  const ordersWithLines = new Set(lines.map((line) => line.order_id));
  const results: { saleOrderId: string; ok: boolean; error?: string }[] = [];
  for (const order of orders ?? []) {
    if (!ordersWithLines.has(order.id)) continue;
    const result = await approveOrderInvoice(supabase, siigo, plan, order.id);
    results.push(
      result.ok
        ? { saleOrderId: order.id, ok: true }
        : { saleOrderId: order.id, ok: false, error: result.error },
    );
  }

  return NextResponse.json({
    ran: true,
    invoiced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
