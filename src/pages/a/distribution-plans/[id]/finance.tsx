import DashboardLayout from "@/components/layout/DashboardLayout";
import DistributionPlanLayout from "@/components/layout/DistributionPlanLayout";
import { SaleOrder } from "@/services/supabase.service";
import { formatPriceAccounting } from "@/utils/formatPrice";
import {
  Form,
  InputNumber,
  Space,
  Table,
  Tabs,
  TabsProps,
  Tag,
  Typography,
} from "antd";
import React, { ReactElement, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  user?: {
    name: string;
    contact: string;
    phone: string;
    identification_type: string;
    identification_number: string;
  };
  subtotal?: number;
};
import { createClient as createSupabaseComponent } from "@/utils/supabase/component";

const supabase = createSupabaseComponent();
export function usePurchaseOrdersForPlan(distributionPlanId?: string) {
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
          supplier:supplier_id ( id, name, contact, phone ),
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
                unit,
                siigo_id
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

export function usePlanData(planId?: string) {
  return useQuery<{
    plan: any;
    orders: PlanOrder[];
    dpoStatusCounts: Record<string, number>;
  }>({
    queryKey: ["distributionPlan", "finances", planId],
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
            contact,
            phone,
            identification_type,
            identification_number
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
              main_photo,
              siigo_id
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
            contact: r.customer?.contact ?? "",
            phone: r.customer?.phone ?? "",
            identification_type: r.customer?.identification_type ?? "",
            identification_number: r.customer?.identification_number ?? "",
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
const SuppliersRecepction = () => {
  const router = useRouter();
  const planId = router.query.id as string | undefined;
  const { data, isLoading, refetch } = usePlanData(planId);
  const plan = data?.plan;
  const [commisionRate, setCommisionRate] = useState<number>(24);
  const [pendingDeliveryCharge, setPendingDeliveryCharge] = useState<
    Record<string, number | undefined>
  >({});
  const queryClient = useQueryClient();
  const updateDeliveryChargeMutation = useMutation<
    { rowId: string; newFee: number | null },
    any,
    { rowId: string; newFee: number | null }
  >({
    mutationFn: async ({ rowId, newFee }) => {
      const payload: any = {
        delivery_fee: newFee ?? null,
      };
      const { error } = await supabase
        .from("sale_order")
        .update(payload)
        .eq("id", rowId);
      if (error) throw error;
      return { rowId, newFee };
    },
    onSuccess: (_data, variables) => {
      setPendingDeliveryCharge((prev) => {
        const { [variables.rowId]: _, ...rest } = prev;
        return rest;
      });
      const key = ["distributionPlan", "finances", planId];
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: any) => {
      console.error("Error al actualizar cargo de domicilio:", err);
    },
  });
  const orders = useMemo(() => data?.orders || [], [data]);
  const orderColumns = [
    {
      title: "# Órden de venta",
      dataIndex: "order_code",
      key: "order_code",
    },
    {
      title: "Cliente",
      dataIndex: ["user", "name"],
      key: "user_name",
    },
    {
      title: "Contacto",
      dataIndex: ["user", "contact"],
      key: "user_contact",
    },
    {
      title: "Teléfono",
      dataIndex: ["user", "phone"],
      key: "user_phone",
    },
    {
      title: "Identificación",
      dataIndex: ["user", "identification_number"],
      key: "user_identification_number",
      render: (v: string | undefined, record: any) =>
        v && record.user?.identification_type
          ? `${record.user?.identification_type} ${v}`
          : "-",
    },
    {
      title: "Cargos",
      key: "charges",
      render: (_: unknown, record: PlanOrder) => (
        <Typography.Text style={{ whiteSpace: "nowrap" }}>
          Servicio:{" "}
          {formatPriceAccounting(
            Number((record.total || 0) - (record.delivery_charge || 0)) *
              (commisionRate / 100)
          )}
          <br />
          Domicilio:{" "}
          <InputNumber
            value={
              pendingDeliveryCharge[record.id] !== undefined
                ? pendingDeliveryCharge[record.id]
                : Number(record.delivery_charge || 0)
            }
            style={{ width: 120 }}
            min={0}
            precision={2}
            prefix="$"
            size="small"
            disabled={updateDeliveryChargeMutation.isPending}
            onChange={(val) => {
              setPendingDeliveryCharge((prev) => ({
                ...prev,
                [record.id]: typeof val === "number" ? val : undefined,
              }));
            }}
            onBlur={() => {
              const pending = pendingDeliveryCharge[record.id];
              const original = Number(record.delivery_charge || 0);
              const newVal = pending !== undefined ? pending : original;
              if (newVal === original) {
                setPendingDeliveryCharge((prev) => {
                  const { [record.id]: _, ...rest } = prev;
                  return rest;
                });
                return;
              }
              updateDeliveryChargeMutation.mutate({
                rowId: record.id,
                newFee: newVal ?? null,
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const pending = pendingDeliveryCharge[record.id];
                const original = Number(record.delivery_charge || 0);
                const newVal = pending !== undefined ? pending : original;
                if (newVal === original) {
                  setPendingDeliveryCharge((prev) => {
                    const { [record.id]: _, ...rest } = prev;
                    return rest;
                  });
                  return;
                }
                updateDeliveryChargeMutation.mutate({
                  rowId: record.id,
                  newFee: newVal ?? null,
                });
              }
            }}
          />
        </Typography.Text>
      ),
    },
    {
      title: "Total",
      dataIndex: "total",
      key: "total",
      render: (t: number | undefined) =>
        formatPriceAccounting(Number(t ?? 0) * (1 + commisionRate / 100)),
    },
  ];
  const clientsResume = (
    <Space direction="vertical">
      <Form.Item label="Comisión por venta">
        <InputNumber
          value={commisionRate}
          onChange={(val) => setCommisionRate(val ?? 0)}
          style={{ width: 120 }}
          min={0}
          max={100}
          precision={1}
          prefix="%"
        />
      </Form.Item>
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
                    title: "Siigo ID",
                    dataIndex: ["product", "siigo_id"],
                    key: "siigo_id",
                  },
                  {
                    title: "Producto/Unidad",
                    dataIndex: ["product", "name"],
                    key: "product_name",
                    render: (_: unknown, it: any) => (
                      <>
                        {it?.product?.name}{" "}
                        <Tag>
                          {it?.offer?.product?.unit ?? it?.product?.unit ?? ""}
                        </Tag>
                      </>
                    ),
                  },
                  {
                    title: "Cantidad",
                    key: "quantity_unit",
                    render: (_: unknown, it: any) =>
                      `${Number(it.quantity || 0)}`,
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
                        Number(it.quantity || 0) * Number(it.unit_price || 0);
                      return formatPriceAccounting(subtotal);
                    },
                  },
                  {
                    title: "Comisión",
                    key: "item_commission",
                    render: (_: unknown, it: any) => {
                      const commission =
                        Number(it.quantity || 0) *
                        Number(it.unit_price || 0) *
                        (commisionRate / 100);
                      return formatPriceAccounting(commission);
                    },
                  },
                  {
                    title: "Total",
                    key: "item_total",
                    render: (_: unknown, it: any) => {
                      const commission =
                        Number(it.quantity || 0) *
                        Number(it.unit_price || 0) *
                        (commisionRate / 100);
                      const total =
                        Number(it.quantity || 0) * Number(it.unit_price || 0) +
                        commission;
                      return formatPriceAccounting(total);
                    },
                  },
                ] as any
              }
            />
          ),
        }}
      />
    </Space>
  );
  const poColumns = [
    {
      title: "# Órden de compra",
      dataIndex: "purchase_code",
      key: "purchase_code",
    },
    {
      title: "Proveedor",
      dataIndex: ["supplier", "name"],
      key: "supplier_name",
    },
    {
      title: "Contacto",
      dataIndex: ["supplier", "contact"],
      key: "supplier_contact",
    },
    {
      title: "Teléfono",
      dataIndex: ["supplier", "phone"],
      key: "supplier_phone",
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
  const { data: relatedPOs = [], isLoading: posLoading } =
    usePurchaseOrdersForPlan(planId);
  const suppliersResume = (
    <Table
      dataSource={relatedPOs}
      columns={poColumns as any}
      rowKey="id"
      style={{ overflow: "auto" }}
      expandable={{
        expandedRowRender: (po) => (
          <Table
            dataSource={po.purchase_item || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={
              [
                {
                  title: "Siigo ID",
                  dataIndex: ["offer", "product", "siigo_id"],
                  key: "siigo_id",
                },
                {
                  title: "Producto/Unidad",
                  key: "product_name",
                  render: (_: unknown, it: any) => (
                    <>
                      {it?.offer?.product?.name}{" "}
                      <Tag>
                        {it?.offer?.product?.unit ?? it?.product?.unit ?? ""}
                      </Tag>
                    </>
                  ),
                },
                {
                  title: "Cantidad",
                  key: "quantity_unit",
                  render: (_: unknown, it: any) => Number(it.quantity || 0),
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
              ] as any
            }
          />
        ),
      }}
    />
  );
  const items: TabsProps["items"] = [
    {
      key: "1",
      label: "Clientes",
      children: clientsResume,
    },
    {
      key: "2",
      label: "Proveedores",
      children: suppliersResume,
    },
  ];
  return <Tabs defaultActiveKey="1" items={items} />;
};

export default SuppliersRecepction;

SuppliersRecepction.getLayout = function getLayout(page: ReactElement) {
  return (
    <DashboardLayout noStyle>
      <DistributionPlanLayout> {page}</DistributionPlanLayout>
    </DashboardLayout>
  );
};
