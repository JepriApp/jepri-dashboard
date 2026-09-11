"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { ExclamationCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Space,
  Table,
  TableColumnsType,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import PurchaseItemActualPriceForm from "../../suppliers-reception/components/PurchaseItemActualPriceForm";

type InvoiceReviewStatus =
  | "pending_review"
  | "approved"
  | "invoicing"
  | "invoiced"
  | "failed";

interface InvoiceReview {
  id: string;
  sale_order_id: string;
  status: InvoiceReviewStatus;
  error_message: string | null;
  siigo_invoice_number: string | null;
}

interface SaleOrder {
  id: string;
  order_code: string | null;
  customer: {
    id: string;
    name: string;
    identification_type: string | null;
    identification_number: string | null;
  };
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
        received_quantity: number | null;
        actual_price: number | null;
        offer: {
          id: string;
          price: number;
          supplier: { id: string; name: string | null };
        };
      };
    }[];
  }[];
}

const invoiceReviewStatusMeta: Record<
  InvoiceReviewStatus,
  { label: string; color: string }
> = {
  pending_review: { label: "Pendiente revisión", color: "default" },
  approved: { label: "Aprobada", color: "blue" },
  invoicing: { label: "Facturando", color: "processing" },
  invoiced: { label: "Facturada", color: "green" },
  failed: { label: "Error", color: "red" },
};

const InvoicingReviewTable = ({ id }: { id: string }) => {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();

  const distributionPlanQuery = useQuery({
    queryKey: ["invoicing", "distribution-plan", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(`id, status, service_fee_percentage`)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const invoiceReviewQuery = useQuery<InvoiceReview[]>({
    queryKey: ["invoicing", "components", "invoice-review", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_review")
        .select(
          `id, sale_order_id, status, error_message, siigo_invoice_number`,
        )
        .eq("distribution_plan_id", id);
      if (error) throw error;
      return data;
    },
  });

  const salesQueryKey = ["invoicing", "components", "sale-order-table", id];
  const salesQuery = useQuery<SaleOrder[]>({
    queryKey: salesQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          order_code,
          customer:customer_id (
            id,
            name,
            identification_type,
            identification_number
          ),
          sale_items:sale_item (
            id,
            required_quantity,
            products:product_id (
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
                offer: offer_id (
                  id,
                  price,
                  supplier: supplier_id ( id, name )
                )
              )
            )
          )
        `,
        )
        .eq("distribution_plan_id", id)
        .neq("status", "cancelled");
      if (error) throw error;
      return data as unknown as SaleOrder[];
    },
  });

  if (
    distributionPlanQuery.isPending ||
    invoiceReviewQuery.isPending ||
    salesQuery.isPending
  )
    return "Loading...";
  if (distributionPlanQuery.error)
    return "An error has occurred: " + distributionPlanQuery.error.message;
  if (invoiceReviewQuery.error)
    return "An error has occurred: " + invoiceReviewQuery.error.message;
  if (salesQuery.error)
    return "An error has occurred: " + salesQuery.error.message;

  if (invoiceReviewQuery.data.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        title="Este plan aún no ha llegado a la etapa de facturación"
        description='La revisión de precios se genera automáticamente cuando el plan pasa al estado "Procesando cuentas".'
      />
    );
  }

  const serviceFeePercentage =
    distributionPlanQuery.data.service_fee_percentage || 0;
  const invoiceReviewByOrderId = new Map(
    invoiceReviewQuery.data.map((review) => [review.sale_order_id, review]),
  );

  const getUnitSalePrice = (actualPrice: number | null) =>
    Number(actualPrice || 0) * (1 + serviceFeePercentage / 100);

  const isInvalidCost = (actualPrice: number | null) =>
    !(Number(actualPrice) > 0);

  const orderHasInvalidCost = (order: SaleOrder) =>
    order.sale_items.some((saleItem) =>
      saleItem.fulfillment.some((fulfillment) =>
        isInvalidCost(fulfillment.purchase_item.actual_price),
      ),
    );

  const ordersWithInvalidCost = salesQuery.data.filter(orderHasInvalidCost);

  const getOrderTotal = (order: SaleOrder) =>
    order.sale_items.reduce((acc, saleItem) => {
      const itemTotal = saleItem.fulfillment.reduce((fAcc, fulfillment) => {
        const quantity = Number(
          fulfillment.purchase_item.received_quantity || 0,
        );
        return (
          fAcc + quantity * getUnitSalePrice(fulfillment.purchase_item.actual_price)
        );
      }, 0);
      return acc + itemTotal;
    }, 0);

  const columns: TableColumnsType<SaleOrder> = [
    {
      title: "# Orden de venta",
      dataIndex: "order_code",
      key: "order_code",
    },
    {
      title: "Cliente",
      dataIndex: ["customer", "name"],
      key: "customer_name",
    },
    {
      title: "Identificación",
      key: "identification",
      render: (_, record) =>
        record.customer?.identification_number &&
        record.customer?.identification_type
          ? `${record.customer.identification_type} ${record.customer.identification_number}`
          : "-",
    },
    {
      title: "Estado de facturación",
      key: "invoice_status",
      render: (_, record) => {
        const review = invoiceReviewByOrderId.get(record.id);
        if (!review) return <Tag>Sin iniciar</Tag>;
        const meta = invoiceReviewStatusMeta[review.status];
        return (
          <Space orientation="vertical" size={0}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {orderHasInvalidCost(record) && (
              <Tag color="error" icon={<ExclamationCircleOutlined />}>
                Costo inválido
              </Tag>
            )}
            {review.status === "invoiced" && review.siigo_invoice_number && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {review.siigo_invoice_number}
              </Typography.Text>
            )}
            {review.status === "failed" && review.error_message && (
              <Tooltip title={review.error_message}>
                <Typography.Text
                  type="danger"
                  style={{ fontSize: 12, cursor: "help" }}
                >
                  Ver error
                </Typography.Text>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: "Total",
      key: "total",
      render: (_, record) => formatPriceAccounting(getOrderTotal(record)),
    },
  ];

  return (
    <>
      {ordersWithInvalidCost.length > 0 && (
        <Alert
          type="error"
          showIcon
          title="Hay órdenes con productos sin costo válido"
          description={`No se podrán aprobar para facturación mientras tengan un costo unitario en $0 o vacío: ${ordersWithInvalidCost
            .map((order) => order.order_code)
            .join(", ")}.`}
          style={{ marginBottom: 16 }}
        />
      )}
      <Table
        dataSource={salesQuery.data.sort((a, b) =>
          (a.order_code || "").localeCompare(b.order_code || ""),
        )}
        columns={columns}
        rowKey="id"
        style={{ overflow: "auto" }}
        expandable={{
        expandedRowRender: (order) => (
          <Table
            dataSource={order.sale_items.flatMap((saleItem) =>
              saleItem.fulfillment.map((fulfillment) => ({
                fulfillmentId: fulfillment.id,
                productName: saleItem.products.name,
                unit: saleItem.products.unit,
                supplierName: fulfillment.purchase_item.offer?.supplier?.name,
                purchaseItemId: fulfillment.purchase_item.id,
                referencePrice: fulfillment.purchase_item.offer?.price,
                actualPrice: fulfillment.purchase_item.actual_price,
                quantity: fulfillment.purchase_item.received_quantity,
              })),
            )}
            rowKey="fulfillmentId"
            pagination={false}
            size="small"
            columns={[
              {
                title: "Producto",
                key: "product",
                render: (_, it) => (
                  <Space orientation="vertical" size={0}>
                    <div>
                      <Typography.Text>{it.productName}</Typography.Text>{" "}
                      <Tag>{it.unit}</Tag>
                    </div>
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12 }}
                    >
                      {it.supplierName}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: "Cantidad",
                key: "quantity",
                render: (_, it) => (
                  <>
                    {Number(it.quantity || 0)}
                    {Number(it.quantity || 0) === 0 && (
                      <Tooltip title="Cantidad entregada es cero">
                        <WarningOutlined
                          style={{ color: token.colorWarning, marginLeft: 4 }}
                        />
                      </Tooltip>
                    )}
                  </>
                ),
              },
              {
                title: "Costo unitario",
                key: "actual_price",
                render: (_, it) => (
                  <Space>
                    <PurchaseItemActualPriceForm
                      purchaseItemId={it.purchaseItemId}
                      planId={id}
                      disabled={false}
                      referencePrice={it.referencePrice || 0}
                      isFocused={false}
                      getRef={() => {}}
                      handleFocus={() => {}}
                      handleBlur={() => {}}
                      triggerSubmit={async (form) => {
                        form.submit();
                      }}
                      onSuccess={() => {
                        queryClient.invalidateQueries({
                          queryKey: salesQueryKey,
                        });
                      }}
                    />
                    {isInvalidCost(it.actualPrice) && (
                      <Tooltip title="El costo debe ser mayor a $0 para poder aprobar esta orden">
                        <ExclamationCircleOutlined
                          style={{ color: token.colorError }}
                        />
                      </Tooltip>
                    )}
                  </Space>
                ),
              },
              {
                title: "Precio de venta unitario",
                key: "sale_price",
                render: (_, it) =>
                  formatPriceAccounting(getUnitSalePrice(it.actualPrice)),
              },
              {
                title: "Subtotal",
                key: "subtotal",
                render: (_, it) =>
                  formatPriceAccounting(
                    Number(it.quantity || 0) *
                      getUnitSalePrice(it.actualPrice),
                  ),
              },
            ]}
          />
        ),
        }}
      />
    </>
  );
};

export default InvoicingReviewTable;
