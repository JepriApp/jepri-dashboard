import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  Table,
  Typography,
  Card,
  Descriptions,
  Collapse,
  Layout,
  List,
  theme,
  Button,
  Checkbox,
  Drawer,
  InputNumber,
  Space,
  Alert,
  Progress,
  App,
  Tag,
} from "antd";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { supabase } from "@/services/supabase.client";
import type { SaleOrder, SaleItem } from "@/services/supabase.service";
import {
  getOrCreatePurchaseOrderForSupplier,
  createPurchaseItem,
  upsertFulfillment,
} from "@/services/supabase.service";
import { formatPriceAccounting } from "@/utils/formatPrice";
const { Content, Sider } = Layout;
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

function usePurchaseOrdersForPlan(distributionPlanId?: string) {
  return useQuery<any[]>({
    queryKey: ["poForPlanAssign", distributionPlanId],
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
                sale_order:sale_order_id ( id, order_code, customer:customer_id ( name ) ),
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
const AssignSuppliersPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const planId = router.query.id as string | undefined;
  const { data } = usePlanData(planId);
  const orders = data?.orders || [];
  const { data: relatedPOs = [], isLoading: posLoading } =
    usePurchaseOrdersForPlan(planId);

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
  const itemCustomerById = useMemo(() => {
    const map = new Map<string, { name: string; email?: string }>();
    orders.forEach((o) => {
      const name = o.user?.name ?? "";
      const email = o.user?.email ?? "";
      (o.items || []).forEach((it: any) => {
        if (it?.id) map.set(String(it.id), { name, email });
      });
    });
    return map;
  }, [orders]);
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
    // Prefill inputs with already assigned quantities so the UI reflects current state
    const initialInputs: Record<string, number> = {};
    assignedMap.forEach((qty, sid) => {
      initialInputs[sid] = Number(qty || 0);
    });
    setAssignmentInputs(initialInputs);
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
    // Sum only the positive delta the user intends to add beyond already assigned
    if (!assignContext) return 0;
    return (offersForCurrentProduct || []).reduce((sum: number, o: any) => {
      const current = Number(assignmentInputs[o.supplier_id] || 0);
      const already = Number(assignedQtyMap.get(o.supplier_id) || 0);
      const delta = current - already;
      return sum + (delta > 0 ? delta : 0);
    }, 0);
  }, [
    assignContext,
    offersForCurrentProduct,
    assignmentInputs,
    assignedQtyMap,
  ]);

  const MSG_SAVE_KEY = "assign-save";
  const saveAssignmentsMutation = useMutation({
    mutationKey: ["saveAssignments", planId],
    mutationFn: async () => {
      if (!assignContext) return;
      if (!planId) throw new Error("Plan no identificado");
      const ensureValidUuid = (v: any) => typeof v === "string" && v && v !== "undefined";
      const productId = String(assignContext.productId || "");
      if (!ensureValidUuid(productId)) {
        throw new Error("Ítem sin producto válido (UUID). No se puede asignar.");
      }
      const saleItemId = String(assignContext.saleItemId || "");
      if (!ensureValidUuid(saleItemId)) {
        throw new Error("Ítem de venta inválido (UUID). No se puede asignar.");
      }

      const notes = data?.plan?.plan_code
        ? `Compra para plan ${data.plan.plan_code}`
        : `Compra para plan ${String(planId || "")}`;

      const alreadyMap = getAssignedQtyMapForItem(assignContext.saleItemId);
      const supplierIds = Array.from(
        new Set([
          ...(offersForCurrentProduct || []).map((o: any) => o.supplier_id),
          ...Array.from(alreadyMap.keys()),
        ])
      );
      const validSupplierIds = supplierIds
        .map((sid) => String(sid || ""))
        .filter((sid) => ensureValidUuid(sid));
      if (validSupplierIds.length === 0) {
        // No hay proveedores válidos a ajustar; salir temprano sin error
        return;
      }

      await Promise.all(
        validSupplierIds.map(async (supplierId) => {
          const desired = Number(assignmentInputs[supplierId] || 0);
          const already = Number(alreadyMap.get(supplierId) || 0);

          let piExisting: any | null = null;
          let po: any | null = null;
          const { data: existingFulLinks, error: findFulErr } = await supabase
            .from("fulfillment")
            .select(
              "id, quantity, purchase_item:purchase_item(id, purchase_order_id, supplier_id, product_id)"
            )
            .eq("sale_item_id", saleItemId)
            .eq("purchase_item.product_id", productId)
            .eq("purchase_item.supplier_id", String(supplierId))
            .order("id", { ascending: false })
            .limit(1);
          if (findFulErr) throw findFulErr;
          if (existingFulLinks && existingFulLinks.length > 0) {
            const link = existingFulLinks[0];
            piExisting = link.purchase_item;
            const poCandidate = String(piExisting?.purchase_order_id || "");
            po = ensureValidUuid(poCandidate) ? { id: poCandidate } : null;
          }

          if (!po) {
            const { data: existingPOs, error: findPoErr } = await supabase
              .from("purchase_order")
              .select("id, status")
              .eq("supplier_id", supplierId)
              .eq("distribution_plan_id", String(planId))
              .order("created_at", { ascending: false })
              .limit(1);
            if (findPoErr) throw findPoErr;
            if (existingPOs && existingPOs.length > 0) {
              po = existingPOs[0];
            } else {
              po = await getOrCreatePurchaseOrderForSupplier({
                supplierId,
                distributionPlanId: String(planId),
                notes,
              });
            }
          }

          if (!piExisting) {
            const { data: piExistingList, error: findPiErr } = await supabase
              .from("purchase_item")
              .select("id, quantity")
              .eq("purchase_order_id", String(po.id))
              .eq("supplier_id", String(supplierId))
              .eq("product_id", productId)
              .order("id", { ascending: false })
              .limit(1);
            if (findPiErr) throw findPiErr;
            piExisting =
              piExistingList && piExistingList.length > 0
                ? piExistingList[0]
                : null;
          }

          if (piExisting) {
            const existingFulfillmentId =
              existingFulLinks && existingFulLinks.length > 0
                ? String(existingFulLinks[0].id)
                : undefined;
            if (desired > 0) {
              if (existingFulfillmentId) {
                // Actualiza directamente el vínculo existente
                const { error: updFulErr } = await supabase
                  .from("fulfillment")
                  .update({ quantity: Number(desired) })
                  .eq("id", existingFulfillmentId);
                if (updFulErr) throw updFulErr;
              } else {
                // No existe vínculo previo, crear con el par saleItem-purchaseItem
                await upsertFulfillment({
                  saleItemId: saleItemId,
                  purchaseItemId: String(piExisting.id),
                  quantity: Number(desired),
                });
              }
            } else {
              if (existingFulfillmentId) {
                const { error: delFulErr } = await supabase
                  .from("fulfillment")
                  .delete()
                  .eq("id", existingFulfillmentId);
                if (delFulErr) throw delFulErr;
              }
            }

            // Recalcular la cantidad del purchase_item a partir de sus vínculos
            const { data: piFuls, error: piFulsErr } = await supabase
              .from("fulfillment")
              .select("quantity")
              .eq("purchase_item_id", String(piExisting.id));
            if (piFulsErr) throw piFulsErr;
            const summedQty = (piFuls || []).reduce(
              (sum: number, f: any) => sum + Number(f.quantity || 0),
              0
            );
            const { error: updPiErr } = await supabase
              .from("purchase_item")
              .update({ quantity: summedQty })
              .eq("id", String(piExisting.id));
            if (updPiErr) throw updPiErr;
          } else {
            if (desired > 0) {
              const estimatedPrice = (offers || []).find(
                (o) =>
                  String(o.product_id) === productId &&
                  String(o.supplier_id) === String(supplierId)
              )?.price;
              const pi = await createPurchaseItem({
                purchaseOrderId: String(po.id),
                productId: productId,
                supplierId: String(supplierId),
                quantity: Number(desired),
                estimatedPrice: estimatedPrice ?? null,
              });
              await upsertFulfillment({
                saleItemId: saleItemId,
                purchaseItemId: String(pi.id),
                quantity: Number(desired),
              });
            }
          }
        })
      );
    },
    onMutate: async () => {
      message.loading({
        content: "Guardando asignaciones...",
        key: MSG_SAVE_KEY,
      });
    },
    onSuccess: async () => {
      message.success({
        content: "Asignaciones guardadas y órdenes de compra actualizadas.",
        key: MSG_SAVE_KEY,
        duration: 2,
      });
      setAssignDrawerOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["assignSuppliersPlan", planId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["poForPlanAssign", planId],
      });
    },
    onError: (err) => {
      console.error("Error guardando asignaciones", err);
      message.error({
        content: "Error al guardar asignaciones.",
        key: MSG_SAVE_KEY,
      });
    },
  });

  const handleSaveAssignments = () => {
    if (!assignContext) {
      message.warning("Selecciona un ítem para guardar asignaciones.");
      return;
    }
    saveAssignmentsMutation.mutate();
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
                    {posLoading ? (
                      <Typography.Text type="secondary">
                        Cargando órdenes de compra…
                      </Typography.Text>
                    ) : relatedPOs.length === 0 ? (
                      <Typography.Text type="secondary">
                        No hay órdenes de compra para este plan
                      </Typography.Text>
                    ) : (
                      <Table
                        dataSource={relatedPOs}
                        rowKey={(r) => r.id}
                        pagination={false}
                        size="small"
                        columns={
                          [
                            {
                              title: "Proveedor",
                              dataIndex: ["supplier", "name"],
                              key: "supplier_name",
                            },
                            {
                              title: "Código de órden de compra",
                              dataIndex: "purchase_code",
                              key: "purchase_code",
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
                                      Number(
                                        it.actual_price ??
                                          it.estimated_price ??
                                          0
                                      ),
                                  0
                                );
                                return formatPriceAccounting(total);
                              },
                            },
                            {
                              title: "Vínculos",
                              key: "po_links",
                              render: (_: unknown, record: any) => {
                                const items = Array.isArray(
                                  record.purchase_item
                                )
                                  ? record.purchase_item
                                  : [];
                                const links = items.flatMap((it: any) =>
                                  Array.isArray(it.fulfillment)
                                    ? it.fulfillment.map((f: any) => ({
                                        f,
                                        it,
                                      }))
                                    : []
                                );
                                if (links.length === 0)
                                  return (
                                    <Typography.Text type="secondary">
                                      —
                                    </Typography.Text>
                                  );
                                return (
                                  <Space wrap size={4}>
                                    {links.map(({ f }: any) => {
                                      const qty = Number(f?.quantity || 0);
                                      const unit =
                                        f?.sale_item?.product?.unit ?? "";
                                      const productName =
                                        f?.sale_item?.product?.name ?? "";
                                      const customerName =
                                        f?.sale_item?.sale_order?.customer
                                          ?.name ?? "";
                                      const label = [
                                        productName,
                                        `${qty} ${unit}`,
                                        customerName,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ");
                                      return <Tag>{label}</Tag>;
                                    })}
                                  </Space>
                                );
                              },
                            },
                          ] as any
                        }
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
                                        Number(
                                          it.actual_price ??
                                            it.estimated_price ??
                                            0
                                        )
                                      ),
                                  },
                                  {
                                    title: "Vínculos",
                                    key: "pi_links",
                                    render: (_: unknown, it: any) => {
                                      const links = Array.isArray(
                                        it.fulfillment
                                      )
                                        ? it.fulfillment
                                        : [];
                                      if (links.length === 0)
                                        return (
                                          <Typography.Text type="secondary">
                                            —
                                          </Typography.Text>
                                        );
                                      return (
                                        <Space wrap size={4}>
                                          {links.map((f: any) => {
                                            const soCode =
                                              f?.sale_item?.sale_order
                                                ?.order_code ?? "";
                                            const qty = Number(
                                              f?.quantity || 0
                                            );
                                            const unit =
                                              f?.sale_item?.product?.unit ?? "";
                                            const customerName =
                                              f?.sale_item?.sale_order?.customer
                                                ?.name ?? "";
                                            const label = [
                                              soCode ? ` ${soCode}` : "",
                                              `${qty} ${unit}`,
                                              customerName,
                                            ]
                                              .filter(Boolean)
                                              .join(" · ");
                                            return (
                                              <Tag color="blue">{label}</Tag>
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
                    <Descriptions
                      size="small"
                      column={1}
                      style={{ marginTop: 12 }}
                    >
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
                    title: "Cliente",
                    key: "customer",
                    render: (_: unknown, it: any) => {
                      const c = itemCustomerById.get(String(it?.id ?? ""));
                      return (
                        <Typography.Text>{c?.name || "—"}</Typography.Text>
                      );
                    },
                  },
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
                    title: "Cumplimiento",
                    key: "fulfillment_progress",
                    render: (_: unknown, it: any) => {
                      const totalQty = Number(it.quantity || 0);
                      const assigned = Array.isArray(it.fulfillment)
                        ? it.fulfillment.reduce(
                            (sum: number, f: any) =>
                              sum + Number(f?.quantity || 0),
                            0
                          )
                        : 0;
                      const percent =
                        totalQty > 0
                          ? Math.min(
                              100,
                              Math.round((assigned / totalQty) * 100)
                            )
                          : 0;
                      return (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Progress percent={percent} style={{ width: 140 }} />
                          <Typography.Text type="secondary">
                            {`${assigned} / ${totalQty} ${
                              it.product?.unit ?? ""
                            }`}
                          </Typography.Text>
                        </div>
                      );
                    },
                  },
                  {
                    title: "Proveedores",
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
                            const supplier =
                              f?.purchase_item?.purchase_order?.supplier
                                ?.name ?? "";
                            const qty = Number(f?.quantity || 0);
                            const unit = it?.product?.unit ?? "";
                            const label = [supplier, `${qty} ${unit}`]
                              .filter(Boolean)
                              .join(" · ");
                            return <Tag>{label}</Tag>;
                          })}
                        </Space>
                      );
                    },
                  },
                  {
                    title: "Accion",
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
              onClick={handleSaveAssignments}
              loading={saveAssignmentsMutation.isPending}
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
                  onClick={handleSaveAssignments}
                  loading={saveAssignmentsMutation.isPending}
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
