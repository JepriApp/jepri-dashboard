import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  Table,
  Typography,
  Card,
  Descriptions,
  Row,
  Col,
  Layout,
  List,
  theme,
  Button,
  Checkbox,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { supabase } from "@/services/supabase.client";
import type { SaleOrder, SaleItem } from "@/services/supabase.service";
import { formatPriceAccounting } from "@/utils/formatPrice";
const { Header, Content, Footer, Sider } = Layout;
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

type OfferOption = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  price: number;
  product_id: string;
};

function usePlanData(planId?: string) {
  return useQuery<{
    plan: any;
    orders: PlanOrder[];
  }>({
    queryKey: ["assignSuppliersPlan", planId],
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

      return { plan, orders };
    },
  });
}

function useOffersForProducts(productIds: string[]) {
  return useQuery<OfferOption[]>({
    queryKey: ["offersForProductsAssign", productIds],
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
}
const AssignSuppliersPage = () => {
  const router = useRouter();
  const planId = router.query.id as string | undefined;
  const { data, isLoading } = usePlanData(planId);
  const orders = data?.orders || [];

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

  const assignedBySupplier: Array<{
    name: string;
    totalQty: number;
    orders: string[];
    totalCost: number;
  }> = useMemo(() => {
    const map = new Map<
      string,
      { totalQty: number; orders: Set<string>; totalCost: number }
    >();
    orders.forEach((o) => {
      (o.items || []).forEach((it: any) => {
        const links = Array.isArray(it.fulfillment) ? it.fulfillment : [];
        links.forEach((f: any) => {
          const supplierName =
            f?.purchase_item?.purchase_order?.supplier?.name ?? "";
          const poCode = f?.purchase_item?.purchase_order?.purchase_code ?? "";
          const qty = Number(f?.quantity || 0);
          const unitPrice = Number(it?.unit_price || 0);
          if (!supplierName) return;
          if (!map.has(supplierName))
            map.set(supplierName, {
              totalQty: 0,
              orders: new Set<string>(),
              totalCost: 0,
            });
          const acc = map.get(supplierName)!;
          acc.totalQty += qty;
          if (poCode) acc.orders.add(poCode);
          acc.totalCost += qty * unitPrice;
        });
      });
    });
    return Array.from(map.entries()).map(([name, v]) => ({
      name,
      totalQty: v.totalQty,
      orders: Array.from(v.orders),
      totalCost: v.totalCost,
    }));
  }, [orders]);

  const [selectedOrderId, setSelectedOrderId] = useState<
    string | number | undefined
  >();
  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId),
    [orders, selectedOrderId]
  );
  const itemsToShow = useMemo(
    () => (selectedOrderId ? selectedOrder?.items || [] : itemsFlat),
    [selectedOrderId, selectedOrder, itemsFlat]
  );
  const { token } = theme.useToken();
  return (
    <Layout hasSider>
      <Sider
        collapsible
        theme="light"
        style={{
          overflow: "initial",
          height: "100vh",
          position: "sticky",
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          scrollbarWidth: "thin",
          scrollbarGutter: "stable",
          marginLeft: 1,
          padding: 0,
        }}
      >
        <div style={{ padding: 4 }}>
          <Typography.Title level={4}>Pedidos</Typography.Title>
        </div>
        <List
          dataSource={orders}
          rowKey={(o) =>
            o.id ? String(o.id) : o.order_code || String(Math.random())
          }
          renderItem={(o) => {
            const isSelected = o.id === selectedOrderId;
            return (
              <List.Item
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  background: isSelected ? token.colorFillTertiary : undefined,
                  borderLeft: `3px solid ${
                    isSelected ? token.colorPrimary : "transparent"
                  }`,
                }}
                onClick={() =>
                  setSelectedOrderId((prev) =>
                    prev === o.id ? undefined : o.id
                  )
                }
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                  }}
                >
                  <Typography.Text strong>
                    {o.order_code || "Sin código"}
                  </Typography.Text>
                  <Typography.Text type="secondary" ellipsis>
                    {o.user?.name || "—"}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    Items: {o.items?.length ?? 0}
                  </Typography.Text>
                </div>
              </List.Item>
            );
          }}
        />
      </Sider>
      <Layout
        style={{
          overflow: "auto",
          height: "100vh",
          position: "sticky",
          padding: 4
        }}
      >
        <Content>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={16}>
              <Card
                title="Ítems del pedido"
                size="small"
                extra={
                  <Typography.Text type="secondary">
                    {selectedOrder
                      ? `Orden ${selectedOrder.order_code} — ${
                          selectedOrder.user?.name ?? "—"
                        } (${selectedOrder.items?.length ?? 0} ítems)`
                      : "Mostrando todos"}
                  </Typography.Text>
                }
              >
                <Table
                  dataSource={itemsToShow}
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
                    ] as any
                  }
                />
              </Card>
            </Col>

            <Col xs={24} md={8}>
              <Card title="Resumen proveedores" size="small">
                {assignedBySupplier.length === 0 ? (
                  <Typography.Text type="secondary">
                    No hay vínculos registrados
                  </Typography.Text>
                ) : (
                  <Table
                    dataSource={assignedBySupplier}
                    rowKey={(r) => r.name}
                    pagination={false}
                    size="small"
                    columns={
                      [
                        {
                          title: "Proveedor",
                          dataIndex: "name",
                          key: "name",
                        },
                        {
                          title: "Asignado",
                          dataIndex: "totalQty",
                          key: "totalQty",
                        },
                        {
                          title: "Costo (estim.)",
                          key: "totalCost",
                          render: (_: unknown, r: any) =>
                            formatPriceAccounting(Number(r.totalCost || 0)),
                        },
                        {
                          title: "POs",
                          key: "orders",
                          render: (_: unknown, r: any) =>
                            (r.orders || []).join(", "),
                        },
                      ] as any
                    }
                  />
                )}
                <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
                  <Descriptions.Item label="Productos únicos">
                    {uniqueProductsCount}
                  </Descriptions.Item>
                  <Descriptions.Item label="Estimado ventas">
                    {formatPriceAccounting(Number(totalSalesEstimate || 0))}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AssignSuppliersPage;

AssignSuppliersPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout noStyle>{page}</DashboardLayout>;
};
