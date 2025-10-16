import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  Table,
  Typography,
  Card,
  Descriptions,
  Collapse,
  Row,
  Col,
  Layout,
  List,
  theme,
  Button,
  Checkbox,
  Drawer,
  InputNumber,
  Space,
  Alert,
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

  const { data: offers = [], isLoading: offersLoading } =
    useOffersForProducts(productIds);

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

  const [assignDrawerOpen, setAssignDrawerOpen] = useState(false);
  const [assignContext, setAssignContext] = useState<{
    saleItemId: string;
    productId: string;
    productName: string;
    saleItemQty: number;
    productUnit: string;
  } | null>(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(
    new Set()
  );
  const [assignmentInputs, setAssignmentInputs] = useState<
    Record<string, number>
  >({});

  const getAssignedQtyMapForItem = (saleItemId: string) => {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      (o.items || []).forEach((it: any) => {
        if (String(it.id) !== String(saleItemId)) return;
        const links = Array.isArray(it.fulfillment) ? it.fulfillment : [];
        links.forEach((f: any) => {
          const supplierId = f?.purchase_item?.purchase_order?.supplier?.id;
          const qty = Number(f?.quantity || 0);
          if (!supplierId) return;
          map.set(supplierId, (map.get(supplierId) || 0) + qty);
        });
      });
    });
    return map;
  };

  const getTotalAssignedQtyForItem = (saleItemId: string) => {
    let total = 0;
    orders.forEach((o) => {
      (o.items || []).forEach((it: any) => {
        if (String(it.id) !== String(saleItemId)) return;
        const links = Array.isArray(it.fulfillment) ? it.fulfillment : [];
        links.forEach((f: any) => {
          total += Number(f?.quantity || 0);
        });
      });
    });
    return total;
  };

  const openAssignDrawer = (item: any) => {
    const ctx = {
      saleItemId: String(item.id),
      productId: String(item.product_id),
      productName: String(item.product?.name || "Producto"),
      saleItemQty: Number(item.quantity || 0),
      productUnit: String(item.product?.unit || ""),
    };
    setAssignContext(ctx);
    const assignedMap = getAssignedQtyMapForItem(ctx.saleItemId);
    const preselected = Array.from(assignedMap.entries())
      .filter(([, qty]) => Number(qty) > 0)
      .map(([sid]) => sid);
    setSelectedSupplierIds(new Set(preselected));
    setAssignmentInputs({});
    setAssignDrawerOpen(true);
  };

  const toggleSupplierSelection = (sid: string, checked: boolean) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(sid);
      else next.delete(sid);
      return next;
    });
  };

  const offersForCurrentProduct = useMemo(
    () =>
      assignContext
        ? (offers || []).filter(
            (o: any) => String(o.product_id) === String(assignContext.productId)
          )
        : [],
    [assignContext, offers]
  );

  const assignedQtyMap = useMemo(
    () =>
      assignContext
        ? getAssignedQtyMapForItem(assignContext.saleItemId)
        : new Map<string, number>(),
    [assignContext, orders]
  );

  const remainingQty = useMemo(() => {
    if (!assignContext) return 0;
    const already = getTotalAssignedQtyForItem(assignContext.saleItemId);
    return Math.max(
      0,
      Number(assignContext.saleItemQty || 0) - Number(already || 0)
    );
  }, [assignContext]);

  const plannedAssignSum = useMemo(() => {
    if (!assignContext) return 0;
    return (offersForCurrentProduct || []).reduce((sum: number, o: any) => {
      const v = Number(assignmentInputs[o.supplier_id] || 0);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [assignContext, offersForCurrentProduct, assignmentInputs]);

  const handleSaveAssignments = () => {
    // TODO: Integrar persistencia en Supabase según el modelo (purchase_item / fulfillment)
    // Por ahora, sólo cerramos el Drawer.
    setAssignDrawerOpen(false);
  };
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
          padding: 4,
        }}
      >
        <Content>
          <Collapse
            defaultActiveKey={["resumenProveedores"]}
            items={[
              {
                key: "resumenProveedores",
                label: "Resumen proveedores",
                children: (
                  <>
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
                  </>
                ),
              },
            ]}
          />
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
                      `${Number(it.quantity || 0)} ${it.product?.unit ?? ""}`,
                  },
                  {
                    title: "Asignar proveedores",
                    key: "assign_suppliers",
                    render: (_: unknown, it: any) => (
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => openAssignDrawer(it)}
                      >
                        Asignar
                      </Button>
                    ),
                  },
                ] as any
              }
            />
          </Card>
        </Content>
      </Layout>
      <Drawer
        placement="right"
        width={440}
        title={
          assignContext
            ? `Asignar proveedores — ${assignContext.productName}`
            : "Asignar proveedores"
        }
        open={assignDrawerOpen}
        onClose={() => setAssignDrawerOpen(false)}
        styles={{ body: { padding: 0 } }}
        extra={
          <Space>
            <Button onClick={() => setAssignDrawerOpen(false)}>Cancelar</Button>
            <Button
              type="primary"
              disabled={plannedAssignSum <= 0}
              onClick={handleSaveAssignments}
            >
              Guardar
            </Button>
          </Space>
        }
      >
        {!assignContext ? (
          <Typography.Text type="secondary">
            Selecciona un ítem del pedido para asignar proveedores.
          </Typography.Text>
        ) : offersLoading ? (
          <Typography.Text type="secondary">
            Cargando proveedores...
          </Typography.Text>
        ) : offersForCurrentProduct.length === 0 ? (
          <Typography.Text type="secondary">
            No hay proveedores disponibles para este producto.
          </Typography.Text>
        ) : (
          <>
            {plannedAssignSum > remainingQty && (
              <Alert
                message="Advertencia: la cantidad por asignar excede la disponible del ítem."
                type="warning"
                banner
              />
            )}
            <div style={{ padding: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <Typography.Text>
                  Cantidad requerida:{" "}
                  <strong>
                    {remainingQty} {assignContext?.productUnit || ""}
                  </strong>
                </Typography.Text>
                <br />
                <Typography.Text type="secondary">
                  Por asignar: {Math.max(0, remainingQty - plannedAssignSum)} —
                  Restante: {plannedAssignSum}
                </Typography.Text>
              </div>
              <List
                dataSource={offersForCurrentProduct as any}
                rowKey={(o: any) => o.id}
                renderItem={(o: any) => {
                  const assignedQty = assignedQtyMap.get(o.supplier_id) || 0;
                  const checked = selectedSupplierIds.has(o.supplier_id);
                  const value = Number(assignmentInputs[o.supplier_id] || 0);
                  return (
                    <List.Item>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          width: "100%",
                        }}
                      >
                        <Checkbox
                          checked={checked || value > 0}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            toggleSupplierSelection(o.supplier_id, isChecked);
                            if (!isChecked) {
                              // Si se desmarca, resetea la cantidad a 0
                              setAssignmentInputs((prev) => ({
                                ...prev,
                                [o.supplier_id]: 0,
                              }));
                            }
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <Typography.Text strong>
                            {o.supplier_name}
                          </Typography.Text>
                          <div>
                            <Typography.Text type="secondary">
                              Precio estimado:{" "}
                              {formatPriceAccounting(Number(o.price || 0))}
                            </Typography.Text>
                          </div>
                          <div>
                            <Typography.Text type="secondary">
                              Ya asignado: {Number(assignedQty || 0)}
                            </Typography.Text>
                          </div>
                        </div>
                        <InputNumber
                          min={0}
                          value={value}
                          onChange={(val) => {
                            const num = Number(val || 0);
                            setAssignmentInputs((prev) => ({
                              ...prev,
                              [o.supplier_id]: isNaN(num) ? 0 : num,
                            }));
                            if (num > 0) {
                              setSelectedSupplierIds((prev) =>
                                new Set(prev).add(o.supplier_id)
                              );
                            }
                          }}
                          size="small"
                          style={{ width: 100, marginTop: 4 }}
                        />
                      </div>
                    </List.Item>
                  );
                }}
              />
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <Button onClick={() => setAssignDrawerOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="primary"
                  disabled={plannedAssignSum <= 0}
                  onClick={handleSaveAssignments}
                >
                  Guardar
                </Button>
              </div>
            </div>
          </>
        )}
      </Drawer>
    </Layout>
  );
};

export default AssignSuppliersPage;

AssignSuppliersPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout noStyle>{page}</DashboardLayout>;
};
