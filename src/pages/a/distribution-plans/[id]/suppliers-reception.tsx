import DashboardLayout from "@/components/layout/DashboardLayout";
import DistributionPlanLayout from "@/components/layout/DistributionPlanLayout";
import React, { ReactElement } from "react";
import {
  Button,
  Card,
  Space,
  Table,
  Tag,
  Typography,
  InputNumber,
  Input,
  message,
} from "antd";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/services/supabase.client";
import dayjs from "dayjs";
import { useRouter } from "next/router";
import { formatPriceAccounting } from "@/utils/formatPrice";
import { useAuthStore } from "@/store/auth.store";

const { Text, Title } = Typography;

type PurchaseItemRow = {
  id: string;
  product_name: string;
  product_unit: string;
  reference_price: number | null;
  actual_price: number | null;
  quantity: number;
  received_quantity: number | null;
  received_by: string | null; // email del usuario
  received_at: string | null; // ISO
  notes: string | null;
};

type PurchaseOrderGroup = {
  id: string;
  supplier_name: string;
  purchase_code: string | null;
  status: string | null;
  items: PurchaseItemRow[];
};

const SuppliersRecepction = () => {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [pendingActualPrice, setPendingActualPrice] = React.useState<
    Record<string, number | undefined>
  >({});
  const [savingById, setSavingById] = React.useState<Record<string, boolean>>(
    {}
  );
  const [pendingReceivedQuantity, setPendingReceivedQuantity] = React.useState<
    Record<string, number | undefined>
  >({});
  const [pendingNotes, setPendingNotes] = React.useState<
    Record<string, string | undefined>
  >({});

  const getCurrentAuthId = async (): Promise<string | null> => {
    if (user?.id) return user.id;
    if (user?.email) {
      const { data, error } = await supabase
        .from("auth")
        .select("id")
        .eq("email", user.email)
        .single();
      if (error) {
        console.error("Error obteniendo id de auth por email:", error);
        return null;
      }
      return data?.id ?? null;
    }
    return null;
  };

  const { data: groups = [], isLoading } = useQuery<PurchaseOrderGroup[]>({
    queryKey: ["distributionPlanPurchaseOrdersWithItems", id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return [];

      // Obtener órdenes de compra del plan con items y joins necesarios
      const { data, error } = await supabase
        .from("purchase_order")
        .select(
          `
          id,
          purchase_code,
          status,
          supplier:supplier_id ( id, name ),
          items:purchase_item (
            id,
            quantity,
            actual_price,
            received_quantity,
            notes,
            received_by,
            received_at,
            offer:offer_id (
              id,
              price,
              product:product_id (
                id,
                name,
                unit
              )
            ),
            receiver:received_by (
              email
            )
          )
        `
        )
        .eq("distribution_plan_id", id);

      if (error) throw error;

      const groups: PurchaseOrderGroup[] = (data || []).map((po: any) => ({
        id: po.id,
        supplier_name: po.supplier?.name ?? "—",
        purchase_code: po.purchase_code ?? null,
        status: po.status ?? null,
        items: (po.items || []).map((pi: any) => ({
          id: pi.id,
          product_name: pi.offer?.product?.name ?? "—",
          product_unit: pi.offer?.product?.unit ?? "—",
          reference_price: pi.offer?.price ?? null,
          actual_price: pi.actual_price ?? null,
          quantity: Number(pi.quantity || 0),
          received_quantity: pi.received_quantity ?? null,
          received_by: pi.receiver?.email ?? null,
          received_at: pi.received_at ?? null,
          notes: pi.notes ?? null,
        })),
      }));

      return groups;
    },
  });

  const updateActualPriceMutation = useMutation<
    { rowId: string; newPrice: number | null }, // TData
    any, // TError
    { rowId: string; newPrice: number | null }, // TVariables
    unknown // TContext
  >({
    mutationFn: async ({ rowId, newPrice }) => {
      const authId = await getCurrentAuthId();
      const payload: any = {
        actual_price: newPrice ?? null,
        received_at: new Date().toISOString(),
      };
      if (authId) payload.received_by = authId;
      const { error } = await supabase
        .from("purchase_item")
        .update(payload)
        .eq("id", rowId);
      if (error) throw error;
      return { rowId, newPrice };
    },
    onMutate: ({ rowId }) => {
      setSavingById((prev) => ({ ...prev, [rowId]: true }));
    },
    onSuccess: (_data, variables) => {
      message.success("Precio actualizado");
      setPendingActualPrice((prev) => {
        const { [variables.rowId]: _, ...rest } = prev;
        return rest;
      });
      const key = id
        ? ["distributionPlanPurchaseOrdersWithItems", id]
        : ["distributionPlanPurchaseOrdersWithItems"];
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: any) => {
      console.error("Error al actualizar precio real:", err);
      message.error("No se pudo guardar el precio real");
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.rowId) {
        setSavingById((prev) => ({ ...prev, [variables.rowId]: false }));
      }
    },
  });

  const updateReceivedQuantityMutation = useMutation<
    { rowId: string; newQuantity: number | null },
    any,
    { rowId: string; newQuantity: number | null },
    unknown
  >({
    mutationFn: async ({ rowId, newQuantity }) => {
      const authId = await getCurrentAuthId();
      const payload: any = {
        received_quantity: newQuantity ?? null,
        received_at: new Date().toISOString(),
      };
      if (authId) payload.received_by = authId;
      const { error } = await supabase
        .from("purchase_item")
        .update(payload)
        .eq("id", rowId);
      if (error) throw error;
      return { rowId, newQuantity };
    },
    onMutate: ({ rowId }) => {
      setSavingById((prev) => ({ ...prev, [rowId]: true }));
    },
    onSuccess: (_data, variables) => {
      message.success("Cantidad recibida actualizada");
      setPendingReceivedQuantity((prev) => {
        const { [variables.rowId]: _, ...rest } = prev;
        return rest;
      });
      const key = id
        ? ["distributionPlanPurchaseOrdersWithItems", id]
        : ["distributionPlanPurchaseOrdersWithItems"];
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: any) => {
      console.error("Error al actualizar cantidad recibida:", err);
      message.error("No se pudo guardar la cantidad recibida");
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.rowId) {
        setSavingById((prev) => ({ ...prev, [variables.rowId]: false }));
      }
    },
  });

  const updateNotesMutation = useMutation<
    { rowId: string; newNotes: string | null },
    any,
    { rowId: string; newNotes: string | null },
    unknown
  >({
    mutationFn: async ({ rowId, newNotes }) => {
      const authId = await getCurrentAuthId();
      const payload: any = {
        notes: newNotes ?? null,
        received_at: new Date().toISOString(),
      };
      if (authId) payload.received_by = authId;
      const { error } = await supabase
        .from("purchase_item")
        .update(payload)
        .eq("id", rowId);
      if (error) throw error;
      return { rowId, newNotes };
    },
    onMutate: ({ rowId }) => {
      setSavingById((prev) => ({ ...prev, [rowId]: true }));
    },
    onSuccess: (_data, variables) => {
      message.success("Notas actualizadas");
      setPendingNotes((prev) => {
        const { [variables.rowId]: _, ...rest } = prev;
        return rest;
      });
      const key = id
        ? ["distributionPlanPurchaseOrdersWithItems", id]
        : ["distributionPlanPurchaseOrdersWithItems"];
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: any) => {
      console.error("Error al actualizar notas:", err);
      message.error("No se pudo guardar las notas");
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.rowId) {
        setSavingById((prev) => ({ ...prev, [variables.rowId]: false }));
      }
    },
  });

  const columns = [
    {
      title: "Producto",
      dataIndex: "product_name",
      key: "product_name",
      render: (v: string | null, record: any) =>
        `${v} x ${record.product_unit}`,
    },
    {
      title: "Precio",
      children: [
        {
          title: "En la app",
          dataIndex: "reference_price",
          key: "reference_price",
          render: (v: number | null) =>
            v != null ? formatPriceAccounting(v) : "—",
        },
        {
          title: "Real",
          dataIndex: "actual_price",
          key: "actual_price",
          render: (v: number | null, row: any) => (
            <InputNumber
              value={
                pendingActualPrice[row.id] !== undefined
                  ? pendingActualPrice[row.id]
                  : v ?? undefined
              }
              min={0}
              style={{ width: 120 }}
              disabled={!!savingById[row.id]}
              onChange={(val) => {
                setPendingActualPrice((prev) => ({
                  ...prev,
                  [row.id]: typeof val === "number" ? val : undefined,
                }));
              }}
              onBlur={() => {
                const val = pendingActualPrice[row.id];
                const newPrice = (val !== undefined ? val : v) ?? null;
                const current = v ?? null;
                if (newPrice === current) {
                  // No cambios: limpiar estado pendiente y evitar mutación
                  setPendingActualPrice((prev) => {
                    const { [row.id]: _, ...rest } = prev;
                    return rest;
                  });
                  return;
                }
                updateActualPriceMutation.mutate({ rowId: row.id, newPrice });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = pendingActualPrice[row.id];
                  const newPrice = (val !== undefined ? val : v) ?? null;
                  const current = v ?? null;
                  if (newPrice === current) {
                    setPendingActualPrice((prev) => {
                      const { [row.id]: _, ...rest } = prev;
                      return rest;
                    });
                    return;
                  }
                  updateActualPriceMutation.mutate({ rowId: row.id, newPrice });
                }
              }}
              placeholder="Precio real"
            />
          ),
        },
      ],
    },
    {
      title: "Cantidad",
      children: [
        {
          title: "Requerida",
          dataIndex: "quantity",
          key: "quantity",
          render: (v: number) => Number(v),
        },
        {
          title: "Recibida",
          dataIndex: "received_quantity",
          key: "received_quantity",
          render: (v: number | null, row: any) => (
            <InputNumber
              value={
                pendingReceivedQuantity[row.id] !== undefined
                  ? pendingReceivedQuantity[row.id]
                  : v ?? undefined
              }
              min={0}
              style={{ width: 120 }}
              disabled={!!savingById[row.id]}
              onChange={(val) => {
                setPendingReceivedQuantity((prev) => ({
                  ...prev,
                  [row.id]: typeof val === "number" ? val : undefined,
                }));
              }}
              onBlur={() => {
                const val = pendingReceivedQuantity[row.id];
                const newQuantity = (val !== undefined ? val : v) ?? null;
                const current = v ?? null;
                if (newQuantity === current) {
                  // No cambios: limpiar estado pendiente y evitar mutación
                  setPendingReceivedQuantity((prev) => {
                    const { [row.id]: _, ...rest } = prev;
                    return rest;
                  });
                  return;
                }
                updateReceivedQuantityMutation.mutate({
                  rowId: row.id,
                  newQuantity,
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = pendingReceivedQuantity[row.id];
                  const newQuantity = (val !== undefined ? val : v) ?? null;
                  const current = v ?? null;
                  if (newQuantity === current) {
                    setPendingReceivedQuantity((prev) => {
                      const { [row.id]: _, ...rest } = prev;
                      return rest;
                    });
                    return;
                  }
                  updateReceivedQuantityMutation.mutate({
                    rowId: row.id,
                    newQuantity,
                  });
                }
              }}
              placeholder="Cantidad recibida"
            />
          ),
        },
      ],
    },
    {
      title: "Notas",
      dataIndex: "notes",
      key: "notes",
      render: (v: string | null, row: any) => {
        return (
          <Input
            value={
              pendingNotes[row.id] !== undefined
                ? pendingNotes[row.id]
                : v ?? undefined
            }
            disabled={!!savingById[row.id]}
            style={{ width: 240 }}
            onChange={(e) => {
              const val = e.target.value;
              setPendingNotes((prev) => ({
                ...prev,
                [row.id]: typeof val === "string" ? val : undefined,
              }));
            }}
            onBlur={() => {
              const val = pendingNotes[row.id];
              const newNotes = (val !== undefined ? val : v) ?? null;
              const current = v ?? null;
              if (newNotes === current) {
                setPendingNotes((prev) => {
                  const { [row.id]: _, ...rest } = prev;
                  return rest;
                });
                return;
              }
              updateNotesMutation.mutate({ rowId: row.id, newNotes });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = pendingNotes[row.id];
                const newNotes = (val !== undefined ? val : v) ?? null;
                const current = v ?? null;
                if (newNotes === current) {
                  setPendingNotes((prev) => {
                    const { [row.id]: _, ...rest } = prev;
                    return rest;
                  });
                  return;
                }
                updateNotesMutation.mutate({ rowId: row.id, newNotes });
              }
            }}
            placeholder="Notas"
          />
        );
      },
    },
    {
      title: "Recepción en bodega",
      dataIndex: "received_by",
      key: "received_by",
      render: (email: string | null, { received_at: val }: any) => (
        <Space wrap>
          {email ? email : "—"}
          {val ? dayjs(val).format("YYYY-MM-DD HH:mm") : "—"}
        </Space>
      ),
    },
  ];

  return (
    <div style={{}}>
      {groups.map((group) => (
        <Card
          key={group.id}
          style={{ marginBottom: 24, overflow: "auto" }}
          extra={<Button>Cambiar estado</Button>}
          title={
            <Space>
              {group.supplier_name}
              <Text type="secondary">
                {group.purchase_code ? group.purchase_code : ""}
              </Text>
              <Tag>{group.status || "—"}</Tag>
            </Space>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            loading={isLoading}
            dataSource={group.items}
            columns={columns as any}
            rowKey="id"
            pagination={false}
          />
        </Card>
      ))}

      {!isLoading && groups.length === 0 && (
        <Text type="secondary">No hay órdenes de compra para este plan.</Text>
      )}
    </div>
  );
};

export default SuppliersRecepction;

SuppliersRecepction.getLayout = function getLayout(page: ReactElement) {
  return (
    <DashboardLayout noStyle>
      <DistributionPlanLayout> {page}</DistributionPlanLayout>
    </DashboardLayout>
  );
};
