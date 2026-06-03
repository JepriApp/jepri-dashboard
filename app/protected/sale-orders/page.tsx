"use client";

import { Table, Tag, Button, Typography, Space } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import SaleOrderStatusTag from "../components/SaleOrderStatusTag";
import ProductImage from "../components/ProductImage";
import EditSaleOrderModal from "./components/EditSaleOrderModal";

const { Text } = Typography;

export interface SaleOrder {
  id: string;
  customer_id: string;
  created_at: string | null;
  status:
    | "pending"
    | "processing"
    | "out_for_delivery"
    | "delivered"
    | "cancelled";
  order_code: string | null;
  order_seq: number | null;
  service_fee: number | null;
  delivery_fee: number | null;
  notes: string | null;

  order_date: string | null;
  delivery_date: string | null;
  distribution_plan_code: string | null;
  total?: number;
  user?: {
    name: string;
    phone: string;
  };
  items?: SaleItem[];
}
export interface SaleItem {
  id: string;
  sale_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  product?: Product;
}
export interface Product {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  main_photo: string | null;
  reference_price: number | null;
}
const Index = () => {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useQuery({
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
        customer:customer!customer_id (
          id,
          user_id,
          name,
          phone
        ),
        distribution_plan:distribution_plan!distribution_plan_id (
          id,
          plan_date,
          plan_code
        ),
        sale_item:sale_item (
          id,
          product_id,
          required_quantity,
          product:product!product_id (
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

        const adaptedData =
          (data || []).map((order) => {
            const items = (order.sale_item || []).map((item) => ({
              id: item.id,
              sale_order_id: order.id,
              product_id: item.product_id,
              quantity: item.required_quantity,
              unit_price: item.product?.reference_price ?? 0, //BUG: Aqui se usa offer. Debe mostrar es el precio al que se compró, no el de referencia
              product: item.product,
            }));
            const itemsTotal = items.reduce(
              (sum: number, it: any) =>
                sum + (it.unit_price || 0) * (it.quantity || 0),
              0,
            );
            const total =
              itemsTotal + (order.service_fee ?? 0) + (order.delivery_fee ?? 0);

            return {
              id: order.id,
              customer_id: order.customer_id,
              created_at: order.created_at,
              order_date: order.created_at,
              delivery_date: order?.distribution_plan?.plan_date ?? null,
              distribution_plan_code:
                order?.distribution_plan?.plan_code ?? null,
              status: order.status,
              order_code: order.order_code,
              order_seq: order.order_seq,
              total,
              service_fee: order.service_fee ?? 0,
              delivery_fee: order.delivery_fee ?? 0,
              notes: order.notes,
              user: {
                name: order.customer?.name ?? "Sin nombre",
                phone: order.customer?.phone ?? "Sin email",
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
          <Text type="secondary">{record.user?.phone}</Text>
        </Space>
      ),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: SaleOrder["status"]) => (
        <SaleOrderStatusTag status={status} />
      ),
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
    {
      title: "Acciones",
      key: "actions",
      render: (_: any, record: SaleOrder) => (
        <EditSaleOrderModal
          order={record}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["saleOrders"] });
          }}
        />
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
        <Link href="/protected/sale-orders/create">
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
                <Space
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginRight: "32px",
                  }}
                >
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
                    render: (v: number, record: any) => (
                      <div
                        style={{
                          display: "grid",
                          alignItems: "center",
                          gap: 8,
                          gridTemplateColumns: "50px 1fr",
                        }}
                      >
                        <ProductImage
                          source={record.product.main_photo}
                          name={record.product?.name}
                          size="small"
                        />
                        <Space orientation="vertical" size={0}>
                          <Text
                            strong
                            style={{
                              whiteSpace: "normal",
                              wordBreak: "normal",
                            }}
                          >
                            {record.product?.name}
                          </Text>
                          <Tag>{record.product?.unit || ""} </Tag>
                        </Space>
                      </div>
                    ),
                  },
                  {
                    title: "Cant./Unidad",
                    dataIndex: "quantity",
                    key: "quantity",
                    render: (v: number, record: any) => v.toFixed(2),
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
                          (record.quantity || 0).toFixed(2),
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

export default Index;
