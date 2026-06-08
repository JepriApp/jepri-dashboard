"use client";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Space } from "antd";
import { useParams } from "next/navigation";
import SupplierReceptionTableForm from "./components/SupplierReceptionTableForm";

export type PurchaseItem = {
  id: string;
  quantity: number;
  actual_price: number | null;
  received_quantity: number | null;
  offer: {
    id: string;
    price: number;
    product: {
      id: string;
      name: string;
      unit: string;
      main_photo: string | null;
    };
  };
  fullfillments: {
    id: string;
    sale_item: {
      id: string;
      sale_order: {
        order_code: string;
      };
    };
  }[];
};
export type PurchaseOrder = {
  id: string;
  purchase_code: string | null;
  status:
    | "cancelled"
    | "created"
    | "published"
    | "accepted"
    | "received"
    | "rejected";
  notes: string | null;
  updated_by_name: { name: string };
  updated_at: string | null;
  supplier: {
    id: string;
    name: string | null;
  };
  items: PurchaseItem[];
};
const Page = () => {
  const { id: planId } = useParams() as { id: string };
  const supabase = createClient();
  const { data, isPending, error, refetch } = useQuery<PurchaseOrder[]>({
    queryKey: [
      "suppliers-reception",
      {
        planId,
      },
    ],
    enabled: !!planId,
    queryFn: async () => {
      if (!planId) return [];

      // Obtener órdenes de compra del plan con items y joins necesarios
      const { data, error } = await supabase
        .from("purchase_order")
        .select(
          `
          id,
          purchase_code,
          status,
          notes,
          updated_by_name: updated_by (
            name
          ),
          updated_at,
          supplier:supplier_id ( id, name ),
          items:purchase_item (
            id,
            quantity,
            actual_price,
            received_quantity,
            offer:offer_id (
              id,
              price,
              product:product_id (
                id,
                name,
                unit,
                main_photo
              )
            ),
            fullfillments: fulfillment (
              id,
              sale_item: sale_item_id (
                id,
                sale_order: sale_order_id (
                  order_code
                )
              )
            )
          )
        `
        )
        .eq("distribution_plan_id", planId);

      if (error) throw error;

      return data as unknown as PurchaseOrder[];
    },
  });

  if (isPending) return "Loading...";
  if (error || !planId) return "An error has occurred: " + error?.message;
  return (
    <Space orientation="vertical" size={24} style={{ width: "100%" }}>
      {data
        .sort((a, b) =>
          (a.purchase_code || "").localeCompare(b.purchase_code || ""),
        )
        .map((group) => (
          <div key={group.id}>
            <SupplierReceptionTableForm
              purchaseOrder={group}
              planId={planId}
              onSuccessUpdatePurchaseOrder={refetch}
            />
          </div>
        ))}
    </Space>
  );
};

export default Page;
