import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement } from "react";
import { Table, Tag, Button, Typography, Space } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  getPendingOrdersForAdmin,
  type SaleOrder,
} from "@/services/supabase.service";
import Link from "next/link";
import { supabase } from "@/services/supabase.client";
import { formatPriceAccounting } from "@/utils/formatPrice";

// Página enfocada en: seleccionar órdenes y crear el distribution plan
const { Text } = Typography;
const PlanningPage = () => {
  const { data: orders = [], isLoading } = useQuery<SaleOrder[]>({
    queryKey: ["saleOrders"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("sale_order")
          .select(
            `
        id,
        customer_id,
        created_at,
        status,
        order_code,
        order_seq,
        service_fee,
        delivery_fee,
        notes,
        customer:customer_id (
          id,
          user_id,
          name,
          auth:user_id (
            email
          )
        ),
        distribution_plan:distribution_plan_id (
          id,
          plan_date,
          plan_code
        ),
        sale_item:sale_item (
          id,
          product_id,
          required_quantity,
          product:product_id (
            id,
            name,
            description,
            unit,
            main_photo,
            reference_price
          )
        )
      `
          )
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error al obtener órdenes pendientes:", error);
          throw error;
        }

        const adaptedData: SaleOrder[] =
          (data || []).map((order: any) => {
            const items = (order.sale_item || []).map((item: any) => ({
              id: item.id,
              sale_order_id: order.id,
              product_id: item.product_id,
              quantity: item.required_quantity,
              unit_price: item.product?.reference_price ?? 0,
              product: item.product,
            }));
            const itemsTotal = items.reduce(
              (sum: number, it: any) =>
                sum + (it.unit_price || 0) * (it.quantity || 0),
              0
            );
            const total =
              itemsTotal + (order.service_fee ?? 0) + (order.delivery_fee ?? 0);

            return {
              id: order.id,
              customer_id: order.customer_id,
              order_date: order.created_at,
              delivery_date: order?.distribution_plan?.plan_date ?? null,
              distribution_plan_code:
                order?.distribution_plan?.plan_code ?? null,
              status: order.status,
              order_code: order.order_code,
              order_seq: order.order_seq,
              total,
              service_fee: order.service_fee,
              delivery_charge: order.delivery_fee,
              notes: order.notes,
              user: {
                name: order.customer?.name ?? "Sin nombre",
                email: order.customer?.auth?.email ?? "Sin email",
              },
              items,
            };
          }) || [];

        return adaptedData;
      } catch (error) {
        console.error("Error en getPendingOrdersForAdmin:", error);
        throw error;
      }
    },
  });

  const columns = [
    {
      title: "Código del pedido",
      dataIndex: "order_code",
      key: "order_code",
    },

    {
      title: "Cliente",
      dataIndex: ["user", "name"],
      key: "user_name",
      render: (name: string, record: SaleOrder) => (
        <Space wrap>
          <Text>{name}</Text>
          <Text type="secondary">{record.user?.email}</Text>
        </Space>
      ),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: SaleOrder["status"]) => <Tag>{status}</Tag>,
    },
    {
      title: "Items",
      key: "items_count",
      render: (_: unknown, record: SaleOrder) => record.items?.length ?? 0,
    },
    {
      title: "Plan de distribución",
      dataIndex: "delivery_date",
      key: "delivery_date",
      render: (val: string | null | undefined, record: SaleOrder) =>
        val ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
            }}
          >
            <Typography.Text>
              {record.distribution_plan_code || "—"}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis>
              {dayjs(val).format("YYYY-MM-DD")}
            </Typography.Text>
          </div>
        ) : (
          <Text type="secondary">Pendiente de asignación</Text>
        ),
    },
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        <Link href="/a/sale-orders/create">
          <Button type="primary">Crear orden</Button>
        </Link>
      </div>
      <Table
        loading={isLoading}
        dataSource={orders}
        columns={columns as any}
        rowKey="id"
        expandable={{
          expandedRowRender: (record: SaleOrder) => (
            <Table
              dataSource={record.items || []}
              rowKey="id"
              pagination={false}
              size="small"
              footer={() => (
                <Space style={{ display: "flex", justifyContent: "flex-end", marginRight: '32px' }}>
                  <Typography.Text>
                    Total: {formatPriceAccounting(record.total || 0)}
                  </Typography.Text>
                </Space>
              )}
              columns={
                [
                  {
                    title: "Producto",
                    dataIndex: ["product", "name"],
                    key: "product_name",
                  },
                  {
                    title: "Cant./Unidad",
                    dataIndex: "quantity",
                    key: "quantity",
                    render: (v: number, record: any) =>
                      `${v.toFixed(2)} ${record.product?.unit || ""}`,
                  },
                  {
                    title: "Unitario",
                    dataIndex: "unit_price",
                    key: "unit_price",
                    render: (v: number) => formatPriceAccounting(v),
                  },
                  {
                    title: "Subtotal",
                    dataIndex: "subtotal",
                    key: "subtotal",
                    render: (t: number | undefined, record: any) =>
                      formatPriceAccounting(
                        (record.unit_price || 0) *
                          (record.quantity || 0).toFixed(2)
                      ),
                  },
                ] as any
              }
            />
          ),
        }}
      />
    </>
  );
};

export default PlanningPage;

PlanningPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};
