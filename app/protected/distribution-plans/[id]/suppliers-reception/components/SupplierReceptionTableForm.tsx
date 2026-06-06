import ProductImage from "@/app/protected/components/ProductImage";
import PurchaseOrderStatusTag from "@/app/protected/components/PurchaseOrderStatusTag";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { Card, Space, Typography, TableColumnsType, Table } from "antd";
import dayjs from "dayjs";
import React, { useState } from "react";
import PurchaseItemActualPriceForm from "./PurchaseItemActualPriceForm";
import PurchaseItemReceivedQtyForm from "./PurchaseItemReceivedQtyForm";
import PurchaseOrderNotesForm from "./PurchaseOrderNotesForm";
import PurchaseOrderStatusInfo from "./PurchaseOrderStatusInfo";
import UpdatePurchaseOrderStatusButton from "./UpdatePurchaseOrderStatusButton";
import { PurchaseItem, PurchaseOrder } from "../page";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface props {
  purchaseOrder: PurchaseOrder;
  planId: string;
  onSuccessUpdatePurchaseOrder: (() => void) | undefined;
}

const SupplierReceptionTableForm = ({
  purchaseOrder,
  planId,
  onSuccessUpdatePurchaseOrder,
}: props) => {
  const supabase = createClient();
  const [currentFocusId, setCurrentFocusId] = useState<string | null>(null);
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

  return (
    <Card
      key={purchaseOrder.id}
      style={{ marginBottom: 24, overflow: "auto" }}
      title={
        <Space orientation="vertical" size={0} align="start" wrap>
          <Space size={8} wrap>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {purchaseOrder.supplier.name}
            </Typography.Title>
            <PurchaseOrderStatusTag status={purchaseOrder.status} />
          </Space>
          <Typography.Text type="secondary">
            Código de compra: {purchaseOrder.purchase_code || "—"}
          </Typography.Text>
        </Space>
      }
      extra={
        <Space orientation="vertical" align="end" size={4} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Última actualización: {purchaseOrder.updated_by_name?.name || "—"}{" "}
            {purchaseOrder.updated_at
              ? dayjs(purchaseOrder.updated_at).format("YYYY-MM-DD HH:mm A")
              : "—"}
          </Typography.Text>
          {distributionPlanQuery.data?.status === "cancelled" ||
          distributionPlanQuery.data?.status === "completed" ? (
            <></>
          ) : (
            <PurchaseOrderStatusInfo status={purchaseOrder.status as string} />
          )}
        </Space>
      }
      styles={{ body: { padding: 0 } }}
    >
      {(() => {
        const isPublished = purchaseOrder.status === "published";
        const isEditable = purchaseOrder.status === "accepted";
        const isFinal = ["received", "cancelled", "rejected"].includes(
          purchaseOrder.status || "",
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
                  <Space className="flex row-auto">
                    <PurchaseItemActualPriceForm
                      purchaseItemId={row.id}
                      disabled={!isEditable}
                      planId={planId}
                      referencePrice={row.offer.price}
                      handleFocus={function (): void {
                        setCurrentFocusId(row.offer.product.id);
                      }}
                      handleBlur={function (): void {
                        setCurrentFocusId(null);
                      }}
                      isFocused={
                        currentFocusId === row.offer.product.id &&
                        purchaseOrder.items.filter(
                          (e) => e.offer.product.id === row.offer.product.id,
                        ).length > 1
                      }
                    />
                  </Space>
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
            dataSource={purchaseOrder.items.sort((a, b) =>
              a.offer.product.name.localeCompare(b.offer.product.name),
            )}
            columns={groupColumns}
            rowKey="id"
            pagination={false}
            footer={() => (
              <div style={{ display: "flex", gap: 8, justifyContent: "end" }}>
                <PurchaseOrderNotesForm
                  purchaseOrderId={purchaseOrder.id}
                  planId={planId}
                />
                {distributionPlanQuery.data?.status !== "in_progress" ? (
                  <></>
                ) : (
                  <UpdatePurchaseOrderStatusButton
                    isCreated={purchaseOrder.status === "created"}
                    isPublished={isPublished}
                    isEditable={isEditable}
                    isFinal={isFinal}
                    id={purchaseOrder.id}
                    onSuccess={() => {
                      onSuccessUpdatePurchaseOrder?.();
                    }}
                  />
                )}
              </div>
            )}
          />
        );
      })()}
    </Card>
  );
};

export default SupplierReceptionTableForm;
