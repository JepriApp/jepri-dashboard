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

// Página enfocada en: seleccionar órdenes y crear el distribution plan
const { Text } = Typography;
const PlanningPage = () => {
  const { data: orders = [], isLoading } = useQuery<SaleOrder[]>({
    queryKey: ["saleOrders"],
    queryFn: () => getPendingOrdersForAdmin(),
    staleTime: 60_000,
  });

  const columns = [
    {
      title: "Fecha de entrega",
      dataIndex: "delivery_date",
      key: "delivery_date",
      render: (val: string) => dayjs(val).format("YYYY-MM-DD HH:mm"),
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
      title: "Total",
      dataIndex: "total",
      key: "total",
      render: (t: number | undefined) =>
        typeof t === "number" ? `$${t.toFixed(2)}` : "$0.00",
    },
    {
      title: "Items",
      key: "items_count",
      render: (_: unknown, record: SaleOrder) => record.items?.length ?? 0,
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
              columns={
                [
                  {
                    title: "Producto",
                    dataIndex: ["product", "name"],
                    key: "product_name",
                  },
                  {
                    title: "Cant.",
                    dataIndex: "quantity",
                    key: "quantity",
                  },
                  {
                    title: "Unitario",
                    dataIndex: "unit_price",
                    key: "unit_price",
                    render: (v: number) => `$${v.toFixed(2)}`,
                  },
                  {
                    title: "Unidad",
                    dataIndex: ["product", "unit"],
                    key: "unit",
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
