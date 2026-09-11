import { getSiigoClient } from "@/lib/siigo/getSiigoClient";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface SaleOrderCustomer {
  customer: {
    id: string;
    name: string | null;
    identification_type: string | null;
    identification_number: string | null;
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("sale_order")
    .select(
      `customer:customer_id ( id, name, identification_type, identification_number )`,
    )
    .eq("distribution_plan_id", planId)
    .neq("status", "cancelled");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uniqueCustomers = Array.from(
    new Map(
      ((orders ?? []) as unknown as SaleOrderCustomer[])
        .map((order) => order.customer)
        .filter((customer): customer is NonNullable<typeof customer> =>
          Boolean(customer?.identification_number),
        )
        .map((customer) => [customer.id, customer]),
    ).values(),
  );

  const siigo = getSiigoClient();
  const missing: {
    id: string;
    name: string | null;
    identificationType: string | null;
    identificationNumber: string | null;
  }[] = [];

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

  return NextResponse.json({ checked: uniqueCustomers.length, missing });
}
