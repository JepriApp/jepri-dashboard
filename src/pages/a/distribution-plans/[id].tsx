import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Space,
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
} from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter } from "next/router";
import { supabase } from "@/services/supabase.client";
import type { SaleOrder, SaleItem } from "@/services/supabase.service";
import { formatPriceAccounting } from "@/utils/formatPrice";

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
          "id, plan_date, status, notes, plan_code, cutoff_at, created_at, updated_at, coordinator:coordinator_id ( id, name )"
        )
        .eq("id", planId)
        .single();
      if (planErr) throw planErr;

      const { data: rows, error: dpoErr } = await supabase
        .from("distribution_plan_order")
        .select(
          `
          id, sequence, status,
          sale_order:sale_order_id (
            id,
            order_date,
            delivery_date,
            status,
            notes,
            order_code,
            service_fee,
            delivery_charge,
            customer:customer_id (
              name,
              app_user:user_id ( email )
            ),
            sale_item:sale_item (
              id,
              product_id,
              quantity,
              unit_price,
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
                quantity,
                purchase_item:purchase_item_id (
                  id,
                  quantity,
                  purchase_order:purchase_order_id (
                    id,
                    purchase_code,
                    supplier:supplier_id ( id, name )
                  )
                )
              )
            )
          )
        `
        )
        .eq("distribution_plan_id", planId)
        .order("sequence", { ascending: true });
      if (dpoErr) throw dpoErr;

      const orders: PlanOrder[] = (rows || []).map((r: any) => {
        const saleItems = r.sale_order?.sale_item ?? [];
        const service_fee = r.sale_order?.service_fee ?? 0;
        const delivery_charge = r.sale_order?.delivery_charge ?? 0;
        const subtotal = saleItems.reduce(
          (acc: number, it: any) =>
            acc + Number(it.quantity) * Number(it.unit_price || 0),
          0
        );
        const total =
          typeof r.sale_order?.total === "number"
            ? r.sale_order.total
            : subtotal + service_fee + delivery_charge;
        return {
          id: r.sale_order?.id,
          order_code: r.sale_order?.order_code,
          order_date: r.sale_order?.order_date,
          delivery_date: r.sale_order?.delivery_date,
          status: r.sale_order?.status,
          total,
          subtotal,
          service_fee,
          delivery_charge,
          notes: r.sale_order?.notes,
          user: {
            name: r.sale_order?.customer?.name ?? "",
            email: r.sale_order?.customer?.app_user?.email ?? "",
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

function usePurchaseOrdersForDate(planDate?: string) {
  return useQuery<any[]>({
    queryKey: ["poForPlanDate", planDate],
    enabled: !!planDate,
    staleTime: 60_000,
    queryFn: async () => {
      const start = dayjs(planDate).startOf("day").toISOString();
      const end = dayjs(planDate).endOf("day").toISOString();
      const { data, error } = await supabase
        .from("purchase_order")
        .select(
          `
          id,
          status,
          expected_delivery_date,
          created_at,
          purchase_code,
          supplier:supplier_id ( id, name ),
          purchase_item:purchase_item (
            id,
            product_id,
            quantity,
            estimated_price,
            actual_price,
            product:product_id (
              id,
              name,
              unit
            ),
            fulfillment:fulfillment (
              id,
              quantity,
              sale_item:sale_item_id (
                id,
                quantity,
                sale_order:sale_order_id ( id, order_code ),
                product:product_id ( id, name, unit )
              )
            )
          )
        `
        )
        .gte("expected_delivery_date", start)
        .lt("expected_delivery_date", end)
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
  const orders = data?.orders || [];
  const dpoStatusCounts = data?.dpoStatusCounts || {};

  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>(
    {}
  );
  // Precargar ofertas de todos los productos involucrados
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
        .in("product_id", productIds)
        .eq("available", true);
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
    usePurchaseOrdersForDate(plan?.plan_date);

  const statusNow = plan?.status as string | undefined;
  const showPurchaseSection =
    !!statusNow &&
    ["preparing", "in_progress", "completed"].includes(statusNow);
  const showDeliverySummary =
    !!statusNow && ["in_progress", "completed"].includes(statusNow);
  const allowAssignments = statusNow === "preparing";

  // Eliminado: carga manual de ofertas. Ahora están precargadas con React Query.

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

  function removeAssignmentRow(saleItemId: string, idx: number) {
    setAssignments((prev) => {
      const current = prev[saleItemId] || [];
      const updated = current.filter((_, i) => i !== idx);
      return { ...prev, [saleItemId]: updated };
    });
  }

  async function handleGeneratePurchaseOrders() {
    if (!plan || !plan.plan_date) {
      message.warning("El plan no está cargado");
      return;
    }
    const planDate = dayjs(plan.plan_date);
    const bySupplier = new Map<
      string,
      {
        supplier_name: string;
        items: Array<{ product_id: string; quantity: number; price: number }>;
      }
    >();
    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const rows = assignments[item.id] || [];
        rows.forEach((row) => {
          if (!row.supplier_id || row.quantity <= 0) return;
          if (!bySupplier.has(row.supplier_id)) {
            bySupplier.set(row.supplier_id, {
              supplier_name: row.supplier_name,
              items: [],
            });
          }
          bySupplier.get(row.supplier_id)!.items.push({
            product_id: item.product_id,
            quantity: row.quantity,
            price: row.price,
          });
        });
      });
    });

    if (bySupplier.size === 0) {
      message.warning("Asigne al menos un proveedor por item");
      return;
    }

    try {
      const poRows = Array.from(bySupplier.entries()).map(([supplier_id]) => ({
        supplier_id,
        order_date: dayjs().toISOString(),
        expected_delivery_date: planDate.startOf("day").toISOString(),
        total: 0,
      }));
      const { data: createdPOs, error: poErr } = await supabase
        .from("purchase_order")
        .insert(poRows)
        .select();
      if (poErr) throw poErr;
      const poBySupplier = new Map<string, string>();
      createdPOs.forEach((po: any) => poBySupplier.set(po.supplier_id, po.id));

      const piRows: any[] = [];
      bySupplier.forEach((payload, supplier_id) => {
        const purchase_order_id = poBySupplier.get(supplier_id)!;
        payload.items.forEach((it) => {
          piRows.push({
            purchase_order_id,
            product_id: it.product_id,
            supplier_id,
            quantity: it.quantity,
            estimated_price: it.price,
          });
        });
      });
      const { error: piErr } = await supabase
        .from("purchase_item")
        .insert(piRows);
      if (piErr) throw piErr;
      message.success("Órdenes de compra generadas según asignaciones");
    } catch (e: any) {
      console.error(e);
      message.error("No se pudieron generar las órdenes de compra");
    }
  }

  const orderColumns = [
    {
      title: "Código",
      dataIndex: "order_code",
      key: "order_code",
    },
    {
      title: "Fecha",
      dataIndex: "order_date",
      key: "order_date",
      render: (val: string) => dayjs(val).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "Cliente",
      dataIndex: ["user", "name"],
      key: "user_name",
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
          <br/>
          Domicilio: {formatPriceAccounting(Number(record.delivery_charge || 0))}
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
      title: "Código",
      dataIndex: "purchase_code",
      key: "purchase_code",
    },
    {
      title: "Entrega esperada",
      dataIndex: "expected_delivery_date",
      key: "expected_delivery_date",
      render: (val: string) => dayjs(val).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "Proveedor",
      dataIndex: ["supplier", "name"],
      key: "supplier_name",
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
              Number(it.actual_price ?? it.estimated_price ?? 0),
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
      <Space style={{ marginBottom: 16 }} wrap>
        <Typography.Title level={4}>
          Plan {plan?.plan_code ?? planId} —{" "}
          {plan ? dayjs(plan.plan_date).format("YYYY-MM-DD") : ""}
        </Typography.Title>
        <Tag color="blue">{plan?.status}</Tag>
        {allowAssignments && (
          <Button
            type="primary"
            onClick={handleGeneratePurchaseOrders}
            disabled={itemsFlat.length === 0}
          >
            Generar órdenes de compra
          </Button>
        )}
        <Button onClick={() => refetch()}>Refrescar</Button>
        <Button onClick={() => router.push(`/a/distribution-plans/${planId}/assign-suppliers`)}>
          Asignar proveedores
        </Button>
      </Space>

      <Card title="Reporte del plan" style={{ marginBottom: 16 }}>
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }}
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
            {plan?.coordinator?.name ?? "-"}
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
      </Card>
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
          <Table
            dataSource={orders}
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
                      },
                      {
                        title: "Cant./Unidad",
                        key: "quantity_unit",
                        render: (_: unknown, it: any) =>
                          `${Number(it.quantity || 0)} ${
                            it.product?.unit ?? ""
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
                              <Typography.Text type="secondary">—</Typography.Text>
                            );
                          return (
                            <Space wrap size={4}>
                              {links.map((f: any) => {
                                const poCode =
                                  f?.purchase_item?.purchase_order?.purchase_code ?? "";
                                const supplier =
                                  f?.purchase_item?.purchase_order?.supplier?.name ?? "";
                                const qty = Number(f?.quantity || 0);
                                const unit = it?.product?.unit ?? "";
                                const label = [
                                  poCode ? `PO ${poCode}` : "PO",
                                  supplier,
                                  `${qty} ${unit}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ");
                                return (
                                  <Tooltip
                                    key={`${it.id}-${poCode}-${qty}`}
                                    title={`Cumplimiento: ${qty} ${unit}`}
                                  >
                                    <Tag>{label}</Tag>
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
        </>
      )}

      {showPurchaseSection && (
        <>
          <Divider orientation="left">Órdenes de compra</Divider>
          {posLoading ? (
            <Skeleton active />
          ) : (
            <Table
              dataSource={relatedPOs}
              columns={poColumns as any}
              rowKey="id"
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
                          dataIndex: ["product", "name"],
                          key: "product_name",
                        },
                        {
                          title: "Cant./Unidad",
                          key: "quantity_unit",
                          render: (_: unknown, it: any) =>
                            `${Number(it.quantity || 0)} ${
                              it.product?.unit ?? ""
                            }`,
                        },
                        {
                          title: "Precio",
                          key: "price",
                          render: (_: unknown, it: any) =>
                            formatPriceAccounting(
                              Number(it.actual_price ?? it.estimated_price ?? 0)
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
                                <Typography.Text type="secondary">—</Typography.Text>
                              );
                            return (
                              <Space wrap size={4}>
                                {links.map((f: any) => {
                                  const soCode =
                                    f?.sale_item?.sale_order?.order_code ?? "";
                                  const qty = Number(f?.quantity || 0);
                                  const unit = f?.sale_item?.product?.unit ?? "";
                                  const label = [
                                    soCode ? `SO ${soCode}` : "SO",
                                    `${qty} ${unit}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ");
                                  return (
                                    <Tooltip
                                      key={`${it.id}-${soCode}-${qty}`}
                                      title={`Cumple pedido: ${qty} ${unit}`}
                                    >
                                      <Tag color="blue">{label}</Tag>
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
    </>
  );
};

export default PlanEditorPage;

PlanEditorPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};
