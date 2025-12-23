"use client";
import { createClient } from "@/lib/supabase/client";
import {
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  WarningFilled,
  CheckCircleFilled,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, theme, List, Typography, Tooltip } from "antd";
import Sider from "antd/es/layout/Sider";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface SaleOrder {
  id: string;
  order_code: string;
  customer: {
    id: string;
    name: string;
  };
  sale_items: {
    id: string;
    required_quantity: number;
    fulfillments: {
      id: string;
      purchase_items: {
        id: string;
        quantity: number;
      };
    }[];
  }[];
}
const SaleOrderFilter = ({ id }: { id: string }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const { token } = theme.useToken();
  const searchParams = useSearchParams();
  const supabase = createClient();
  useEffect(() => {
    const initialId = searchParams.get("selected_sale_order_id");
    setSelectedOrderId(initialId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { isPending, error, data } = useQuery<SaleOrder[]>({
    queryKey: ["distribution-plan", "components", "sale-order-filter", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          order_code,
          customer: customer_id(
            id,
            name
          ),
          sale_items: sale_item(
            id,
            required_quantity,
            fulfillments: fulfillment(
              id,
              purchase_items: purchase_item_id(
                id,
                quantity
              )
            )
          )
        `
        )
        .eq("distribution_plan_id", id)
        .order("created_at", { ascending: true });
      if (error) {
        throw error;
      }
      return data as unknown as SaleOrder[];
    },
  });
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;

  return (
    <Sider collapsible collapsed={collapsed} theme="light" trigger={null}>
      <Card
        title="Pedidos"
        size="small"
        styles={{ body: { padding: 0 } }}
        extra={[
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: "16px",
            }}
            key="toggle-collapse"
          />,
        ]}
      >
        <List<SaleOrder>
          dataSource={data}
          rowKey={(e) => e.id}
          renderItem={(sale_order: SaleOrder) => {
            const isSelected = selectedOrderId === sale_order.id;
            const isSaleOrderCompletelyAsignned = sale_order.sale_items.every(
              (item) => {
                const itemAssignedQty = item.fulfillments.reduce(
                  (itemAcc, fulfillment) =>
                    itemAcc + fulfillment.purchase_items.quantity,
                  0
                );
                return itemAssignedQty >= item.required_quantity;
              }
            );
            const isSaleOrderOverAsignned = sale_order.sale_items.some(
              (item) => {
                const itemAssignedQty = item.fulfillments.reduce(
                  (itemAcc, fulfillment) =>
                    itemAcc + fulfillment.purchase_items.quantity,
                  0
                );
                return itemAssignedQty > item.required_quantity;
              }
            );
            return (
              <div
                key={sale_order.id}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  background: isSelected ? token.colorFillTertiary : undefined,
                  borderLeft: `3px solid ${
                    isSelected ? token.colorPrimary : "transparent"
                  }`,
                }}
                onClick={() =>
                  setSelectedOrderId((prev) => {
                    const newSelectedOrderId =
                      prev === sale_order.id ? "" : sale_order.id;
                    return newSelectedOrderId;
                  })
                }
              >
                <Link
                  href={
                    selectedOrderId === sale_order.id
                      ? "?"
                      : "?selected_sale_order_id=" + sale_order.id
                  }
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography.Text strong>
                      {sale_order.order_code || "Sin código"}
                    </Typography.Text>
                    {sale_order.sale_items?.length <= 0 && (
                      <Tooltip title="El pedido no tiene productos">
                        <WarningFilled
                          style={{
                            fontSize: "16px",
                            color: token.colorWarning,
                          }}
                        />
                      </Tooltip>
                    )}
                    <div>
                      {isSaleOrderCompletelyAsignned &&
                        sale_order.sale_items?.length > 0 && (
                          <CheckCircleFilled
                            style={{
                              fontSize: "16px",
                              color: token.colorSuccess,
                            }}
                          />
                        )}
                      {isSaleOrderOverAsignned && (
                        <Tooltip title="El pedido tiene más productos asignados de los requeridos">
                          <WarningFilled
                            style={{
                              fontSize: "16px",
                              color: token.colorWarning,
                            }}
                          />
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  <Typography.Text type="secondary" ellipsis>
                    {sale_order.customer.name || "—"}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Items: {sale_order.sale_items?.length ?? 0}
                  </Typography.Text>
                </Link>
              </div>
            );
          }}
        ></List>
      </Card>
    </Sider>
  );
};

export default SaleOrderFilter;
