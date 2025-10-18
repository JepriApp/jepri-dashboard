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
import { useAuthStore } from "@/store/auth.store";
import { CheckCircleFilled } from "@ant-design/icons";
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
        const saleItems = rawItems.map((it: any) => ({
          ...it,
          quantity: Number(it.required_quantity || 0),
          unit_price: Number(it?.product?.reference_price ?? 0),
        }));
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
          purchase_code,
          supplier:supplier_id ( id, name ),
          purchase_item:purchase_item (
            id,
            quantity,
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
                sale_order:sale_order_id ( id, order_code, customer:customer_id ( name ) )
              )
            )
          )
        `
        )
        .eq("distribution_plan_id", distributionPlanId)
        .order("purchase_seq", { ascending: true });
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
          const qty = Number(f?.purchase_item?.quantity || 0);
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
          total += Number(f?.purchase_item?.quantity || 0);
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
      const { user } = useAuthStore.getState();
      if (!assignContext) return;
      if (!planId) throw new Error("Plan no identificado");
      if (!user?.id)
        throw new Error(
          "Usuario no autenticado: no se puede crear/actualizar órdenes de compra"
        );

      const saleItemId = assignContext.saleItemId;

      // Helper: localizar PI/PO existentes para este sale item y proveedor
      const findExistingForSupplier = (supplierId: string) => {
        let found: {
          purchaseItemId?: string;
          purchaseOrderId?: string;
          fulfillmentId?: string;
        } = {};
        orders.forEach((o) => {
          (o.items || []).forEach((it: any) => {
            if (String(it.id) !== String(saleItemId)) return;
            const links = Array.isArray(it.fulfillment) ? it.fulfillment : [];
            links.forEach((f: any) => {
              const supId = f?.purchase_item?.purchase_order?.supplier?.id;
              if (String(supId) === String(supplierId)) {
                found = {
                  purchaseItemId: f?.purchase_item?.id,
                  purchaseOrderId: f?.purchase_item?.purchase_order?.id,
                  fulfillmentId: f?.id,
                };
              }
            });
          });
        });
        return found;
      };

      // Iterar las ofertas del producto actual y aplicar cambios donde difiera de lo ya asignado
      for (const offer of offersForCurrentProduct) {
        const supplierId = offer.supplier_id;
        const desiredQty = Number(assignmentInputs[supplierId] || 0);
        const alreadyQty = Number(assignedQtyMap.get(supplierId) || 0);

        // Saltar si no hay cambios
        if (desiredQty === alreadyQty) continue;

        const {
          purchaseItemId: existingPI,
          purchaseOrderId: existingPO,
          fulfillmentId,
        } = findExistingForSupplier(supplierId);

        if (desiredQty <= 0) {
          // Eliminar asignación: borrar fulfillment, purchase_item y quizá la PO si queda vacía
          if (existingPI) {
            // Borrar el fulfillment específico (por id si está disponible)
            if (fulfillmentId) {
              const { error: delFulErr } = await supabase
                .from("fulfillment")
                .delete()
                .eq("id", fulfillmentId);
              if (delFulErr) throw delFulErr;
            } else {
              const { error: delFulErr } = await supabase
                .from("fulfillment")
                .delete()
                .eq("sale_item_id", saleItemId)
                .eq("purchase_item_id", existingPI);
              if (delFulErr) throw delFulErr;
            }

            // Eliminar el purchase_item (si ya no tiene más vínculos)
            const { data: refs, error: refErr } = await supabase
              .from("fulfillment")
              .select("id")
              .eq("purchase_item_id", existingPI)
              .limit(1);
            if (refErr) throw refErr;
            if (!refs || refs.length === 0) {
              const { error: delPIErr } = await supabase
                .from("purchase_item")
                .delete()
                .eq("id", existingPI);
              if (delPIErr) throw delPIErr;
            }

            if (existingPO) {
              const { data: remaining, error: remErr } = await supabase
                .from("purchase_item")
                .select("id")
                .eq("purchase_order_id", existingPO)
                .limit(1);
              if (remErr) throw remErr;
              if (!remaining || remaining.length === 0) {
                const { error: delPOErr } = await supabase
                  .from("purchase_order")
                  .delete()
                  .eq("id", existingPO);
                if (delPOErr) throw delPOErr;
              }
            }
          }
          continue;
        }

        // Asegurar purchase order para el proveedor en el plan
        let po = existingPO ? { id: existingPO } : null;
        if (!po) {
          po = (await getOrCreatePurchaseOrderForSupplier({
            supplierId,
            distributionPlanId: String(planId),
            notes: null,
            createdBy: user?.id ?? null,
          })) as any;
        }

        // Asegurar/actualizar purchase item para la oferta
        let piId = existingPI;
        if (piId) {
          const { error: updErr } = await supabase
            .from("purchase_item")
            .update({
              quantity: desiredQty,
              actual_price: offer.price ?? null,
            })
            .eq("id", piId);
          if (updErr) throw updErr;
        } else {
          const { data: createdPI, error: createPIErr } = await supabase
            .from("purchase_item")
            .insert({
              purchase_order_id: po!.id,
              offer_id: offer.id,
              quantity: desiredQty,
              actual_price: offer.price ?? null,
            })
            .select("id")
            .single();
          if (createPIErr) throw createPIErr;
          piId = createdPI?.id;
        }

        // Asegurar fulfillment entre sale item y purchase item
        if (piId) {
          await upsertFulfillment({
            saleItemId,
            purchaseItemId: piId,
          });
        }
      }
    },
    onMutate: async () => {
      message.loading({
        content: "Guardando asignaciones...",
        key: MSG_SAVE_KEY,
      });

      //como datos iniciales se que oferta se escogió, que cantidad y el sale item al que se va asignar
      //cuando la cantidad es mayor que 0 entonces
      //consulta si existe una purchase_order para este supplier en este plan, y guarda el id. si no existe, crealo
      //consulta si existe un purchse_item para ese purchase_order que acabas de consultar, y para la oferta que se escogió.
      //si no existe, crealo con la cantidad deseada y un fullfilment que lo enlace a el sale_item actual.
      //si si existe, actualiza la cantidad y verifica que el fullfilment exista, si no existe crealo.
      //cuando la cantidad es 0, entonces
      //consulta si existe una purchase_order para este supplier en este plan,
      //si existe, consulta si existe un purchase_item para ese purchase_order que acabas de consultar, y para la oferta que se escogió.
      //si existe elimina ese purchase item y su fullfilment asociado.
      //luego consulta si ese purchase_order tiene mas purchase_item asociados, si no tiene mas eliminalo.
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
  interface DataType {
    id: string;
    purchase_code: string;
    supplier: {
      id: string;
      name: string;
    };
    purchase_item: {
      id: string;
      offer: {
        id: string;
        price: number;
        product: {
          id: string;
          name: string;
          unit: string;
        };
      };
      quantity: number;
      fulfillment: [
        {
          id: string;
          sale_item: {
            id: string;
            sale_order: {
              id: string;
              customer: {
                name: string;
              };
              order_code: string;
            };
          };
        }
      ];
    }[];
  }
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
          dataSource={orders as any}
          rowKey={(o) =>
            o.id ? String(o.id) : o.order_code || String(Math.random())
          }
          renderItem={(o: {
            id: string;
            order_code: string;
            order_date: string;
            delivery_date: string;
            status: "pending";
            total: number;
            subtotal: number;
            service_fee: number;
            delivery_charge: number;
            notes: null;
            user: {
              name: string;
              email: string;
            };
            items: [
              {
                id: string;
                product: {
                  id: string;
                  name: string;
                  unit: string;
                  main_photo: string;
                  description: string;
                  reference_price: number;
                };
                product_id: string;
                fulfillment: [
                  {
                    id: string;
                    purchase_item: {
                      id: string;
                      offer: {
                        id: string;
                        price: number;
                        product: {
                          id: string;
                          name: string;
                          unit: string;
                        };
                        supplier: {
                          id: string;
                          name: string;
                        };
                      };
                      quantity: number;
                      actual_price: number;
                      purchase_order: {
                        id: string;
                        supplier: {
                          id: string;
                          name: string;
                        };
                        purchase_code: string;
                      };
                    };
                  },
                  {
                    id: string;
                    purchase_item: {
                      id: string;
                      offer: {
                        id: string;
                        price: number;
                        product: {
                          id: string;
                          name: string;
                          unit: string;
                        };
                        supplier: {
                          id: string;
                          name: string;
                        };
                      };
                      quantity: number;
                      actual_price: number;
                      purchase_order: {
                        id: string;
                        supplier: {
                          id: string;
                          name: string;
                        };
                        purchase_code: string;
                      };
                    };
                  }
                ];
                required_quantity: number;
                delivered_quantity: number;
                quantity: number;
                unit_price: number;
              }
            ];
          }) => {
            const isSelected = o.id === selectedOrderId;
            const isSaleOrderCompletelyAsignned = (() => {
              const sale_items = Array.isArray(o.items) ? o.items : [];
              return sale_items.every((sale_item) => {
                const requiredQty = Number(sale_item.quantity || 0);
                if (requiredQty <= 0) return true;
                const fulfillments = Array.isArray(sale_item.fulfillment)
                  ? sale_item.fulfillment
                  : [];
                if (fulfillments.length === 0) return false;
                const hasAnyPO = fulfillments.some(
                  (f) => !!f?.purchase_item?.purchase_order?.id
                );
                if (!hasAnyPO) return false;
                const assignedSum = fulfillments.reduce(
                  (sum: number, f) =>
                    sum + Number(f?.purchase_item?.quantity || 0),
                  0
                );
                return assignedSum >= requiredQty;
              });
            })();
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography.Text strong>
                      {o.order_code || "Sin código"}
                    </Typography.Text>
                    {isSaleOrderCompletelyAsignned && (
                      <CheckCircleFilled
                        style={{ fontSize: "16px", color: token.colorSuccess }}
                      />
                    )}
                  </div>
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
                              render: (_: string, record: DataType) => (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    width: "100%",
                                  }}
                                >
                                  <Typography.Text strong>
                                    {record.supplier.name || "—"}
                                  </Typography.Text>
                                  <Typography.Text type="secondary" ellipsis>
                                    {record.purchase_code || "Sin código"}
                                  </Typography.Text>
                                </div>
                              ),
                            },
                            {
                              title: "Vínculos",
                              key: "po_links",
                              render: (_: unknown, record: any) => {
                                const items = record.purchase_item || [];
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
                                    {items.map(
                                      (i: {
                                        id: string;
                                        offer: {
                                          id: string;
                                          price: number;
                                          product: {
                                            id: string;
                                            name: string;
                                            unit: string;
                                          };
                                        };
                                        quantity: number;
                                        fulfillment: [
                                          {
                                            id: string;
                                            sale_item: {
                                              id: string;
                                              sale_order: {
                                                id: string;
                                                customer: {
                                                  name: string;
                                                };
                                                order_code: string;
                                              };
                                            };
                                          }
                                        ];
                                      }) => {
                                        const qty = Number(i.quantity || 0);
                                        const unit = i.offer.product.unit ?? "";
                                        const productName =
                                          i.offer.product.name ?? "";
                                        const unitPrice = Number(
                                          i.offer.price ?? 0
                                        );
                                        const customerName =
                                          i.fulfillment?.[0]?.sale_item
                                            ?.sale_order?.customer?.name ?? "";
                                        const label = [
                                          productName,
                                          `${qty} ${unit}`,
                                          `${formatPriceAccounting(
                                            unitPrice
                                          )} c/u`,
                                          customerName,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ");
                                        const labels = [
                                          productName,
                                          `${qty} ${unit}`,
                                          `${formatPriceAccounting(
                                            unitPrice
                                          )} c/u`,
                                          customerName,
                                        ];
                                        return (
                                          <Tag id={i.fulfillment?.[0]?.id}>
                                            <Space wrap split="·">
                                              {labels.map((e) => (
                                                <Typography.Text>
                                                  {e}
                                                </Typography.Text>
                                              ))}
                                            </Space>
                                          </Tag>
                                        );
                                      }
                                    )}
                                  </Space>
                                );
                              },
                            },
                          ] as any
                        }
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
                              sum + Number(f?.purchase_item?.quantity || 0),
                            0
                          )
                        : 0;
                      const percent =
                        totalQty > 0
                          ? Math.round((assigned / totalQty) * 100)
                          : 0;
                      const overAssigned = percent > 100;
                      const displayPercent = Math.min(percent, 100);
                      return (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Progress
                            percent={displayPercent}
                            strokeColor={
                              overAssigned ? token.colorWarning : undefined
                            }
                            style={{ width: 140 }}
                          />
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
                            const qty = Number(f?.purchase_item?.quantity || 0);
                            const unit = it?.product?.unit ?? "";
                            const offerPrice = Number(
                              f?.purchase_item?.offer?.price || 0
                            );
                            const label = [
                              supplier,
                              `${qty} ${unit}`,
                              `$${offerPrice} c/u`,
                            ];
                            return (
                              <Tag id={f?.id}>
                                <Space wrap split="·">
                                  {label.map((e) => (
                                    <Typography.Text>{e}</Typography.Text>
                                  ))}
                                </Space>
                              </Tag>
                            );
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
