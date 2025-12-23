"use client";
import { createClient } from "@/lib/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Typography,
  Table,
  Progress,
  Space,
  Tag,
  theme,
  TableColumnsType,
} from "antd";
import { useSearchParams } from "next/navigation";
import AsignSupplierDrawer from "./AsignSupplierDrawer";

interface SaleItem {
  id: string;
  sale_order_id: string;
  sale_order_code: string;
  required_quantity: number;
  product: {
    id: string;
    name: string;
    unit: "lb" | "kg" | "unidad" | "atado";
  };
  fulfillments: {
    id: string;
    purchase_items: {
      id: string;
      quantity: number;
      purchase_order: {
        id: string;
        supplier: {
          id: string;
          name: string;
        };
      };
      offer: {
        id: string;
        price: number;
      };
    };
  }[];
  customer: {
    id: string;
    name: string;
  };
}
const SaleOrderTable = ({ id }: { id: string }) => {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const { token } = theme.useToken();
  const selectedOrderId = params.get("selected_sale_order_id");
  const planId = id;
  const { isPending, error, data, refetch } = useQuery<SaleItem[]>({
    queryKey: ["distribution-plan", "components", "sale-order-table", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
          id,
          sale_orders: sale_order(
            id,
            order_code,
            customer: customer_id(
                id,
                name
            ),
            sale_items: sale_item(  
            id,
            required_quantity,
            product: product_id(
                id,
                name,
                unit
                ),
            fulfillments: fulfillment(
                id,
                purchase_items: purchase_item_id(
                    id,
                    quantity,
                    purchase_order: purchase_order_id(
                        id,
                        supplier: supplier_id(
                            id,
                            name
                        )
                    ),
                    offer: offer_id(
                        id,
                        price
                    )
                )
            )
            )
          )
        `
        )
        .eq("id", planId)
        .single();
      if (error) {
        throw error;
      }
      const mappedData = data.sale_orders.flatMap((order) =>
        order.sale_items.map((item) => ({
          ...item,
          sale_order_code: order.order_code,
          sale_order_id: order.id,
          customer: order.customer,
        }))
      );
      return mappedData as unknown as SaleItem[];
    },
  });

  const columns: TableColumnsType<SaleItem> = [
    {
      title: "Cliente",
      dataIndex: "customer",
      key: "customer",
      render: (_: unknown, record) => {
        const c = record.customer;
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
            }}
          >
            <Typography.Text>{c?.name || "—"}</Typography.Text>
            <Typography.Text type="secondary" ellipsis>
              {record.sale_order_code || "Sin código"}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: "Cumplimiento",
      dataIndex: "fulfillment_progress",
      key: "fulfillment_progress",
      render: (_: unknown, record) => {
        const requiredQty = record.required_quantity;
        const assignedQty = record.fulfillments?.reduce(
          (sum: number, f) => sum + Number(f?.purchase_items?.quantity || 0),
          0
        );
        const percent =
          requiredQty > 0 ? Math.round((assignedQty / requiredQty) * 100) : 0;
        const overAssigned = percent > 100;
        const displayPercent = Math.min(percent, 100);
        return (
          <div>
            <Typography.Text> {record.product?.name} </Typography.Text>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "flex-start",
              }}
            >
              <Progress
                percent={displayPercent}
                strokeColor={overAssigned ? token.colorWarning : undefined}
                style={{ width: 120, marginRight: 4 }}
              />
              <Typography.Text type="secondary">
                {`${assignedQty}/${requiredQty} ${record.product?.unit}`}
              </Typography.Text>
            </div>
          </div>
        );
      },
    },
    {
      title: "Proveedores",
      dataIndex: "item_links",
      key: "item_links",
      render: (_: unknown, record) => {
        const links = Array.isArray(record.fulfillments)
          ? record.fulfillments
          : [];
        return (
          <Space orientation="vertical">
            <Space wrap size={4}>
              {links.map((fullfiment) => {
                const supplier =
                  fullfiment?.purchase_items?.purchase_order?.supplier?.name ??
                  "";
                const qty = Number(fullfiment?.purchase_items?.quantity || 0);
                const unit = record?.product?.unit ?? "";
                const offerPrice = Number(
                  fullfiment?.purchase_items?.offer?.price || 0
                );
                const label = [
                  supplier,
                  `${qty} ${unit}`,
                  `$${offerPrice} c/u`,
                ];
                return (
                  <Tag
                    id={`fullfilmentId_from_sale_order/${fullfiment?.id}`}
                    key={`fullfilmentId_from_sale_order/${fullfiment?.id}`}
                    onClick={() => {
                      const fid = fullfiment?.id;
                      if (!fid) return;
                      /* setHighlightFulfillmentId(
                        highlightFulfillmentId === String(fid)
                          ? null
                          : String(fid)
                      ); */
                    }}
                    style={{
                      cursor: fullfiment?.id ? "pointer" : "default",
                      /*  borderColor:
                        highlightFulfillmentId === String(fullfiment?.id)
                          ? token.colorPrimary
                          : undefined,
                      backgroundColor:
                        highlightFulfillmentId === String(fullfiment?.id)
                          ? token.colorPrimaryBg
                          : undefined, */
                    }}
                  >
                    <Space wrap separator="·" key={fullfiment?.id}>
                      {label.map((e) => (
                        <Typography.Text key={e}>{e}</Typography.Text>
                      ))}
                    </Space>
                  </Tag>
                );
              })}
            </Space>
            <AsignSupplierDrawer
              planId={planId}
              saleItemId={record.id}
              onSuccess={async () => {
                await refetch();
                queryClient.invalidateQueries({
                  queryKey: [
                    "distribution-plan",
                    "components",
                    "sale-order-filter",
                    id,
                  ],
                });
              }}
            />
          </Space>
        );
      },
    },
  ];

  function getColumns() {
    if (selectedOrder?.sale_order_code) {
      columns[0].hidden = true;
      return columns;
    } else {
      return columns;
    }
  }

  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;

  const selectedOrder = data.find((e) => e.sale_order_id === selectedOrderId);
  return (
    <>
      <Card
        title="Ítems del pedido"
        style={{ marginBottom: "16px", width: "100%" }}
        size="small"
        styles={{
          body: {
            padding: 0,
          },
        }}
        extra={
          <Typography.Text type="secondary">
            {selectedOrder
              ? `Orden ${selectedOrder.sale_order_code} — ${
                  selectedOrder.customer.name ?? "—"
                }`
              : "Mostrando todos"}
          </Typography.Text>
        }
      >
        <Table
          dataSource={
            selectedOrderId
              ? data.filter((e) => e.sale_order_id === selectedOrderId)
              : data
          }
          rowKey="id"
          pagination={false}
          size="small"
          columns={getColumns()}
        />
      </Card>
    </>
  );
};

export default SaleOrderTable;
