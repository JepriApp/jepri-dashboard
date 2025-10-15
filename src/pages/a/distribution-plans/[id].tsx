import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import { Table, Tag, Button, Space, Select, InputNumber, message, Typography, Divider, Card, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter } from "next/router";
import { supabase } from "@/services/supabase.client";
import type { SaleOrder, SaleItem } from "@/services/supabase.service";

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
  "id" | "order_date" | "delivery_date" | "status" | "notes" | "items"
> & {
  user?: { name: string; email: string };
};

function usePlanData(planId?: string) {
  return useQuery<{ plan: any; orders: PlanOrder[] }>({
    queryKey: ["distributionPlan", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data: plan, error: planErr } = await supabase
        .from("distribution_plan")
        .select("id, plan_date, status, notes")
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
              )
            )
          )
        `,
        )
        .eq("distribution_plan_id", planId)
        .order("sequence", { ascending: true });
      if (dpoErr) throw dpoErr;

      const orders: PlanOrder[] = (rows || []).map((r: any) => ({
        id: r.sale_order?.id,
        order_date: r.sale_order?.order_date,
        delivery_date: r.sale_order?.delivery_date,
        status: r.sale_order?.status,
        total: undefined,
        service_fee: 0,
        delivery_charge: 0,
        notes: r.sale_order?.notes,
        user: {
          name: r.sale_order?.customer?.name ?? "",
          email: r.sale_order?.customer?.app_user?.email ?? "",
        },
        items: r.sale_order?.sale_item ?? [],
      }));

      return { plan, orders };
    },
  });
}

const PlanEditorPage = () => {
  const router = useRouter();
  const planId = router.query.id as string | undefined;
  const { data, isLoading, refetch } = usePlanData(planId);
  const plan = data?.plan;
  const orders = data?.orders || [];

  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>(
    {},
  );
  // Precargar ofertas de todos los productos involucrados
  type OfferWithProductId = OfferOption & { product_id: string };
  const itemsFlat = useMemo(() => {
    const all: SaleItem[] = [];
    orders.forEach((o) => (o.items || []).forEach((si) => all.push(si)));
    return all;
  }, [orders]);
  const productIds = useMemo(
    () => Array.from(new Set(itemsFlat.map((i) => i.product_id))).filter(Boolean),
    [itemsFlat],
  );
  const { data: offersList = [], isLoading: offersLoading } = useQuery<OfferWithProductId[]>({
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

  // Eliminado: carga manual de ofertas. Ahora están precargadas con React Query.

  function upsertAssignment(
    saleItemId: string,
    idx: number,
    next: Partial<Assignment>,
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

  function autoAssignLowestPrice(
    saleItemId: string,
    productId: string,
    quantity: number,
  ) {
    const offers = offersByProduct[productId] || [];
    if (!offers.length) return;
    const best = offers.reduce((a, b) => (a.price <= b.price ? a : b));
    setAssignments((prev) => ({
      ...prev,
      [saleItemId]: [
        {
          supplier_id: best.supplier_id,
          supplier_name: best.supplier_name,
          price: best.price,
          quantity,
        },
      ],
    }));
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
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <Typography.Title level={4}>
          Plan {planId} — {plan ? dayjs(plan.plan_date).format("YYYY-MM-DD") : ""}
        </Typography.Title>
        <Tag color="blue">{plan?.status}</Tag>
        <Button type="primary" onClick={handleGeneratePurchaseOrders} disabled={itemsFlat.length === 0}>
          Generar órdenes de compra
        </Button>
        <Button onClick={() => refetch()}>Refrescar</Button>
      </Space>

      {isLoading ? (
        <Skeleton active />
      ) : (
        <Table
          dataSource={orders}
          columns={orderColumns as any}
          rowKey="id"
          expandable={{
            expandedRowRender: (order: SaleOrder) => (
              <div>
                {(order.items || []).map((item) => (
                  <Card key={item.id} size="small" style={{ marginBottom: 12 }}>
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <Space>
                        <Typography.Text strong>
                          {item.product?.name}
                        </Typography.Text>
                        <Tag>{item.product?.unit}</Tag>
                        <Typography.Text>Qty: {item.quantity}</Typography.Text>
                      </Space>
                      <Space>
                        <Button
                          type="dashed"
                          onClick={() =>
                            autoAssignLowestPrice(
                              item.id,
                              item.product_id,
                              item.quantity,
                            )
                          }
                          disabled={
                            offersLoading ||
                            !offersByProduct[item.product_id] ||
                            offersByProduct[item.product_id]?.length === 0
                          }
                        >
                          Asignar menor precio
                        </Button>
                        <Button onClick={() => addAssignmentRow(item.id)}>
                          Agregar proveedor
                        </Button>
                      </Space>
                      {(assignments[item.id] || []).map((row, idx) => (
                        <Space key={idx} wrap style={{ width: "100%" }}>
                          <Select
                            style={{ minWidth: 240 }}
                            placeholder="Selecciona proveedor"
                            value={row.supplier_id || undefined}
                            options={(offersByProduct[item.product_id] || []).map(
                              (o) => ({
                                label: `${o.supplier_name} — $${o.price.toFixed(
                                  2,
                                )}`,
                                value: o.supplier_id,
                              }),
                            )}
                            onChange={(val) => {
                              const opt = (offersByProduct[item.product_id] || []).find(
                                (o) => o.supplier_id === val,
                              );
                              if (opt) {
                                upsertAssignment(item.id, idx, {
                                  supplier_id: opt.supplier_id,
                                  supplier_name: opt.supplier_name,
                                  price: opt.price,
                                });
                              } else {
                                upsertAssignment(item.id, idx, {
                                  supplier_id: val,
                                });
                              }
                            }}
                          />
                          <InputNumber
                            min={0}
                            max={item.quantity}
                            value={row.quantity}
                            onChange={(val) =>
                              upsertAssignment(item.id, idx, {
                                quantity: Number(val),
                              })
                            }
                            placeholder="Cantidad"
                          />
                          <Button danger onClick={() => removeAssignmentRow(item.id, idx)}>
                            Quitar
                          </Button>
                        </Space>
                      ))}
                    </Space>
                  </Card>
                ))}
              </div>
            ),
          }}
        />
      )}
    </>
  );
};

export default PlanEditorPage;

PlanEditorPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};