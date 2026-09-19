import { findCustomersMissingInSiigo } from "@/lib/invoicing/validateCustomers";
import { getSiigoClient } from "@/lib/siigo/getSiigoClient";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params;
  const supabase = await createClient();

  try {
    const result = await findCustomersMissingInSiigo(
      supabase,
      getSiigoClient(),
      planId,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo validar los clientes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
