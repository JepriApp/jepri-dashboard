import DashboardLayout from "@/components/layout/DashboardLayout";
import DistributionPlanLayout from "@/components/layout/DistributionPlanLayout";
import React, { ReactElement } from "react";
import { Button, Card, Space, Table, Tag, Typography, InputNumber, message } from "antd";
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
  reference_price: number | null;
  actual_price: number | null;
  quantity: number;
  received_quantity: number | null;
  received_by: string | null; // email del usuario
  received_at: string | null; // ISO
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
  const [pendingActualPrice, setPendingActualPrice] = React.useState<Record<string, number | undefined>>({});
  const [savingById, setSavingById] = React.useState<Record<string, boolean>>({});

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
            received_by,
            received_at,
            offer:offer_id (
              id,
              price,
              product:product_id (
                id,
                name
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
          reference_price: pi.offer?.price ?? null,
          actual_price: pi.actual_price ?? null,
          quantity: Number(pi.quantity || 0),
          received_quantity: pi.received_quantity ?? null,
          received_by: pi.receiver?.email ?? null,
          received_at: pi.received_at ?? null,
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
      const key = id ? ["distributionPlanPurchaseOrdersWithItems", id] : ["distributionPlanPurchaseOrdersWithItems"];
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

  const columns = [
    {
      title: "Producto",
      dataIndex: "product_name",
      key: "product_name",
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
              step={0.01}
              style={{ width: 120 }}
              disabled={!!savingById[row.id]}
              controls={false}
              onChange={(val) => {
                setPendingActualPrice((prev) => ({
                  ...prev,
                  [row.id]: typeof val === "number" ? val : undefined,
                }));
              }}
              onBlur={() => {
                const val = pendingActualPrice[row.id];
                const newPrice = (val !== undefined ? val : v) ?? null;
                updateActualPriceMutation.mutate({ rowId: row.id, newPrice });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = pendingActualPrice[row.id];
                  const newPrice = (val !== undefined ? val : v) ?? null;
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
          render: (v: number) => Number(v).toFixed(2),
        },
        {
          title: "Recibida",
          dataIndex: "received_quantity",
          key: "received_quantity",
          render: (v: number | null) =>
            v != null ? Number(v).toFixed(2) : "—",
        },
      ],
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
          style={{ marginBottom: 24 }}
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
