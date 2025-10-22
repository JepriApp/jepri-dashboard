import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Select,
  InputNumber,
  message,
  Typography,
  Divider,
  Card,
  Skeleton,
  Descriptions,
  Statistic,
  Tooltip,
  theme,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter } from "next/router";
import { supabase } from "@/services/supabase.client";
import type { SaleOrder, SaleItem } from "@/services/supabase.service";
import { getPendingOrdersForAdmin } from "@/services/supabase.service";
import { formatPriceAccounting } from "@/utils/formatPrice";
import { useAuthStore } from "@/store/auth.store";
import DistributionPlanLayout from "@/components/layout/DistributionPlanLayout";
import { ArrowDownOutlined, PlusOutlined } from "@ant-design/icons";

type OfferOption = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  price: number;
};

type Assignment = {
  supplier_id: string;
  supplier_name: string;
  price: number;
  quantity: number;
};

// Orden simplificada para el editor del plan (evita requerir customer_id, etc.)
type PlanOrder = Pick<
  SaleOrder,
  | "id"
  | "order_date"
  | "delivery_date"
  | "status"
  | "notes"
  | "items"
  | "total"
  | "service_fee"
  | "delivery_charge"
  | "order_code"
> & {
  user?: { name: string; email: string };
  subtotal?: number;
};

function usePlanData(planId?: string) {
  return useQuery<{
    plan: any;
    orders: PlanOrder[];
    dpoStatusCounts: Record<string, number>;
  }>({
    queryKey: ["distributionPlan", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data: plan, error: planErr } = await supabase
        .from("distribution_plan")
        .select(
          "id, plan_date, status, notes, plan_code, cutoff_at, created_at, updated_at, operator:operator_id ( id, name )"
        )
        .eq("id", planId)
        .single();
      if (planErr) throw planErr;

      const { data: rows, error: soErr } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          created_at,
          status,
          notes,
          order_code,
          service_fee,
          delivery_fee,
          customer:customer_id (
            name,
            auth:user_id ( email )
          ),
          sale_item:sale_item (
            id,
            product_id,
            required_quantity,
            delivered_quantity,
            product:product_id (
              id,
              name,
              unit,
              description,
              reference_price,
              main_photo
            ),
            fulfillment:fulfillment (
              id,
              purchase_item:purchase_item_id (
                id,
                quantity,
                actual_price,
                purchase_order:purchase_order_id (
                  id,
                  purchase_code,
                  supplier:supplier_id ( id, name )
                ),
                offer:offer_id (
                  id,
                  price,
                  product:product_id ( id, name, unit ),
                  supplier:supplier_id ( id, name )
                )
              )
            )
          )
        `
        )
        .eq("distribution_plan_id", planId)
        .order("created_at", { ascending: true });
      if (soErr) throw soErr;

      const orders: PlanOrder[] = (rows || []).map((r: any) => {
        const rawItems = r.sale_item ?? [];
        const saleItems = rawItems.map((it: any) => {
          const assigned_quantity = (
            Array.isArray(it.fulfillment) ? it.fulfillment : []
          ).reduce(
            (sum: number, f: any) =>
              sum + Number(f?.purchase_item?.quantity ?? 0),
            0
          );
          return {
            ...it,
            quantity: Number(it.required_quantity || 0),
            unit_price: Number(it?.product?.reference_price ?? 0),
            assigned_quantity,
          };
        });
        const service_fee = r?.service_fee ?? 0;
        const delivery_charge = r?.delivery_fee ?? 0;
        const subtotal = saleItems.reduce(
          (acc: number, it: any) =>
            acc + Number(it.quantity) * Number(it.unit_price || 0),
          0
        );
        const total = subtotal + service_fee + delivery_charge;
        return {
          id: r.id,
          order_code: r.order_code,
          order_date: r.created_at,
          delivery_date: plan?.plan_date,
          status: r.status,
          total,
          subtotal,
          service_fee,
          delivery_charge,
          notes: r.notes,
          user: {
            name: r.customer?.name ?? "",
            email: r.customer?.auth?.email ?? "",
          },
          items: saleItems,
        } as PlanOrder;
      });

      const dpoStatusCounts: Record<string, number> = {};
      (rows || []).forEach((r: any) => {
        const s = r.status || "unknown";
        dpoStatusCounts[s] = (dpoStatusCounts[s] || 0) + 1;
      });

      return { plan, orders, dpoStatusCounts };
    },
  });
}

function usePurchaseOrdersForPlan(distributionPlanId?: string) {
  return useQuery<any[]>({
    queryKey: ["poForPlan", distributionPlanId],
    enabled: !!distributionPlanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order")
        .select(
          `
          id,
          status,
          created_at,
          purchase_code,
          supplier:supplier_id ( id, name ),
          purchase_item:purchase_item (
            id,
            quantity,
            actual_price,
            offer:offer_id (
              id,
              price,
              product:product_id (
                id,
                name,
                unit
              )
            ),
            fulfillment:fulfillment (
              id,
              sale_item:sale_item_id (
                id,
                required_quantity,
                sale_order:sale_order_id ( id, order_code, customer:customer_id ( id, name ) ),
                product:product_id ( id, name, unit )
              )
            )
          )
        `
        )
        .eq("distribution_plan_id", distributionPlanId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

const PlanEditorPage = () => {
  const router = useRouter();
  const planId = router.query.id as string | undefined;
  const { data, isLoading, refetch } = usePlanData(planId);
  const plan = data?.plan;
  const orders = useMemo(() => data?.orders || [], [data]);
  const dpoStatusCounts = data?.dpoStatusCounts || {};

  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);

  // Estado del modal para editar status del plan
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>(
    plan?.status ?? "planned"
  );
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Estado de resaltado de vínculos (por id de orden de venta)
  const [highlightSaleOrderId, setHighlightSaleOrderId] = useState<
    string | null
  >(null);
  // Estado de resaltado de vínculos (por id de fulfillment)
  const [highlightFulfillmentId, setHighlightFulfillmentId] = useState<
    string | null
  >(null);
  // Tokens de tema para estilos de Tag (consistentes con assign-suppliers)
  const { token } = theme.useToken();
  const PLAN_STATUSES = [
    { label: "Planificado", value: "planned" },
    { label: "Preparando", value: "preparing" },
    { label: "En progreso", value: "in_progress" },
    { label: "Completado", value: "completed" },
    { label: "Cancelado", value: "cancelled" },
  ];

  const openStatusModal = () => {
    setNextStatus(plan?.status ?? "planned");
    setStatusModalOpen(true);
  };

  const handleUpdatePlanStatus = async () => {
    if (!planId) {
      message.error("Plan no identificado");
      return;
    }
    try {
      setIsUpdatingStatus(true);
      const { error } = await supabase
        .from("distribution_plan")
        .update({ status: nextStatus })
        .eq("id", String(planId));
      if (error) throw error;
      message.success("Estado del plan actualizado");
      setStatusModalOpen(false);
      await refetch();
    } catch (e) {
      console.error(e);
      message.error("No se pudo actualizar el estado");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>(
    {}
  );
  // Precargar catálogos de todos los productos involucrados
  type OfferWithProductId = OfferOption & { product_id: string };
  const itemsFlat = useMemo(() => {
    const all: SaleItem[] = [];
    orders.forEach((o) => (o.items || []).forEach((si) => all.push(si)));
    return all;
  }, [orders]);
  const productIds = useMemo(
    () =>
      Array.from(new Set(itemsFlat.map((i) => i.product_id))).filter(Boolean),
    [itemsFlat]
  );
  const totalItemsQuantity = useMemo(
    () => itemsFlat.reduce((sum, i) => sum + Number(i.quantity || 0), 0),
    [itemsFlat]
  );
  const uniqueProductsCount = useMemo(
    () =>
      Array.from(new Set(itemsFlat.map((i) => i.product_id))).filter(Boolean)
        .length,
    [itemsFlat]
  );
  const totalSalesEstimate = useMemo(
    () =>
      itemsFlat.reduce(
        (sum, i) => sum + Number(i.quantity || 0) * Number(i.unit_price || 0),
        0
      ),
    [itemsFlat]
  );
  const { data: offersList = [], isLoading: offersLoading } = useQuery<
    OfferWithProductId[]
  >({
    queryKey: ["offersForProducts", productIds],
    enabled: productIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer")
        .select(`id, price, product_id, supplier:supplier_id ( id, name )`)
        .in("product_id", productIds);
      if (error) throw error;
      return (data || []).map((o: any) => ({
        id: o.id,
        product_id: o.product_id,
        supplier_id: o.supplier?.id,
        supplier_name: o.supplier?.name,
        price: o.price,
      }));
    },
  });
  const offersByProduct: Record<string, OfferOption[]> = useMemo(() => {
    const map: Record<string, OfferOption[]> = {};
    (offersList || []).forEach((o) => {
      if (!map[o.product_id]) map[o.product_id] = [];
      map[o.product_id].push({
        id: o.id,
        supplier_id: o.supplier_id,
        supplier_name: o.supplier_name,
        price: o.price,
      });
    });
    return map;
  }, [offersList]);

  const { data: relatedPOs = [], isLoading: posLoading } =
    usePurchaseOrdersForPlan(planId);

  const statusNow = plan?.status as string | undefined;
  const showPurchaseSection =
    !!statusNow &&
    ["preparing", "in_progress", "completed"].includes(statusNow);
  const showDeliverySummary =
    !!statusNow && ["in_progress", "completed"].includes(statusNow);
  const allowAssignments = statusNow === "preparing";

  // Eliminado: carga manual de catálogos. Ahora están precargadas con React Query.

  function upsertAssignment(
    saleItemId: string,
    idx: number,
    next: Partial<Assignment>
  ) {
    setAssignments((prev) => {
      const current = prev[saleItemId] || [];
      const updated = [...current];
      updated[idx] = { ...updated[idx], ...next } as Assignment;
      return { ...prev, [saleItemId]: updated };
    });
  }

  function addAssignmentRow(saleItemId: string) {
    setAssignments((prev) => {
      const current = prev[saleItemId] || [];
      return {
        ...prev,
        [saleItemId]: [
          ...current,
          { supplier_id: "", supplier_name: "", price: 0, quantity: 0 },
        ],
      };
    });
  }

  const orderColumns = [
    {
      title: "Cliente",
      dataIndex: ["user", "name"],
      key: "user_name",
      render: (name: string | undefined, record: PlanOrder) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography.Text>{name || "—"}</Typography.Text>
          <Typography.Text type="secondary" ellipsis>
            {record.order_code || "Sin código"}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Email",
      dataIndex: ["user", "email"],
      key: "user_email",
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: SaleOrder["status"]) => <Tag>{status}</Tag>,
    },
    {
      title: "Subtotal",
      dataIndex: "subtotal",
      key: "subtotal",
      render: (t: number | undefined) => formatPriceAccounting(Number(t ?? 0)),
    },
    {
      title: "Cargos",
      key: "charges",
      render: (_: unknown, record: PlanOrder) => (
        <Typography.Text style={{ whiteSpace: "nowrap" }}>
          Servicio: {formatPriceAccounting(Number(record.service_fee || 0))}
          <br />
          Domicilio:{" "}
          {formatPriceAccounting(Number(record.delivery_charge || 0))}
        </Typography.Text>
      ),
    },
    {
      title: "Total",
      dataIndex: "total",
      key: "total",
      render: (t: number | undefined) => formatPriceAccounting(Number(t ?? 0)),
    },
    {
      title: "Items",
      key: "items_count",
      render: (_: unknown, record: PlanOrder) => record.items?.length ?? 0,
    },
  ];

  const poColumns = [
    {
      title: "Proveedor",
      dataIndex: ["supplier", "name"],
      key: "supplier_name",
      render: (name: string | undefined, record: any) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography.Text>{name || "—"}</Typography.Text>
          <Typography.Text type="secondary" ellipsis>
            {record.purchase_code || "Sin código"}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <Tag>{status}</Tag>,
    },
    {
      title: "Total",
      key: "po_total",
      render: (_: unknown, record: any) => {
        const items = record.purchase_item || [];
        const total = items.reduce(
          (sum: number, it: any) =>
            sum +
            Number(it.quantity || 0) *
              Number(it.actual_price ?? it.offer?.price ?? 0),
          0
        );
        return formatPriceAccounting(total);
      },
    },
    {
      title: "Items",
      key: "po_items_count",
      render: (_: unknown, record: any) => record.purchase_item?.length ?? 0,
    },
  ];

  return (
    <>
      <Descriptions
        bordered
        column={{ xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }}
        style={{ marginBottom: "16px" }}
      >
        <Descriptions.Item label="Código">
          {plan?.plan_code ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Fecha del plan">
          {plan ? dayjs(plan.plan_date).format("YYYY-MM-DD") : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Estado">
          <Tag color="blue">{plan?.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Coordinador">
          {plan?.operator?.name ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Corte">
          {plan?.cutoff_at
            ? dayjs(plan.cutoff_at).format("YYYY-MM-DD HH:mm")
            : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Notas">
          {plan?.notes ?? "-"}
        </Descriptions.Item>
      </Descriptions>

      <Space
        style={{
          marginBottom: 16,
          display: "flex",
          flexDirection: "row-reverse",
        }}
      >
        <Button onClick={openStatusModal}>Editar estado del plan</Button>
      </Space>
      <Space size="large" wrap>
        <Card variant="outlined">
          <Statistic title="Órdenes en plan" value={orders.length} />
        </Card>
        <Card variant="outlined">
          <Statistic title="Productos únicos" value={uniqueProductsCount} />
        </Card>
        <Card variant="outlined">
          <Statistic
            title="Estimado ventas"
            value={totalSalesEstimate}
            formatter={(val) => formatPriceAccounting(Number(val))}
          />
        </Card>
        <Card variant="outlined">
          <Statistic
            title="Entregas pendientes"
            value={dpoStatusCounts["pending"] || 0}
          />
        </Card>
        <Card variant="outlined">
          <Statistic
            title="Entregas en ruta"
            value={dpoStatusCounts["out_for_delivery"] || 0}
          />
        </Card>
        <Card variant="outlined">
          <Statistic
            title="Entregas completadas"
            value={dpoStatusCounts["delivered"] || 0}
          />
        </Card>
      </Space>
      {isLoading ? (
        <Skeleton active />
      ) : (
        <>
          <Divider orientation="left">Pedidos</Divider>
          <Space
            style={{
              marginBottom: 16,
              display: "flex",
              flexDirection: "row-reverse",
            }}
          >
            <Button
              onClick={() =>
                router.push(`/a/sale-orders/create?planId=${planId}`)
              }
              icon={<PlusOutlined />}
            >
              Agregar pedido
            </Button>
          </Space>
          <Table
            dataSource={orders}
            style={{ overflow: "auto" }}
            columns={orderColumns as any}
            rowKey="id"
            expandable={{
              expandedRowRender: (record: PlanOrder) => (
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
                        render: (_: unknown, it: any) =>
                          it?.offer?.product?.name ?? it?.product?.name ?? "-",
                      },
                      {
                        title: "Cant./Unidad",
                        key: "quantity_unit",
                        render: (_: unknown, it: any) =>
                          `${Number(it.quantity || 0)} ${
                            it?.offer?.product?.unit ?? it?.product?.unit ?? ""
                          }`,
                      },
                      {
                        title: "Unitario",
                        dataIndex: "unit_price",
                        key: "unit_price",
                        render: (v: number) =>
                          formatPriceAccounting(Number(v || 0)),
                      },
                      {
                        title: "Subtotal",
                        key: "item_subtotal",
                        render: (_: unknown, it: any) => {
                          const subtotal =
                            Number(it.quantity || 0) *
                            Number(it.unit_price || 0);
                          return formatPriceAccounting(subtotal);
                        },
                      },
                      {
                        title: "Vínculos",
                        key: "item_links",
                        render: (_: unknown, it: any) => {
                          const links = Array.isArray(it.fulfillment)
                            ? it.fulfillment
                            : [];
                          if (links.length === 0)
                            return (
                              <Typography.Text type="secondary">
                                —
                              </Typography.Text>
                            );
                          const unit = it?.product?.unit ?? "";
                          return (
                            <Space wrap size={4}>
                              {links.map((f: any) => {
                                const supName =
                                  f?.purchase_item?.purchase_order?.supplier
                                    ?.name ?? "";
                                const poCode =
                                  f?.purchase_item?.purchase_order
                                    ?.purchase_code ?? "";
                                const qtyPi = Number(
                                  f?.purchase_item?.quantity ?? 0
                                );
                                const price = Number(
                                  f?.purchase_item?.actual_price ??
                                    f?.purchase_item?.offer?.price ??
                                    0
                                );
                                const fid = f?.id;
                                const isHighlighted =
                                  !!fid && highlightFulfillmentId === fid;
                                const segments = [
                                  supName || poCode || "",
                                  `${qtyPi} ${unit}`,
                                  price
                                    ? `${formatPriceAccounting(price)} c/u`
                                    : undefined,
                                ].filter(Boolean);
                                return (
                                  <Tag
                                    key={`fullfilmentId_from_sale_order/${fid}`}
                                    id={`fullfilmentId_from_sale_order/${fid}`}
                                    onClick={() => {
                                      if (!fid) return;
                                      setHighlightFulfillmentId((prev) =>
                                        prev === fid ? null : fid
                                      );
                                    }}
                                    style={{
                                      cursor: fid ? "pointer" : "default",
                                      borderColor: isHighlighted
                                        ? token.colorPrimary
                                        : undefined,
                                      backgroundColor: isHighlighted
                                        ? token.colorPrimaryBg
                                        : undefined,
                                    }}
                                  >
                                    <Space wrap split="·">
                                      {segments.map((e, idx) => (
                                        <Typography.Text key={idx}>
                                          {e as any}
                                        </Typography.Text>
                                      ))}
                                    </Space>
                                  </Tag>
                                );
                              })}
                            </Space>
                          );
                        },
                      },
                    ] as any
                  }
                />
              ),
            }}
          />
        </>
      )}
      {showPurchaseSection && (
        <>
          <Divider orientation="left">Órdenes de compra</Divider>

          <Space
            style={{
              marginBottom: 16,
              display: "flex",
              flexDirection: "row-reverse",
            }}
          >
            <Button
              onClick={() =>
                router.push(`/a/distribution-plans/${planId}/assign-suppliers`)
              }
              icon={<ArrowDownOutlined />}
            >
              Asignar proveedores
            </Button>
          </Space>
          {posLoading ? (
            <Skeleton active />
          ) : (
            <Table
              dataSource={relatedPOs}
              columns={poColumns as any}
              rowKey="id"
              style={{ overflow: "auto" }}
              expandable={{
                expandedRowRender: (po: any) => (
                  <Table
                    dataSource={po.purchase_item || []}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    columns={
                      [
                        {
                          title: "Producto",
                          key: "product_name",
                          render: (_: unknown, it: any) =>
                            it?.offer?.product?.name ??
                            it?.product?.name ??
                            "-",
                        },
                        {
                          title: "Cant./Unidad",
                          key: "quantity_unit",
                          render: (_: unknown, it: any) =>
                            `${Number(it.quantity || 0)} ${
                              it?.offer?.product?.unit ??
                              it?.product?.unit ??
                              ""
                            }`,
                        },
                        {
                          title: "Precio",
                          key: "price",
                          render: (_: unknown, it: any) =>
                            formatPriceAccounting(
                              Number(it.actual_price ?? it.offer?.price ?? 0)
                            ),
                        },
                        {
                          title: "Importe",
                          key: "line_total",
                          render: (_: unknown, it: any) =>
                            formatPriceAccounting(
                              Number(it.quantity || 0) *
                                Number(it.actual_price ?? it.offer?.price ?? 0)
                            ),
                        },
                        {
                          title: "Vínculos",
                          key: "pi_links",
                          render: (_: unknown, it: any) => {
                            const links = Array.isArray(it.fulfillment)
                              ? it.fulfillment
                              : [];
                            if (links.length === 0)
                              return (
                                <Typography.Text type="secondary">
                                  —
                                </Typography.Text>
                              );
                            const qtyPi = Number(it?.quantity ?? 0);
                            return (
                              <Space wrap size={4}>
                                {links.map((f: any) => {
                                  const soCode =
                                    f?.sale_item?.sale_order?.order_code ?? "";
                                  const customerName =
                                    f?.sale_item?.sale_order?.customer?.name ??
                                    "";
                                  const unit =
                                    f?.sale_item?.product?.unit ?? "";
                                  const requiredQty = Number(
                                    f?.sale_item?.required_quantity ?? 0
                                  );
                                  const fid = f?.id;
                                  const isHighlighted =
                                    !!fid && highlightFulfillmentId === fid;
                                  const labelName =
                                    customerName || soCode || "";
                                  const segments = [
                                    labelName,
                                    `${qtyPi} ${unit}`,
                                  ].filter(Boolean);
                                  return (
                                    <Tooltip
                                      key={`${it.id}-${
                                        fid || labelName
                                      }-${qtyPi}`}
                                      title={`Cumple pedido: ${qtyPi} ${unit} · Requerido: ${requiredQty} ${unit}`}
                                    >
                                      <Tag
                                        id={`fullfilmentId_from_purchase_item/${fid}`}
                                        onClick={() => {
                                          if (!fid) return;
                                          setHighlightFulfillmentId((prev) =>
                                            prev === fid ? null : fid
                                          );
                                        }}
                                        style={{
                                          cursor: fid ? "pointer" : "default",
                                          borderColor: isHighlighted
                                            ? token.colorPrimary
                                            : undefined,
                                          backgroundColor: isHighlighted
                                            ? token.colorPrimaryBg
                                            : undefined,
                                        }}
                                      >
                                        <Space wrap split="·">
                                          {segments.map((e, idx) => (
                                            <Typography.Text key={idx}>
                                              {e as any}
                                            </Typography.Text>
                                          ))}
                                        </Space>
                                      </Tag>
                                    </Tooltip>
                                  );
                                })}
                              </Space>
                            );
                          },
                        },
                      ] as any
                    }
                  />
                ),
              }}
            />
          )}
        </>
      )}
      <Modal
        open={statusModalOpen}
        title="Editar estado del plan"
        onCancel={() => setStatusModalOpen(false)}
        onOk={handleUpdatePlanStatus}
        confirmLoading={isUpdatingStatus}
      >
        <Select
          value={nextStatus}
          onChange={setNextStatus}
          options={PLAN_STATUSES}
          style={{ width: "100%" }}
        />
      </Modal>
    </>
  );
};

export default PlanEditorPage;

PlanEditorPage.getLayout = function getLayout(page: ReactElement) {
  return (
    <DashboardLayout noStyle>
      <DistributionPlanLayout> {page}</DistributionPlanLayout>
    </DashboardLayout>
  );
};
