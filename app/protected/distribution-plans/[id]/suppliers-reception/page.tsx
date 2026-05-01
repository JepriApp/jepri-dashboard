"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, Space, Table, TableColumnsType, Typography } from "antd";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import PurchaseOrderStatusInfo from "./components/PurchaseOrderStatusInfo";
import PurchaseItemActualPriceForm from "./components/PurchaseItemActualPriceForm";
import PurchaseItemReceivedQtyForm from "./components/PurchaseItemReceivedQtyForm";
import PurchaseOrderNotesForm from "./components/PurchaseOrderNotesForm";
import UpdatePurchaseOrderStatusButton from "./components/UpdatePurchaseOrderStatusButton";
import PurchaseOrderStatusTag from "@/app/protected/components/PurchaseOrderStatusTag";
import ProductImage from "@/app/protected/components/ProductImage";

type PurchaseItem = {
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
type PurchaseOrder = {
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
  const distributionPlanQuery = useQuery({
    queryKey: ["distribution-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
            id,
            status
          `,
        )
        .eq("id", planId)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
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
          <Card
            key={group.id}
            style={{ marginBottom: 24, overflow: "auto" }}
            title={
              <Space orientation="vertical" size={0} align="start" wrap>
                <Space size={8} wrap>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {group.supplier.name}
                  </Typography.Title>
                  <PurchaseOrderStatusTag status={group.status} />
                </Space>
                <Typography.Text type="secondary">
                  Código de compra: {group.purchase_code || "—"}
                </Typography.Text>
              </Space>
            }
            extra={
              <Space orientation="vertical" align="end" size={4} wrap>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Última actualización: {group.updated_by_name?.name || "—"}{" "}
                  {group.updated_at
                    ? dayjs(group.updated_at).format("YYYY-MM-DD HH:mm A")
                    : "—"}
                </Typography.Text>
                {distributionPlanQuery.data?.status === "cancelled" ||
                distributionPlanQuery.data?.status === "completed" ? (
                  <></>
                ) : (
                  <PurchaseOrderStatusInfo status={group.status as string} />
                )}
              </Space>
            }
            styles={{ body: { padding: 0 } }}
          >
            {(() => {
              const isPublished = group.status === "published";
              const isEditable = group.status === "accepted";
              const isFinal = ["received", "cancelled", "rejected"].includes(
                group.status || "",
              );

              const groupColumns: TableColumnsType<PurchaseItem> = [
                {
                  title: "Producto",
                  dataIndex: "product_name",
                  key: "product_name",
                  render: (v: string | null, record) => (
                    <div className="flex flex-row flex-wrap gap-2">
                      <ProductImage
                        source={record.offer.product.main_photo}
                        name={record.offer.product.name}
                        size="small"
                      />
                      <Space orientation="horizontal" size={8} wrap>
                        <div>{`${record.offer.product.name} x ${record.offer.product.unit}`}</div>
                        <Typography.Text type="secondary">
                          {record.fullfillments
                            ?.map((f) => f.sale_item.sale_order.order_code)
                            .join(", ")}
                        </Typography.Text>
                      </Space>
                    </div>
                  ),
                },
                {
                  title: "Precio",
                  dataIndex: "price",
                  key: "price",
                  children: [
                    {
                      title: "Mas reciente",
                      dataIndex: "reference_price",
                      key: "reference_price",
                      render: (v: number | null, record: PurchaseItem) =>
                        formatPriceAccounting(record.offer.price),
                    },
                    {
                      title: "Real",
                      dataIndex: "actual_price",
                      key: "actual_price",
                      render: (v: number | null, row: PurchaseItem) => (
                        <PurchaseItemActualPriceForm
                          purchaseItemId={row.id}
                          disabled={!isEditable}
                          planId={planId}
                        />
                      ),
                    },
                  ],
                },
                {
                  title: "Cantidad",
                  children: [
                    {
                      title: "Requerida",
                      dataIndex: "quantity",
                      key: "quantity",
                      render: (v: number) => Number(v),
                    },
                    {
                      title: "Recibida",
                      dataIndex: "received_quantity",
                      key: "received_quantity",
                      render: (v: number | null, row: PurchaseItem) => (
                        <PurchaseItemReceivedQtyForm
                          purchaseItemId={row.id}
                          disabled={!isEditable}
                          planId={planId}
                        />
                      ),
                    },
                  ],
                },
              ];

              return (
                <Table
                  bordered
                  dataSource={group.items.sort((a, b) =>
                    a.offer.product.name.localeCompare(b.offer.product.name),
                  )}
                  columns={groupColumns}
                  rowKey="id"
                  pagination={false}
                  footer={() => (
                    <div
                      style={{ display: "flex", gap: 8, justifyContent: "end" }}
                    >
                      <PurchaseOrderNotesForm
                        purchaseOrderId={group.id}
                        planId={planId}
                      />
                      {distributionPlanQuery.data?.status !== "in_progress" ? (
                        <></>
                      ) : (
                        <UpdatePurchaseOrderStatusButton
                          isCreated={group.status === "created"}
                          isPublished={isPublished}
                          isEditable={isEditable}
                          isFinal={isFinal}
                          id={group.id}
                          onSuccess={async () => {
                            await refetch();
                          }}
                        />
                      )}
                    </div>
                  )}
                />
              );
            })()}
          </Card>
        ))}
    </Space>
  );
};

export default Page;
