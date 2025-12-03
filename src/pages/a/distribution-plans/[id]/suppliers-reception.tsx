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
  Dropdown,
  Modal,
} from "antd";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { createClient as createSupabaseComponent } from "@/utils/supabase/component";
const supabase = createSupabaseComponent();

import dayjs from "dayjs";
import { useRouter } from "next/router";
import { formatPriceAccounting } from "../../../../../utils/formatPrice";
import { useAuthStore } from "@/store/auth.store";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import { renderPurchaseOrderStatusTag } from "@/constants/labels";

const { Text, Title } = Typography;
const { TextArea } = Input;

type PurchaseItemRow = {
  id: string;
  product_name: string;
  product_unit: string;
  reference_price: number | null;
  actual_price: number | null;
  quantity: number;
  received_quantity: number | null;
};

type PurchaseOrderGroup = {
  id: string;
  supplier_name: string;
  purchase_code: string | null;
  updated_by: string | null;
  updated_at: string | null;
  status: string | null;
  notes: string | null;
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
  const [pendingReceivedQuantity, setPendingReceivedQuantity] = React.useState<
    Record<string, number | undefined>
  >({});
  const [pendingNotes, setPendingNotes] = React.useState<
    Record<string, string | undefined>
  >({});

  // Estados para los modales de cancelar/rechazar
  const [rejectModalVisible, setRejectModalVisible] = React.useState(false);
  const [cancelModalVisible, setCancelModalVisible] = React.useState(false);
  const [currentOrderId, setCurrentOrderId] = React.useState<string | null>(
    null
  );
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [cancelNotes, setCancelNotes] = React.useState("");

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
          notes,
          updated_by_name: updated_by (
            name
          ),
          updated_at,
          supplier:supplier_id ( id, name ),
          items:purchase_item (
            id,
            quantity,
            actual_price,
            received_quantity,
            offer:offer_id (
              id,
              price,
              product:product_id (
                id,
                name,
                unit
              )
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
        notes: po.notes ?? null,
        updated_by: po.updated_by_name?.name ?? null,
        updated_at: po.updated_at ?? null,
        items: (po.items || []).map((pi: any) => ({
          id: pi.id,
          product_name: pi.offer?.product?.name ?? "—",
          product_unit: pi.offer?.product?.unit ?? "—",
          reference_price: pi.offer?.price ?? null,
          actual_price: pi.actual_price ?? null,
          quantity: Number(pi.quantity || 0),
          received_quantity: pi.received_quantity ?? null,
          received_by: pi.receiver?.email ?? null,
          received_at: pi.updated_at ?? null,
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
      const payload: any = {
        actual_price: newPrice ?? null,
      };
      const { error } = await supabase
        .from("purchase_item")
        .update(payload)
        .eq("id", rowId);
      if (error) throw error;
      return { rowId, newPrice };
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
  });

  const updateReceivedQuantityMutation = useMutation<
    { rowId: string; newQuantity: number | null },
    any,
    { rowId: string; newQuantity: number | null },
    unknown
  >({
    mutationFn: async ({ rowId, newQuantity }) => {
      const payload: any = {
        received_quantity: newQuantity ?? null,
      };
      const { error } = await supabase
        .from("purchase_item")
        .update(payload)
        .eq("id", rowId);
      if (error) throw error;
      return { rowId, newQuantity };
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
  });

  const updateNotesMutation = useMutation<
    { purchase_order_id: string; newNotes: string | null },
    any,
    { purchase_order_id: string; newNotes: string | null },
    unknown
  >({
    mutationFn: async ({ purchase_order_id, newNotes }) => {
      const authId = await getCurrentAuthId();
      const payload: any = {
        notes: newNotes ?? null,
        updated_at: new Date().toISOString(),
      };
      if (authId) payload.updated_by = authId;
      const { error } = await supabase
        .from("purchase_order")
        .update(payload)
        .eq("id", purchase_order_id);
      if (error) throw error;
      return { purchase_order_id, newNotes };
    },
    onSuccess: (_data, variables) => {
      message.success("Notas actualizadas");
      setPendingNotes((prev) => {
        const { [variables.purchase_order_id]: _, ...rest } = prev;
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
  });

  const updatePurchaseOrderStatusMutation = useMutation<
    { purchase_order_id: string; newStatus: string; notes?: string | null },
    any,
    { purchase_order_id: string; newStatus: string; notes?: string | null },
    unknown
  >({
    mutationFn: async ({ purchase_order_id, newStatus, notes }) => {
      const authId = await getCurrentAuthId();
      const payload: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (authId) payload.updated_by = authId;
      if (notes !== undefined) payload.notes = notes;

      const { error } = await supabase
        .from("purchase_order")
        .update(payload)
        .eq("id", purchase_order_id);
      if (error) throw error;
      return { purchase_order_id, newStatus, notes };
    },
    onSuccess: (_data, variables) => {
      message.success("Estado actualizado");
      const key = id
        ? ["distributionPlanPurchaseOrdersWithItems", id]
        : ["distributionPlanPurchaseOrdersWithItems"];
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err: any) => {
      console.error("Error al actualizar estado:", err);
      message.error("No se pudo actualizar el estado");
    },
  });

  const savingById =
    updateReceivedQuantityMutation.isPending ||
    updateActualPriceMutation.isPending ||
    updatePurchaseOrderStatusMutation.isPending;

  const handleRejectOrder = () => {
    if (!currentOrderId) return;

    updatePurchaseOrderStatusMutation.mutate({
      purchase_order_id: currentOrderId,
      newStatus: "rejected",
      notes: rejectNotes.trim() || null,
    });

    setRejectModalVisible(false);
    setRejectNotes("");
    setCurrentOrderId(null);
  };

  const handleCancelOrder = () => {
    if (!currentOrderId) return;

    updatePurchaseOrderStatusMutation.mutate({
      purchase_order_id: currentOrderId,
      newStatus: "cancelled",
      notes: cancelNotes.trim() || null,
    });

    setCancelModalVisible(false);
    setCancelNotes("");
    setCurrentOrderId(null);
  };

  return (
    <div style={{}}>
      {groups.map((group) => (
        <Card
          key={group.id}
          style={{ marginBottom: 24, overflow: "auto" }}
          title={
            <Space direction="vertical" size={0} align="start">
              <Space size={8}>
                <Title level={5} style={{ margin: 0 }}>
                  {group.supplier_name}
                </Title>
                {renderPurchaseOrderStatusTag(group.status)}
              </Space>
              <Text type="secondary">{group.purchase_code || "—"}</Text>
            </Space>
          }
          extra={
            <div style={{ textAlign: "right" }}>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Última actualización:{" "}{group.updated_by || "—"}{" "}
                {group.updated_at
                  ? dayjs(group.updated_at).format("YYYY-MM-DD HH:mm A")
                  : "—"}
              </Text>
            </div>
          }
          styles={{ body: { padding: 0 } }}
        >
          {(() => {
            const isEditable = group.status === "accepted";
            const isFinal = ["received", "cancelled", "rejected"].includes(
              group.status || ""
            );

            const groupColumns = [
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
                    title: "Mas reciente",
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
                        prefix="$"
                        style={{ width: 120 }}
                        disabled={savingById || !isEditable}
                        onChange={(val) => {
                          setPendingActualPrice((prev) => ({
                            ...prev,
                            [row.id]: typeof val === "number" ? val : undefined,
                          }));
                        }}
                        onBlur={() => {
                          const val = pendingActualPrice[row.id];
                          const newPrice =
                            (val !== undefined ? val : v) ?? null;
                          const current = v ?? null;
                          if (newPrice === current || !isEditable) {
                            // No cambios o no editable: limpiar estado pendiente y evitar mutación
                            setPendingActualPrice((prev) => {
                              const { [row.id]: _, ...rest } = prev;
                              return rest;
                            });
                            return;
                          }
                          updateActualPriceMutation.mutate({
                            rowId: row.id,
                            newPrice,
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = pendingActualPrice[row.id];
                            const newPrice =
                              (val !== undefined ? val : v) ?? null;
                            const current = v ?? null;
                            if (newPrice === current || !isEditable) {
                              setPendingActualPrice((prev) => {
                                const { [row.id]: _, ...rest } = prev;
                                return rest;
                              });
                              return;
                            }
                            updateActualPriceMutation.mutate({
                              rowId: row.id,
                              newPrice,
                            });
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
                        disabled={savingById || !isEditable}
                        onChange={(val) => {
                          setPendingReceivedQuantity((prev) => ({
                            ...prev,
                            [row.id]: typeof val === "number" ? val : undefined,
                          }));
                        }}
                        onBlur={() => {
                          const val = pendingReceivedQuantity[row.id];
                          const newQuantity =
                            (val !== undefined ? val : v) ?? null;
                          const current = v ?? null;
                          if (newQuantity === current || !isEditable) {
                            // No cambios o no editable: limpiar estado pendiente y evitar mutación
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
                            const newQuantity =
                              (val !== undefined ? val : v) ?? null;
                            const current = v ?? null;
                            if (newQuantity === current || !isEditable) {
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
            ];

            return (
              <Table
                bordered
                loading={isLoading}
                dataSource={group.items}
                columns={groupColumns as any}
                rowKey="id"
                pagination={false}
                footer={() => (
                  <div
                    style={{ display: "flex", gap: 8, justifyContent: "end" }}
                  >
                    <TextArea
                      placeholder="Notas de la orden (opcional)"
                      value={pendingNotes[group.id] ?? group.notes ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPendingNotes((prev) => ({
                          ...prev,
                          [group.id]: val,
                        }));
                      }}
                      onBlur={() => {
                        const pending = pendingNotes[group.id];
                        const original = group.notes ?? "";
                        const newTrim = (pending ?? original).trim();
                        const oldTrim = original.trim();
                        if (
                          pending === undefined ||
                          newTrim === oldTrim ||
                          !isEditable
                        ) {
                          setPendingNotes((prev) => {
                            const { [group.id]: _, ...rest } = prev;
                            return rest;
                          });
                          return;
                        }
                        updateNotesMutation.mutate({
                          purchase_order_id: group.id,
                          newNotes: newTrim.length ? newTrim : null,
                        });
                      }}
                      onPressEnter={(e) => {
                        e.preventDefault();
                        const pending = pendingNotes[group.id];
                        const original = group.notes ?? "";
                        const newTrim = (pending ?? original).trim();
                        const oldTrim = original.trim();
                        if (
                          pending === undefined ||
                          newTrim === oldTrim ||
                          !isEditable
                        ) {
                          setPendingNotes((prev) => {
                            const { [group.id]: _, ...rest } = prev;
                            return rest;
                          });
                          return;
                        }
                        updateNotesMutation.mutate({
                          purchase_order_id: group.id,
                          newNotes: newTrim.length ? newTrim : null,
                        });
                      }}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      disabled={updateNotesMutation.isPending || !isEditable}
                    />

                    {isEditable ? (
                      <Dropdown.Button
                        menu={{
                          items: [
                            {
                              key: "rejected",
                              label: "Rechazar",
                              icon: <StopOutlined />,
                            },
                            {
                              key: "cancelled",
                              label: "Cancelar",
                              icon: <CloseCircleOutlined />,
                            },
                          ],
                          onClick: ({ key }) => {
                            if (key === "rejected") {
                              setCurrentOrderId(group.id);
                              setRejectModalVisible(true);
                            } else if (key === "cancelled") {
                              setCurrentOrderId(group.id);
                              setCancelModalVisible(true);
                            }
                          },
                        }}
                        onClick={() => {
                          updatePurchaseOrderStatusMutation.mutate({
                            purchase_order_id: group.id,
                            newStatus: "received",
                          });
                        }}
                        type="primary"
                        disabled={savingById}
                        style={{ justifyContent: "end" }}
                      >
                        <CheckCircleOutlined /> Completar recibo
                      </Dropdown.Button>
                    ) : null}
                    {isFinal ? (
                      <Button
                        type="primary"
                        disabled={savingById}
                        onClick={() => {
                          updatePurchaseOrderStatusMutation.mutate({
                            purchase_order_id: group.id,
                            newStatus: "accepted",
                          });
                        }}
                      >
                        Volver a editar
                      </Button>
                    ) : null}
                  </div>
                )}
              />
            );
          })()}
        </Card>
      ))}

      {!isLoading && groups.length === 0 && (
        <Text type="secondary">No hay órdenes de compra para este plan.</Text>
      )}

      {/* Modal para rechazar orden */}
      <Modal
        title={
          <Space>
            <StopOutlined />
            Rechazar orden
          </Space>
        }
        open={rejectModalVisible}
        onOk={handleRejectOrder}
        onCancel={() => {
          setRejectModalVisible(false);
          setRejectNotes("");
          setCurrentOrderId(null);
        }}
        okText="Sí, rechazar"
        cancelText="Cancelar"
        confirmLoading={updatePurchaseOrderStatusMutation.isPending}
      >
        <p>¿Deseas marcar la orden como Rechazada?</p>
        <TextArea
          placeholder="Motivo del rechazo (opcional)"
          value={rejectNotes}
          onChange={(e) => setRejectNotes(e.target.value)}
          rows={3}
          style={{ marginTop: 16 }}
        />
      </Modal>

      {/* Modal para cancelar orden */}
      <Modal
        title={
          <Space>
            <CloseCircleOutlined />
            Cancelar orden
          </Space>
        }
        open={cancelModalVisible}
        onOk={handleCancelOrder}
        onCancel={() => {
          setCancelModalVisible(false);
          setCancelNotes("");
          setCurrentOrderId(null);
        }}
        okText="Sí, cancelar"
        cancelText="Cancelar"
        confirmLoading={updatePurchaseOrderStatusMutation.isPending}
      >
        <p>¿Deseas marcar la orden como Cancelada?</p>
        <TextArea
          placeholder="Motivo de la cancelación (opcional)"
          value={cancelNotes}
          onChange={(e) => setCancelNotes(e.target.value)}
          rows={3}
          style={{ marginTop: 16 }}
        />
      </Modal>
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
