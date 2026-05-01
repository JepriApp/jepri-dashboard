"use client";
import ProductImage from "@/app/protected/components/ProductImage";
import SaleOrderStatusTag from "@/app/protected/components/SaleOrderStatusTag";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Table, Typography, TableColumnsType } from "antd";
interface SaleOrder {
  id: string;
  order_code: string | null;
  customer: {
    id: string;
    name: string;
  };
  status: string;
  sale_item: {
    id: string;
    required_quantity: number;
    products: {
      id: string;
      reference_price: number;
      name: string;
      unit: string;
    };
  }[];
  service_fee: number;
  delivery_fee: number;
  subtotal: number;
  total: number;
  items: {
    id: string;
    required_quantity: number;
    products: {
      id: string;
      reference_price: number;
      name: string;
      unit: string;
      main_photo: string;
    };
  }[];
}
const SaleOrdersTable = ({ id }: { id: string }) => {
  const supabase = createClient();
  const { isPending, error, data } = useQuery<SaleOrder[]>({
    queryKey: ["distribution-plan", "components", "sale-order-table", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          order_code,
          customer:customer_id(
            id,
            name
          ),
          status,
          sale_item:sale_item(
            id,
            required_quantity,
            products:product_id(
              id,
              reference_price,
              name,
              unit,
              main_photo
            )
          ),
          service_fee,
          delivery_fee
  `
        )
        .eq("distribution_plan_id", id);
      if (error) {
        throw error;
      }
      return data.map((sale_order) => {
        const subtotal = sale_order.sale_item.reduce(
          (acc, item) =>
            acc +
            Number(item.required_quantity || 0) *
              Number(item.products?.reference_price || 0),
          0,
        );
        const total =
          subtotal +
          Number(sale_order.service_fee || 0) +
          Number(sale_order.delivery_fee || 0);
        return {
          ...sale_order,
          customer: sale_order.customer as unknown as SaleOrder["customer"],
          items: sale_order.sale_item,
          subtotal,
          total,
        } as SaleOrder;
      });
    },
  });
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;

  const columns: TableColumnsType<SaleOrder> = [
    {
      title: "Cliente",
      dataIndex: "customer",
      key: "customer",
      render: (customer, record) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography.Text>{record.customer?.name || "—"}</Typography.Text>
          <Typography.Text type="secondary" ellipsis>
            {record.order_code || "Sin código"}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status) => <SaleOrderStatusTag status={status} />,
    },
    {
      title: "Subtotal",
      dataIndex: "subtotal",
      key: "subtotal",
      render: (t) => formatPriceAccounting(Number(t ?? 0)),
    },
    {
      title: "Cargos",
      key: "charges",
      render: (_, record) => (
        <Typography.Text style={{ whiteSpace: "nowrap" }}>
          Servicio: {formatPriceAccounting(Number(record.service_fee || 0))}
          <br />
          Domicilio: {formatPriceAccounting(Number(record.delivery_fee || 0))}
        </Typography.Text>
      ),
    },
    {
      title: "Total",
      dataIndex: "total",
      key: "total",
      render: (t) => formatPriceAccounting(Number(t ?? 0)),
    },
    {
      title: "Items",
      key: "items_count",
      render: (_, record) => record.items?.length ?? 0,
    },
  ];
  return (
    <Table
      dataSource={data}
      style={{ overflow: "auto" }}
      columns={columns}
      rowKey="id"
      expandable={{
        expandedRowRender: (record) => (
          <Table
            dataSource={record.items || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              {
                title: "Producto",
                dataIndex: ["products", "name"],
                key: "product_name",
                render: (_, it) => {
                  const product = it.products;
                  return (
                    <div
                      style={{
                        display: "grid",
                        alignItems: "center",
                        gap: 8,
                        gridTemplateColumns: "80px 1fr",
                      }}
                    >
                      <ProductImage
                        source={product.main_photo}
                        name={product.name}
                        size="small"
                      />
                      <Typography.Text
                        strong
                        style={{ whiteSpace: "normal", wordBreak: "normal" }}
                      >
                        {product.name}
                      </Typography.Text>
                    </div>
                  );
                },
              },
              {
                title: "Cant./Unidad",
                dataIndex: ["products", "required_quantity"],
                key: "required_quantity",
                render: (_, it) =>
                  `${Number(it.required_quantity || 0)} ${
                    it?.products?.unit ?? ""
                  }`,
              },
              {
                title: "Unitario",
                dataIndex: ["products", "reference_price"],
                key: "unit_price",
                render: (v) => formatPriceAccounting(Number(v || 0)),
              },
              {
                title: "Subtotal",
                key: "subtotal",
                render: (_, it) => {
                  const subtotal =
                    Number(it.required_quantity || 0) *
                    Number(it.products?.reference_price || 0);
                  return formatPriceAccounting(subtotal);
                },
              },
            ]}
          />
        ),
      }}
    />
  );
};

export default SaleOrdersTable;
