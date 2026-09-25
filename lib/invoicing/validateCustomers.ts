import { Database } from "@/database.types";
import { SiigoClient } from "@/lib/siigo/types";
import { SupabaseClient } from "@supabase/supabase-js";

interface SaleOrderCustomer {
  customer: {
    id: string;
    name: string | null;
    identification_type: string | null;
    identification_number: string | null;
  };
  invoice_review: { status: string } | { status: string }[] | null;
}

export interface MissingSiigoCustomer {
  id: string;
  name: string | null;
  identificationType: string | null;
  identificationNumber: string | null;
}

export async function findCustomersMissingInSiigo(
  supabase: SupabaseClient<Database>,
  siigo: SiigoClient,
  planId: string,
): Promise<{ checked: number; missing: MissingSiigoCustomer[] }> {
  const { data: orders, error } = await supabase
    .from("sale_order")
    .select(
      `customer:customer_id ( id, name, identification_type, identification_number ),
       invoice_review:invoice_review ( status )`,
    )
    .eq("distribution_plan_id", planId)
    .neq("status", "cancelled");
  if (error) throw error;

  // Una orden ya facturada no necesita que su cliente exista en Siigo bajo
  // la identificación guardada localmente — la factura real ya es la
  // fuente de verdad (puede haberse creado/vinculado manualmente con otra
  // identificación, como el NIT de un negocio en vez del documento
  // personal). Solo advertir por clientes con al menos una orden pendiente.
  const ordersNeedingInvoice = ((orders ?? []) as unknown as SaleOrderCustomer[]).filter(
    (order) => {
      const review = Array.isArray(order.invoice_review)
        ? order.invoice_review[0]
        : order.invoice_review;
      return review?.status !== "invoiced";
    },
  );

  const uniqueCustomers = Array.from(
    new Map(
      ordersNeedingInvoice
        .map((order) => order.customer)
        .filter((customer): customer is NonNullable<typeof customer> =>
          Boolean(customer?.identification_number),
        )
        .map((customer) => [customer.id, customer]),
    ).values(),
  );

  const missing: MissingSiigoCustomer[] = [];
  for (const customer of uniqueCustomers) {
    const result = await siigo.findCustomerByIdentification(
      customer.identification_number!,
    );
    if (!result.found) {
      missing.push({
        id: customer.id,
        name: customer.name,
        identificationType: customer.identification_type,
        identificationNumber: customer.identification_number,
      });
    }
  }

  return { checked: uniqueCustomers.length, missing };
}
