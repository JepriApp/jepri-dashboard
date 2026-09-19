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
      `customer:customer_id ( id, name, identification_type, identification_number )`,
    )
    .eq("distribution_plan_id", planId)
    .neq("status", "cancelled");
  if (error) throw error;

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
