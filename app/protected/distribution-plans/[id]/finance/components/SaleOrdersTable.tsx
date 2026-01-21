"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  Typography,
  TableColumnsType,
  Tag,
  Tooltip,
  theme,
  Space,
  InputNumber,
  Form,
  Button,
} from "antd";
import React from "react";
import SaleOrderDeliveryFeeForm from "./SaleOrderDeliveryFeeForm";
import DownloadFinanceExcel from "./DownloadFinanceExcel";

interface SaleOrder {
  id: string;
  order_code: string | null;
  customer: {
    id: string;
    name: string;
    identification_type: string | null;
    identification_number: string | null;
    contact: string | null;
    phone: string | null;
  };
  status:
    | "cancelled"
    | "pending"
    | "processing"
    | "out_for_delivery"
    | "delivered";
  sale_items: {
    id: string;
    required_quantity: number;
    products: {
      id: string;
      name: string;
      unit: "lb" | "kg" | "unidad" | "atado";
    };
    fulfillment: {
      id: string;
      purchase_item: {
        id: string;
        received_quantity: number;
        actual_price: number;
        purchase_order: {
          purchase_code: string | null;
        };
        offer: {
          id: string;
          supplier: {
            id: string;
            name: string | null;
          };
        };
      };
    }[];
  }[];
  service_fee: number | null;
  delivery_fee: number | null;
}
const SaleOrdersTable = ({ id }: { id: string }) => {
  const supabase = createClient();
  const { token } = theme.useToken();
  const [serviceFeePercentage, setServiceFeePercentage] = React.useState(24);
  const { isPending, error, data, refetch } = useQuery<SaleOrder[]>({
    queryKey: ["finance", "components", "sale-order-table", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          order_code,
          customer:customer_id(
            id,
            name,
            identification_type,
            identification_number,
            contact,
            phone
          ),
          status,
          sale_items:sale_item(
            id,
            required_quantity,
            products:product_id(
              id,
              name,
              unit
            ),
            fulfillment: fulfillment (
              id,
              purchase_item: purchase_item_id (
                id,
                received_quantity,
                actual_price,
                purchase_order: purchase_order_id ( purchase_code ),
                offer: offer_id (
                  id,
                  supplier: supplier_id ( id, name )
                  )
                )
              )
          ),
          service_fee,
          delivery_fee
  `,
        )
        .eq("distribution_plan_id", id);
      if (error) {
        throw error;
      }
      return data as unknown as SaleOrder[];
    },
  });
  const calculateServiceFee = (order: SaleOrder) => {
    const serviceFee = order.sale_items.reduce((acc, saleItem) => {
      const itemServiceFee = saleItem.fulfillment.reduce(
        (fAcc, fulfillment) => {
          const quantity = Number(
            fulfillment.purchase_item.received_quantity || 0,
          );
          const unitCost = Number(fulfillment.purchase_item.actual_price || 0);
          const serviceFeeAmount =
            quantity * unitCost * (serviceFeePercentage / 100);
          return fAcc + serviceFeeAmount;
        },
        0,
      );
      return acc + itemServiceFee;
    }, 0);

    return serviceFee;
  };

  const getTotal = (order: SaleOrder) => {
    const itemsTotal = order.sale_items.reduce((acc, saleItem) => {
      const itemTotal = saleItem.fulfillment.reduce((fAcc, fulfillment) => {
        const quantity = Number(
          fulfillment.purchase_item.received_quantity || 0,
        );
        const unitPrice =
          Number(fulfillment.purchase_item.actual_price || 0) *
          (1 + serviceFeePercentage / 100);
        return fAcc + quantity * unitPrice;
      }, 0);
      return acc + itemTotal;
    }, 0);
    const total = itemsTotal + (order.delivery_fee || 0);
    return total;
  };
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;

  const columns: TableColumnsType<SaleOrder> = [
    {
      title: "# Órden de venta",
      dataIndex: "order_code",
      key: "order_code",
    },
    {
      title: "Cliente",
      dataIndex: ["customer", "name"],
      key: "user_name",
    },
    {
      title: "Contacto",
      dataIndex: ["customer", "contact"],
      key: "user_contact",
    },
    {
      title: "Teléfono",
      dataIndex: ["customer", "phone"],
      key: "user_phone",
    },
    {
      title: "Identificación",
      dataIndex: ["customer", "identification_number"],
      key: "user_identification_number",
      render: (v, record) =>
        v && record.customer?.identification_type
          ? `${record.customer?.identification_type} ${v}`
          : "-",
    },
    {
      title: "Cargos",
      key: "charges",
      render: (_, record) => (
        <Typography.Text style={{ whiteSpace: "nowrap" }}>
          Servicio: {formatPriceAccounting(calculateServiceFee(record))}
          <br />
          Domicilio:{" "}
          <SaleOrderDeliveryFeeForm
            id={record.id}
            disabled={false}
            onSuccess={async () => {
              await refetch();
            }}
          />
        </Typography.Text>
      ),
    },
    {
      title: "Total",
      dataIndex: "total",
      key: "total",
      render: (t: number | undefined, record: SaleOrder) =>
        formatPriceAccounting(getTotal(record)),
    },
  ];

  return (
    <>
      <Space>
        <Form.Item label="Comisión por venta">
          <InputNumber
            value={serviceFeePercentage}
            onChange={(val) => setServiceFeePercentage(val ?? 0)}
            style={{ width: 120 }}
            min={0}
            max={100}
            precision={1}
            prefix="%"
          />
        </Form.Item>
        <DownloadFinanceExcel
          data={data}
          serviceFeePercentage={serviceFeePercentage}
          planId={id}
        />
      </Space>
      <Table
        dataSource={data.sort((a, b) =>
          (a.order_code || "").localeCompare(b.order_code || ""),
        )}
        style={{ overflow: "auto" }}
        columns={columns}
        rowKey="id"
        expandable={{
          expandedRowRender: (saleOrder) => (
            <Table
              dataSource={saleOrder.sale_items.flatMap((saleItem) =>
                saleItem.fulfillment.map((fulfillment) => ({
                  fulfillmentId: fulfillment.id,

                  // Sale Order
                  saleOrderId: saleOrder.id,
                  orderCode: saleOrder.order_code,
                  orderStatus: saleOrder.status,

                  // Customer
                  customerId: saleOrder.customer.id,
                  customerName: saleOrder.customer.name,

                  // Sale Item
                  saleItemId: saleItem.id,
                  productId: saleItem.products.id,
                  productName: saleItem.products.name,
                  unit: saleItem.products.unit,
                  requiredQuantity: saleItem.required_quantity,

                  // Purchase / Offer
                  supplierName:
                    fulfillment.purchase_item?.offer?.supplier?.name,
                  purchaseOrderCode:
                    fulfillment.purchase_item.purchase_order.purchase_code,
                  purchaseItemId: fulfillment.purchase_item.id,
                  offerId: fulfillment.purchase_item.offer.id,
                  actualPrice: fulfillment.purchase_item.actual_price,
                  quantity_delivered:
                    fulfillment.purchase_item.received_quantity,
                })),
              )}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "Producto",
                  dataIndex: ["productName"],
                  key: "productName",
                  render: (v, it) => (
                    <Space orientation="vertical">
                      <div>
                        <Typography.Text>{v}</Typography.Text>
                        <Tag>{it?.unit}</Tag>
                      </div>
                      <div>
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                        >
                          {it.supplierName}
                        </Typography.Text>{" "}
                        <Typography.Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                        >
                          {it.purchaseOrderCode}
                        </Typography.Text>
                      </div>
                    </Space>
                  ),
                },
                {
                  title: "Cantidad",
                  dataIndex: ["quantity_delivered"],
                  key: "quantity_delivered",
                  render: (v) => (
                    <>
                      {v}
                      {Number(v || 0) == 0 && (
                        <Tooltip title="Cantidad entregada es cero">
                          <WarningOutlined
                            style={{ color: token.colorWarning }}
                          />
                        </Tooltip>
                      )}
                    </>
                  ),
                },
                {
                  title: "Costo unitario",
                  dataIndex: ["actualPrice"],
                  key: "actualPrice",
                  render: (v) => (
                    <>
                      {formatPriceAccounting(Number(v || 0))}
                      {Number(v || 0) == 0 && (
                        <Tooltip title="Precio unitario es cero">
                          <WarningOutlined
                            style={{ color: token.colorWarning }}
                          />
                        </Tooltip>
                      )}
                    </>
                  ),
                },
                {
                  title: "Precio de venta unitario",
                  dataIndex: ["actualPrice"],
                  render: (v) =>
                    formatPriceAccounting(
                      Number(v * (1 + serviceFeePercentage / 100) || 0),
                    ),
                },
                {
                  title: "Subtotal",
                  key: "subtotal",
                  render: (_, it) => {
                    const subtotal =
                      Number(it.quantity_delivered || 0) *
                      Number(
                        it.actualPrice * (1 + serviceFeePercentage / 100) || 0,
                      );
                    return formatPriceAccounting(subtotal);
                  },
                },
              ]}
            />
          ),
        }}
      />
    </>
  );
};

export default SaleOrdersTable;
