"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { useIsAdmin } from "@/lib/hooks/useIsAdmin";
import { createClient } from "@/lib/supabase/client";
import {
  ExclamationCircleOutlined,
  LockOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  TableColumnType,
  TableColumnsType,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import { useState } from "react";
import PurchaseItemActualPriceForm from "../../suppliers-reception/components/PurchaseItemActualPriceForm";

interface MissingSiigoCustomer {
  id: string;
  name: string | null;
  identificationType: string | null;
  identificationNumber: string | null;
}

interface PendingChangeRequest {
  id: string;
  purchase_item_id: string;
  requested_price: number;
  reason: string | null;
}

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
  siigo_invoice_id: string | null;
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
  const { message } = App.useApp();
  const { isAdmin, adminId } = useIsAdmin();
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkChecked, setBulkChecked] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResendModalOpen, setBulkResendModalOpen] = useState(false);
  const [bulkResendChecked, setBulkResendChecked] = useState(false);
  const [bulkResendRunning, setBulkResendRunning] = useState(false);
  const [invoicingOrderId, setInvoicingOrderId] = useState<string | null>(
    null,
  );
  const [changeRequestModalItem, setChangeRequestModalItem] = useState<{
    purchaseItemId: string;
    productName: string;
    currentPrice: number | null;
  } | null>(null);
  const [changeRequestForm] = Form.useForm<{
    requestedPrice: number;
    reason?: string;
  }>();

  const distributionPlanQuery = useQuery({
    queryKey: ["invoicing", "distribution-plan", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(`id, status, service_fee_percentage, auto_invoice_enabled`)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const changeRequestsQueryKey = [
    "invoicing",
    "components",
    "change-requests",
    id,
  ];
  const changeRequestsQuery = useQuery<PendingChangeRequest[]>({
    queryKey: changeRequestsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_cost_change_request")
        .select("id, purchase_item_id, requested_price, reason")
        .eq("distribution_plan_id", id)
        .eq("status", "pending");
      if (error) throw error;
      return data;
    },
  });

  const autoInvoiceMutation = useMutation({
    mutationFn: async (nextValue: boolean) => {
      const { error } = await supabase
        .from("distribution_plan")
        .update({ auto_invoice_enabled: nextValue })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["invoicing", "distribution-plan", id],
      });
      queryClient.invalidateQueries({ queryKey: ["distribution-plan", id] });
    },
    onError: () => {
      message.error("No se pudo actualizar la autofacturación");
    },
  });

  const invoiceReviewQuery = useQuery<InvoiceReview[]>({
    queryKey: ["invoicing", "components", "invoice-review", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_review")
        .select(
          `id, sale_order_id, status, error_message, siigo_invoice_id, siigo_invoice_number`,
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

  const customerValidationQuery = useQuery<{
    checked: number;
    missing: MissingSiigoCustomer[];
  }>({
    queryKey: ["invoicing", "components", "validate-customers", id],
    enabled: (invoiceReviewQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const response = await fetch(
        `/api/distribution-plans/${id}/invoicing/validate-customers`,
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "No se pudo validar los clientes en Siigo.");
      }
      return body;
    },
  });

  if (
    distributionPlanQuery.isPending ||
    invoiceReviewQuery.isPending ||
    salesQuery.isPending ||
    changeRequestsQuery.isPending
  )
    return "Loading...";
  if (distributionPlanQuery.error)
    return "An error has occurred: " + distributionPlanQuery.error.message;
  if (invoiceReviewQuery.error)
    return "An error has occurred: " + invoiceReviewQuery.error.message;
  if (salesQuery.error)
    return "An error has occurred: " + salesQuery.error.message;
  if (changeRequestsQuery.error)
    return "An error has occurred: " + changeRequestsQuery.error.message;

  const autoInvoiceToggle = (
    <Space style={{ marginBottom: 16 }}>
      <Switch
        checked={distributionPlanQuery.data.auto_invoice_enabled}
        disabled={!isAdmin}
        loading={autoInvoiceMutation.isPending}
        onChange={(checked) => autoInvoiceMutation.mutate(checked)}
      />
      <Typography.Text>
        Autofacturación{" "}
        {distributionPlanQuery.data.auto_invoice_enabled
          ? "activada"
          : "desactivada"}
      </Typography.Text>
      {!isAdmin && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          (solo un administrador puede cambiarla)
        </Typography.Text>
      )}
    </Space>
  );

  if (invoiceReviewQuery.data.length === 0) {
    return (
      <>
        <div>{autoInvoiceToggle}</div>
        <Alert
          type="info"
          showIcon
          title="Este plan aún no ha llegado a la etapa de facturación"
          description='La revisión de precios se genera automáticamente cuando el plan pasa al estado "Procesando cuentas". Si activas la autofacturación, se facturarán todas las órdenes automáticamente al llegar a esa etapa si ninguna necesita correcciones.'
        />
      </>
    );
  }

  const serviceFeePercentage =
    distributionPlanQuery.data.service_fee_percentage || 0;
  const invoiceReviewByOrderId = new Map(
    invoiceReviewQuery.data.map((review) => [review.sale_order_id, review]),
  );

  // Un mismo purchase_item puede surtir varias sale_order. Si alguna de
  // esas órdenes ya fue facturada en Siigo, su costo ya quedó plasmado en
  // esa factura: editarlo ahora (aunque el plan siga abierto por otras
  // órdenes pendientes de corregir) desalinearía la factura ya emitida.
  const invoicedPurchaseItemIds = new Set<string>();
  for (const order of salesQuery.data) {
    if (invoiceReviewByOrderId.get(order.id)?.status !== "invoiced") continue;
    for (const saleItem of order.sale_items) {
      for (const fulfillment of saleItem.fulfillment) {
        invoicedPurchaseItemIds.add(fulfillment.purchase_item.id);
      }
    }
  }

  const getUnitSalePrice = (actualPrice: number | null) =>
    Number(actualPrice || 0) * (1 + serviceFeePercentage / 100);

  const isInvalidCost = (actualPrice: number | null) =>
    !(Number(actualPrice) > 0);

  // Las líneas con cantidad recibida 0 no se muestran ni se facturan (nada
  // que cobrar), así que su costo no cuenta para decidir si la orden
  // necesita corrección.
  const orderHasInvalidCost = (order: SaleOrder) =>
    order.sale_items.some((saleItem) =>
      saleItem.fulfillment.some(
        (fulfillment) =>
          Number(fulfillment.purchase_item.received_quantity) > 0 &&
          isInvalidCost(fulfillment.purchase_item.actual_price),
      ),
    );

  const ordersWithInvalidCost = salesQuery.data.filter(orderHasInvalidCost);

  const missingCustomers = customerValidationQuery.data?.missing ?? [];
  const missingCustomerIds = new Set(missingCustomers.map((c) => c.id));

  const pendingRequestsByPurchaseItemId = new Map(
    changeRequestsQuery.data.map((request) => [
      request.purchase_item_id,
      request,
    ]),
  );

  const orderHasPendingChangeRequest = (order: SaleOrder) =>
    order.sale_items.some((saleItem) =>
      saleItem.fulfillment.some((fulfillment) =>
        pendingRequestsByPurchaseItemId.has(fulfillment.purchase_item.id),
      ),
    );

  const isOrderApprovable = (order: SaleOrder) => {
    const review = invoiceReviewByOrderId.get(order.id);
    return (
      !!review &&
      (review.status === "pending_review" || review.status === "failed") &&
      !orderHasInvalidCost(order) &&
      !missingCustomerIds.has(order.customer.id) &&
      !orderHasPendingChangeRequest(order)
    );
  };
  const approvableOrders = salesQuery.data.filter(isOrderApprovable);

  const isOrderResendable = (order: SaleOrder) => {
    const review = invoiceReviewByOrderId.get(order.id);
    return (
      !!review &&
      review.status === "failed" &&
      !!review.siigo_invoice_id &&
      !orderHasInvalidCost(order) &&
      !missingCustomerIds.has(order.customer.id) &&
      !orderHasPendingChangeRequest(order)
    );
  };
  const resendableOrders = salesQuery.data.filter(isOrderResendable);

  const refreshInvoicing = () => {
    queryClient.invalidateQueries({
      queryKey: ["invoicing", "components", "invoice-review", id],
    });
  };

  const approveOrder = async (saleOrderId: string) => {
    const response = await fetch(
      `/api/distribution-plans/${id}/invoicing/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleOrderId }),
      },
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Error al facturar la orden.");
    }
    return body;
  };

  const handleManualInvoice = async (saleOrderId: string) => {
    setInvoicingOrderId(saleOrderId);
    try {
      await approveOrder(saleOrderId);
    } catch {
      // el detalle del error queda reflejado en invoice_review.error_message
    } finally {
      refreshInvoicing();
      setInvoicingOrderId(null);
    }
  };

  const resendStamp = async (saleOrderId: string) => {
    const response = await fetch(
      `/api/distribution-plans/${id}/invoicing/resend-stamp`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleOrderId }),
      },
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "Error al reenviar la factura a la DIAN.");
    }
    return body;
  };

  const handleResendStamp = async (saleOrderId: string) => {
    setInvoicingOrderId(saleOrderId);
    try {
      await resendStamp(saleOrderId);
    } catch {
      // el detalle del error queda reflejado en invoice_review.error_message
    } finally {
      refreshInvoicing();
      setInvoicingOrderId(null);
    }
  };

  const openChangeRequestModal = (item: {
    purchaseItemId: string;
    productName: string;
    actualPrice: number | null;
  }) => {
    setChangeRequestModalItem({
      purchaseItemId: item.purchaseItemId,
      productName: item.productName,
      currentPrice: item.actualPrice,
    });
    changeRequestForm.resetFields();
  };

  const submitChangeRequest = async (values: {
    requestedPrice: number;
    reason?: string;
  }) => {
    if (!changeRequestModalItem || !adminId) return;
    const { error } = await supabase.from("invoice_cost_change_request").insert({
      distribution_plan_id: id,
      purchase_item_id: changeRequestModalItem.purchaseItemId,
      current_price: changeRequestModalItem.currentPrice,
      requested_price: values.requestedPrice,
      reason: values.reason || null,
      requested_by: adminId,
    });
    if (error) {
      message.error("No se pudo crear la solicitud de cambio");
      return;
    }
    message.success("Solicitud de cambio creada");
    setChangeRequestModalItem(null);
    queryClient.invalidateQueries({ queryKey: changeRequestsQueryKey });
  };

  const handleApproveChangeRequest = async (request: PendingChangeRequest) => {
    if (!adminId) return;
    const { error: priceError } = await supabase
      .from("purchase_item")
      .update({ actual_price: request.requested_price })
      .eq("id", request.purchase_item_id);
    if (priceError) {
      message.error("No se pudo aplicar el nuevo costo");
      return;
    }
    const { error: reviewError } = await supabase
      .from("invoice_cost_change_request")
      .update({
        status: "approved",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    if (reviewError) {
      message.error("El costo se actualizó, pero no se pudo cerrar la solicitud");
    }
    queryClient.invalidateQueries({ queryKey: changeRequestsQueryKey });
    queryClient.invalidateQueries({ queryKey: salesQueryKey });
    queryClient.invalidateQueries({
      queryKey: [
        "suppliers-reception",
        "components",
        "purchase-item-actual-price-form",
        { purchaseItemId: request.purchase_item_id },
      ],
    });
  };

  const handleRejectChangeRequest = async (request: PendingChangeRequest) => {
    if (!adminId) return;
    const { error } = await supabase
      .from("invoice_cost_change_request")
      .update({
        status: "rejected",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id);
    if (error) {
      message.error("No se pudo rechazar la solicitud");
      return;
    }
    queryClient.invalidateQueries({ queryKey: changeRequestsQueryKey });
  };

  const handleBulkApprove = async () => {
    setBulkRunning(true);
    for (const order of approvableOrders) {
      try {
        await approveOrder(order.id);
      } catch {
        // el detalle del error queda reflejado en invoice_review.error_message
      }
      refreshInvoicing();
    }
    setBulkRunning(false);
    setBulkModalOpen(false);
    setBulkChecked(false);
    message.info(
      "Proceso de facturación finalizado. Revisa el estado de cada orden.",
    );
  };

  const handleBulkResendStamp = async () => {
    setBulkResendRunning(true);
    for (const order of resendableOrders) {
      try {
        await resendStamp(order.id);
      } catch {
        // el detalle del error queda reflejado en invoice_review.error_message
      }
      refreshInvoicing();
    }
    setBulkResendRunning(false);
    setBulkResendModalOpen(false);
    setBulkResendChecked(false);
    message.info(
      "Reenvío a la DIAN finalizado. Revisa el estado de cada orden.",
    );
  };

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

  const getTextFilterProps = (
    getValue: (record: SaleOrder) => string,
    placeholder: string,
  ): Pick<
    TableColumnType<SaleOrder>,
    "filterDropdown" | "filterIcon" | "onFilter"
  > => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          placeholder={placeholder}
          value={selectedKeys[0] as string}
          onChange={(e) =>
            setSelectedKeys(e.target.value ? [e.target.value] : [])
          }
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block", width: 200 }}
        />
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => confirm()}
            style={{ width: 90 }}
          >
            Buscar
          </Button>
          <Button
            size="small"
            onClick={() => {
              clearFilters?.();
              confirm();
            }}
            style={{ width: 90 }}
          >
            Limpiar
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => (
      <SearchOutlined
        style={{ color: filtered ? token.colorPrimary : undefined }}
      />
    ),
    onFilter: (value, record) =>
      getValue(record).toLowerCase().includes(String(value).toLowerCase()),
  });

  const columns: TableColumnsType<SaleOrder> = [
    {
      title: "# Orden de venta",
      dataIndex: "order_code",
      key: "order_code",
      ...getTextFilterProps(
        (record) => record.order_code || "",
        "Buscar # orden",
      ),
    },
    {
      title: "Cliente",
      dataIndex: ["customer", "name"],
      key: "customer_name",
      ...getTextFilterProps(
        (record) => record.customer?.name || "",
        "Buscar cliente",
      ),
    },
    {
      title: "Identificación",
      key: "identification",
      ...getTextFilterProps(
        (record) =>
          record.customer?.identification_number &&
          record.customer?.identification_type
            ? `${record.customer.identification_type} ${record.customer.identification_number}`
            : "",
        "Buscar identificación",
      ),
      render: (_, record) =>
        record.customer?.identification_number &&
        record.customer?.identification_type
          ? `${record.customer.identification_type} ${record.customer.identification_number}`
          : "-",
    },
    {
      title: "Estado de facturación",
      key: "invoice_status",
      filters: [
        { text: "Pendiente revisión", value: "pending_review" },
        { text: "Aprobada", value: "approved" },
        { text: "Facturando", value: "invoicing" },
        { text: "Facturada", value: "invoiced" },
        { text: "Error", value: "failed" },
        { text: "Costo inválido", value: "invalid_cost" },
        { text: "Cliente no existe en Siigo", value: "missing_customer" },
        { text: "Cambio pendiente de aprobación", value: "pending_change" },
      ],
      onFilter: (value, record) => {
        if (value === "invalid_cost") return orderHasInvalidCost(record);
        if (value === "missing_customer")
          return missingCustomerIds.has(record.customer.id);
        if (value === "pending_change")
          return orderHasPendingChangeRequest(record);
        return invoiceReviewByOrderId.get(record.id)?.status === value;
      },
      render: (_, record) => {
        const review = invoiceReviewByOrderId.get(record.id);
        if (!review) return <Tag>Sin iniciar</Tag>;
        const meta = invoiceReviewStatusMeta[review.status];
        const isBlocked =
          orderHasInvalidCost(record) ||
          missingCustomerIds.has(record.customer.id) ||
          orderHasPendingChangeRequest(record);
        const canResendStamp =
          isAdmin &&
          !isBlocked &&
          review.status === "failed" &&
          !!review.siigo_invoice_id;
        const canManuallyInvoice =
          isAdmin &&
          !isBlocked &&
          !canResendStamp &&
          (review.status === "pending_review" ||
            review.status === "approved" ||
            review.status === "failed");
        return (
          <Space orientation="vertical" size={0}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {/* Estas alertas avisan de algo que corregir ANTES de facturar.
                Una vez la orden ya está invoiced, la factura real es la
                fuente de verdad — seguir mostrándolas (p.ej. porque la
                identificación guardada localmente no coincide con la que
                terminó usándose en Siigo, como al vincular una factura
                creada manualmente) es ruido, no una alerta accionable. */}
            {review.status !== "invoiced" && orderHasInvalidCost(record) && (
              <Tag color="error" icon={<ExclamationCircleOutlined />}>
                Costo inválido
              </Tag>
            )}
            {review.status !== "invoiced" &&
              missingCustomerIds.has(record.customer.id) && (
                <Tag color="error" icon={<ExclamationCircleOutlined />}>
                  Cliente no existe en Siigo
                </Tag>
              )}
            {review.status !== "invoiced" && orderHasPendingChangeRequest(record) && (
              <Tag color="gold" icon={<ExclamationCircleOutlined />}>
                Cambio pendiente de aprobación
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
            {canResendStamp && (
              <Button
                size="small"
                loading={invoicingOrderId === record.id}
                onClick={() => handleResendStamp(record.id)}
                style={{ marginTop: 4 }}
              >
                Reenviar a DIAN
              </Button>
            )}
            {canManuallyInvoice && (
              <Button
                size="small"
                loading={invoicingOrderId === record.id}
                onClick={() => handleManualInvoice(record.id)}
                style={{ marginTop: 4 }}
              >
                {review.status === "failed" ? "Reintentar" : "Facturar"}
              </Button>
            )}
          </Space>
        );
      },
    },
    {
      title: "Total",
      key: "total",
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => {
        const [min, max] = String(selectedKeys[0] || "-").split("-");
        const setRange = (nextMin: string, nextMax: string) =>
          setSelectedKeys(
            nextMin || nextMax ? [`${nextMin}-${nextMax}`] : [],
          );
        return (
          <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
            <Space orientation="vertical">
              <InputNumber
                placeholder="Mínimo"
                style={{ width: 160 }}
                min={0}
                value={min ? Number(min) : undefined}
                onChange={(v) => setRange(v != null ? String(v) : "", max)}
                onPressEnter={() => confirm()}
              />
              <InputNumber
                placeholder="Máximo"
                style={{ width: 160 }}
                min={0}
                value={max ? Number(max) : undefined}
                onChange={(v) => setRange(min, v != null ? String(v) : "")}
                onPressEnter={() => confirm()}
              />
              <Space>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => confirm()}
                  style={{ width: 90 }}
                >
                  Filtrar
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    clearFilters?.();
                    confirm();
                  }}
                  style={{ width: 90 }}
                >
                  Limpiar
                </Button>
              </Space>
            </Space>
          </div>
        );
      },
      filterIcon: (filtered) => (
        <SearchOutlined
          style={{ color: filtered ? token.colorPrimary : undefined }}
        />
      ),
      onFilter: (value, record) => {
        const [min, max] = String(value).split("-");
        const total = getOrderTotal(record);
        if (min && total < Number(min)) return false;
        if (max && total > Number(max)) return false;
        return true;
      },
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
      {missingCustomers.length > 0 && (
        <Alert
          type="error"
          showIcon
          title="Hay clientes que no existen en Siigo"
          description={
            <Space orientation="vertical" size={4}>
              <span>
                Debes crearlos manualmente en Siigo antes de poder facturar
                sus órdenes:{" "}
                {missingCustomers
                  .map(
                    (c) =>
                      `${c.name} (${c.identificationType} ${c.identificationNumber})`,
                  )
                  .join(", ")}
                .
              </span>
              <Button
                size="small"
                loading={customerValidationQuery.isFetching}
                onClick={() => customerValidationQuery.refetch()}
              >
                Revalidar clientes en Siigo
              </Button>
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Space
        style={{
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {autoInvoiceToggle}
        <Space>
          <Button
            disabled={resendableOrders.length === 0}
            onClick={() => setBulkResendModalOpen(true)}
          >
            Reenviar a la DIAN todas las órdenes con error ({resendableOrders.length})
          </Button>
          <Button
            type="primary"
            disabled={approvableOrders.length === 0}
            onClick={() => setBulkModalOpen(true)}
          >
            Aprobar y facturar todas las órdenes ({approvableOrders.length})
          </Button>
        </Space>
      </Space>
      <Modal
        title="Aprobar y facturar órdenes en Siigo"
        open={bulkModalOpen}
        onCancel={() => {
          if (!bulkRunning) {
            setBulkModalOpen(false);
            setBulkChecked(false);
          }
        }}
        footer={[
          <Button
            key="cancel"
            disabled={bulkRunning}
            onClick={() => {
              setBulkModalOpen(false);
              setBulkChecked(false);
            }}
          >
            Volver sin cambiar
          </Button>,
          <Button
            key="ok"
            type="primary"
            danger
            disabled={!bulkChecked}
            loading={bulkRunning}
            onClick={handleBulkApprove}
          >
            Facturar {approvableOrders.length} orden(es)
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          showIcon
          title={`Se van a crear ${approvableOrders.length} factura(s) en Siigo`}
          description="No podrás deshacer esta acción para las órdenes que se facturen correctamente."
          style={{ marginBottom: 16 }}
        />
        <Checkbox
          checked={bulkChecked}
          onChange={(e) => setBulkChecked(e.target.checked)}
        >
          Entiendo que este cambio no se puede deshacer.
        </Checkbox>
      </Modal>
      <Modal
        title="Reenviar órdenes a la DIAN"
        open={bulkResendModalOpen}
        onCancel={() => {
          if (!bulkResendRunning) {
            setBulkResendModalOpen(false);
            setBulkResendChecked(false);
          }
        }}
        footer={[
          <Button
            key="cancel"
            disabled={bulkResendRunning}
            onClick={() => {
              setBulkResendModalOpen(false);
              setBulkResendChecked(false);
            }}
          >
            Volver sin cambiar
          </Button>,
          <Button
            key="ok"
            type="primary"
            danger
            disabled={!bulkResendChecked}
            loading={bulkResendRunning}
            onClick={handleBulkResendStamp}
          >
            Reenviar {resendableOrders.length} orden(es)
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          showIcon
          title={`Se van a reenviar ${resendableOrders.length} factura(s) ya creadas en Siigo a validación de la DIAN`}
          description="Usa esto solo después de corregir el problema que causó el rechazo directamente en Siigo. No se crean facturas nuevas — se reintenta el timbrado sobre el mismo documento."
          style={{ marginBottom: 16 }}
        />
        <Checkbox
          checked={bulkResendChecked}
          onChange={(e) => setBulkResendChecked(e.target.checked)}
        >
          Entiendo que ya corregí el problema en Siigo para estas órdenes.
        </Checkbox>
      </Modal>
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
            dataSource={order.sale_items
              .flatMap((saleItem) =>
                saleItem.fulfillment.map((fulfillment) => ({
                  fulfillmentId: fulfillment.id,
                  productName: saleItem.products.name,
                  unit: saleItem.products.unit,
                  supplierName:
                    fulfillment.purchase_item.offer?.supplier?.name,
                  purchaseItemId: fulfillment.purchase_item.id,
                  referencePrice: fulfillment.purchase_item.offer?.price,
                  actualPrice: fulfillment.purchase_item.actual_price,
                  quantity: fulfillment.purchase_item.received_quantity,
                })),
              )
              // Un producto pedido pero no recibido no se factura, así que
              // tampoco tiene sentido mostrarlo en la revisión.
              .filter((row) => Number(row.quantity) > 0)}
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
                render: (_, it) => Number(it.quantity || 0),
              },
              {
                title: "Costo unitario",
                key: "actual_price",
                render: (_, it) => {
                  const isInvoicedLocked = invoicedPurchaseItemIds.has(
                    it.purchaseItemId,
                  );
                  const pendingRequest = pendingRequestsByPurchaseItemId.get(
                    it.purchaseItemId,
                  );
                  const hasError = isInvalidCost(it.actualPrice);

                  if (pendingRequest) {
                    return (
                      <Space orientation="vertical" size={4}>
                        <Typography.Text>
                          {formatPriceAccounting(it.actualPrice || 0)}
                        </Typography.Text>
                        <Tag color="gold">
                          Cambio solicitado:{" "}
                          {formatPriceAccounting(pendingRequest.requested_price)}
                        </Tag>
                        {isAdmin && (
                          <Space size={4}>
                            <Button
                              size="small"
                              type="primary"
                              onClick={() =>
                                handleApproveChangeRequest(pendingRequest)
                              }
                            >
                              Aprobar
                            </Button>
                            <Button
                              size="small"
                              danger
                              onClick={() =>
                                handleRejectChangeRequest(pendingRequest)
                              }
                            >
                              Rechazar
                            </Button>
                          </Space>
                        )}
                      </Space>
                    );
                  }

                  // Locked-por-facturada (ya se envió a Siigo) es
                  // definitivo. Locked-por-válido (sin error) es editable
                  // solo vía solicitud de cambio, para no permitir tocar
                  // costos que ya pasaron la revisión.
                  const isLockedForNoError = !isInvoicedLocked && !hasError;

                  return (
                    <Space>
                      <PurchaseItemActualPriceForm
                        purchaseItemId={it.purchaseItemId}
                        planId={id}
                        disabled={isInvoicedLocked || isLockedForNoError}
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
                      {isInvoicedLocked && (
                        <Tooltip title="Este producto ya fue incluido en una factura de Siigo (de esta u otra orden que comparte el mismo costo). No se puede editar para no desalinear esa factura.">
                          <LockOutlined style={{ color: token.colorTextDisabled }} />
                        </Tooltip>
                      )}
                      {isLockedForNoError && isAdmin && (
                        <Button
                          size="small"
                          onClick={() =>
                            openChangeRequestModal({
                              purchaseItemId: it.purchaseItemId,
                              productName: it.productName,
                              actualPrice: it.actualPrice,
                            })
                          }
                        >
                          Solicitar cambio
                        </Button>
                      )}
                      {hasError && (
                        <Tooltip title="El costo debe ser mayor a $0 para poder aprobar esta orden">
                          <ExclamationCircleOutlined
                            style={{ color: token.colorError }}
                          />
                        </Tooltip>
                      )}
                    </Space>
                  );
                },
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
      <Modal
        title={`Solicitar cambio de costo${changeRequestModalItem ? ` — ${changeRequestModalItem.productName}` : ""}`}
        open={!!changeRequestModalItem}
        onCancel={() => setChangeRequestModalItem(null)}
        onOk={() => changeRequestForm.submit()}
        okText="Enviar solicitud"
      >
        <Typography.Paragraph type="secondary">
          Costo actual:{" "}
          {formatPriceAccounting(changeRequestModalItem?.currentPrice || 0)}
        </Typography.Paragraph>
        <Form
          form={changeRequestForm}
          layout="vertical"
          onFinish={submitChangeRequest}
        >
          <Form.Item
            name="requestedPrice"
            label="Nuevo costo"
            rules={[{ required: true, message: "Ingresa el nuevo costo" }]}
          >
            <InputNumber min={0} prefix="$" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reason" label="Motivo (opcional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default InvoicingReviewTable;
