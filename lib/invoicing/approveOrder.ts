import { Database } from "@/database.types";
import { SiigoClient } from "@/lib/siigo/types";
import { SupabaseClient } from "@supabase/supabase-js";

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

export type ApproveOrderResult =
  | {
      ok: true;
      siigoInvoiceId: string;
      invoiceNumber: string | null;
      publicUrl: string | null;
    }
  | { ok: false; status: number; error: string };

const getSiigoConfig = () => {
  const documentId = Number(
    process.env.SIIGO_DOCUMENT_ID ?? (process.env.SIIGO_MODE === "live" ? NaN : 1),
  );
  const sellerId = Number(
    process.env.SIIGO_SELLER_ID ?? (process.env.SIIGO_MODE === "live" ? NaN : 1),
  );
  const paymentId = Number(
    process.env.SIIGO_PAYMENT_ID ?? (process.env.SIIGO_MODE === "live" ? NaN : 1),
  );
  // Algunas formas de pago (p.ej. Crédito) tienen "vencimiento" habilitado
  // en Siigo Nube y Siigo rechaza la factura si no se manda due_date.
  const paymentRequiresDueDate = process.env.SIIGO_PAYMENT_REQUIRES_DUE_DATE === "true";
  const paymentDueDays = process.env.SIIGO_PAYMENT_DUE_DAYS
    ? Number(process.env.SIIGO_PAYMENT_DUE_DAYS)
    : undefined;
  return { documentId, sellerId, paymentId, paymentRequiresDueDate, paymentDueDays };
};

/**
 * Approves and invoices a single sale_order in Siigo, persisting the result
 * on invoice_review. Shared by the manual per-order route and the
 * plan-wide auto-invoice route so both go through the exact same
 * validations (atomic claim, invalid cost, missing siigo_id, pending
 * change request, missing Siigo customer).
 */
export async function approveOrderInvoice(
  supabase: SupabaseClient<Database>,
  siigo: SiigoClient,
  plan: { id: string; plan_code: string | null },
  saleOrderId: string,
): Promise<ApproveOrderResult> {
  const { data: review, error: reviewError } = await supabase
    .from("invoice_review")
    .select("id, status")
    .eq("sale_order_id", saleOrderId)
    .eq("distribution_plan_id", plan.id)
    .single();
  if (reviewError) {
    return { ok: false, status: 500, error: reviewError.message };
  }

  // Reclamo atómico: solo avanza si nadie más ya está procesando o ya
  // facturó esta orden (evita crear dos facturas por una condición de
  // carrera entre llamadas concurrentes).
  const { data: claimed, error: claimError } = await supabase
    .from("invoice_review")
    .update({ status: "invoicing", error_message: null })
    .eq("id", review.id)
    .in("status", ["pending_review", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) {
    return { ok: false, status: 500, error: claimError.message };
  }
  if (!claimed) {
    return {
      ok: false,
      status: 409,
      error: "Esta orden ya fue facturada o ya se está procesando.",
    };
  }

  // Todo lo que sigue puede fallar de maneras que no anticipamos (una
  // consulta a Supabase que lanza en vez de devolver `error`, un timeout de
  // red hacia Siigo, etc.) — si algo así queda sin capturar, la orden se
  // queda en "invoicing" para siempre, sin mensaje, bloqueando tanto
  // "Reintentar" como "Reenviar a DIAN". Por eso todo el resto del flujo
  // vive dentro de este único try/catch: cualquier excepción imprevista
  // también revierte a "failed" con el detalle real del error.
  try {
    const { data: saleItems, error: saleItemsError } = await supabase
      .from("sale_item")
      .select("fulfillment:fulfillment(purchase_item_id)")
      .eq("sale_order_id", saleOrderId);
    if (saleItemsError) throw new Error(saleItemsError.message);
    const purchaseItemIds = Array.from(
      new Set(
        (saleItems ?? []).flatMap((si) =>
          (si.fulfillment ?? []).map((f) => f.purchase_item_id),
        ),
      ),
    );
    if (purchaseItemIds.length > 0) {
      const { data: pendingRequests, error: pendingError } = await supabase
        .from("invoice_cost_change_request")
        .select("id")
        .in("purchase_item_id", purchaseItemIds)
        .eq("status", "pending")
        .limit(1);
      if (pendingError) throw new Error(pendingError.message);
      if (pendingRequests && pendingRequests.length > 0) {
        const message =
          "Esta orden tiene una solicitud de cambio de costo pendiente de aprobación.";
        await supabase
          .from("invoice_review")
          .update({ status: "failed", error_message: message })
          .eq("id", review.id);
        return { ok: false, status: 422, error: message };
      }
    }

    const { data: allLines, error: linesError } = await supabase.rpc(
      "get_invoice_values_by_plan",
      { p_plan_code: plan.plan_code! },
    );
    if (linesError) throw new Error(linesError.message);
    const lines = ((allLines ?? []) as InvoiceValuesRow[]).filter(
      (line) => line.order_id === saleOrderId,
    );
    if (lines.length === 0) {
      const message =
        "La orden no tiene líneas facturables (revisa que los productos hayan sido recibidos y tengan costo definido).";
      await supabase
        .from("invoice_review")
        .update({ status: "failed", error_message: message })
        .eq("id", review.id);
      return { ok: false, status: 422, error: message };
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
      return { ok: false, status: 422, error: message };
    }
    const missingSiigoIdLine = lines.find((line) => !line.siigo_id);
    if (missingSiigoIdLine) {
      const message = `El producto "${missingSiigoIdLine.product_name}" no tiene código de Siigo configurado.`;
      await supabase
        .from("invoice_review")
        .update({ status: "failed", error_message: message })
        .eq("id", review.id);
      return { ok: false, status: 422, error: message };
    }

    const identification = lines[0].identification_number;
    const customerLookup = await siigo.findCustomerByIdentification(identification);
    if (!customerLookup.found) {
      const message = `El cliente (${lines[0].identification_type} ${identification}) no existe en Siigo. Debe crearlo manualmente en Siigo antes de facturar esta orden.`;
      await supabase
        .from("invoice_review")
        .update({ status: "failed", error_message: message })
        .eq("id", review.id);
      return { ok: false, status: 422, error: message };
    }

    const { documentId, sellerId, paymentId, paymentRequiresDueDate, paymentDueDays } =
      getSiigoConfig();
    if (!documentId || !sellerId || !paymentId) {
      const message =
        "Falta configurar SIIGO_DOCUMENT_ID, SIIGO_SELLER_ID y/o SIIGO_PAYMENT_ID.";
      await supabase
        .from("invoice_review")
        .update({ status: "failed", error_message: message })
        .eq("id", review.id);
      return { ok: false, status: 500, error: message };
    }
    if (paymentRequiresDueDate && !paymentDueDays) {
      const message =
        "SIIGO_PAYMENT_REQUIRES_DUE_DATE está activo pero falta configurar SIIGO_PAYMENT_DUE_DAYS.";
      await supabase
        .from("invoice_review")
        .update({ status: "failed", error_message: message })
        .eq("id", review.id);
      return { ok: false, status: 500, error: message };
    }

    const items = lines.map((line) => ({
      code: line.siigo_id!,
      description: line.product_name,
      quantity: Number(line.order_quantity),
      price: Number(line.unit_price),
    }));

    const invoiceDate = new Date();
    const paymentDueDate = paymentRequiresDueDate
      ? new Date(invoiceDate.getTime() + paymentDueDays! * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : undefined;

    const result = await siigo.createInvoice({
      documentId,
      date: invoiceDate.toISOString().slice(0, 10),
      customerIdentification: identification,
      sellerId,
      paymentId,
      paymentDueDate,
      items,
      observations: `Plan ${plan.plan_code} - Orden ${lines[0].order_code}`,
    });

    // El documento se creó en Siigo, pero si la DIAN rechazó el timbrado
    // guardamos igual el siigo_invoice_id: es el mismo documento que se
    // puede reenviar a validación después (ver resendInvoiceStamp), sin
    // crear una factura duplicada.
    if (result.stampErrors) {
      await supabase
        .from("invoice_review")
        .update({
          status: "failed",
          error_message: `La DIAN rechazó el timbrado: ${result.stampErrors}`,
          siigo_invoice_id: result.siigoInvoiceId,
          siigo_invoice_number: result.invoiceNumber,
          siigo_public_url: result.publicUrl,
        })
        .eq("id", review.id);
      return { ok: false, status: 422, error: result.stampErrors };
    }

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
    return {
      ok: true,
      siigoInvoiceId: result.siigoInvoiceId,
      invoiceNumber: result.invoiceNumber,
      publicUrl: result.publicUrl,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Error desconocido al crear la factura en Siigo.";
    await supabase
      .from("invoice_review")
      .update({ status: "failed", error_message: message })
      .eq("id", review.id);
    return { ok: false, status: 502, error: message };
  }
}

/**
 * Reenvía a validación de la DIAN un invoice_review en estado `failed` que
 * ya tiene un documento creado en Siigo (siigo_invoice_id) — p.ej. porque
 * el timbrado fue rechazado y se corrigió el problema directamente en
 * Siigo. No crea una factura nueva: reintenta el timbrado sobre el mismo
 * documento vía SiigoClient.resendStamp.
 */
export async function resendInvoiceStamp(
  supabase: SupabaseClient<Database>,
  siigo: SiigoClient,
  saleOrderId: string,
  planId: string,
): Promise<ApproveOrderResult> {
  const { data: review, error: reviewError } = await supabase
    .from("invoice_review")
    .select("id, status, siigo_invoice_id")
    .eq("sale_order_id", saleOrderId)
    .eq("distribution_plan_id", planId)
    .single();
  if (reviewError) {
    return { ok: false, status: 500, error: reviewError.message };
  }
  if (!review.siigo_invoice_id) {
    return {
      ok: false,
      status: 422,
      error:
        "Esta orden no tiene un documento creado en Siigo todavía — usa 'Reintentar' en vez de 'Reenviar a DIAN'.",
    };
  }

  const { data: claimed, error: claimError } = await supabase
    .from("invoice_review")
    .update({ status: "invoicing", error_message: null })
    .eq("id", review.id)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (claimError) {
    return { ok: false, status: 500, error: claimError.message };
  }
  if (!claimed) {
    return {
      ok: false,
      status: 409,
      error: "Esta orden ya fue facturada o ya se está procesando.",
    };
  }

  try {
    const result = await siigo.resendStamp(review.siigo_invoice_id);
    if (result.stampErrors) {
      await supabase
        .from("invoice_review")
        .update({
          status: "failed",
          error_message: `La DIAN rechazó el timbrado: ${result.stampErrors}`,
          siigo_invoice_number: result.invoiceNumber,
          siigo_public_url: result.publicUrl,
        })
        .eq("id", review.id);
      return { ok: false, status: 422, error: result.stampErrors };
    }
    await supabase
      .from("invoice_review")
      .update({
        status: "invoiced",
        siigo_invoice_number: result.invoiceNumber,
        siigo_public_url: result.publicUrl,
        invoiced_at: new Date().toISOString(),
      })
      .eq("id", review.id);
    return {
      ok: true,
      siigoInvoiceId: result.siigoInvoiceId,
      invoiceNumber: result.invoiceNumber,
      publicUrl: result.publicUrl,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Error desconocido al reenviar la factura a la DIAN.";
    await supabase
      .from("invoice_review")
      .update({ status: "failed", error_message: message })
      .eq("id", review.id);
    return { ok: false, status: 502, error: message };
  }
}
