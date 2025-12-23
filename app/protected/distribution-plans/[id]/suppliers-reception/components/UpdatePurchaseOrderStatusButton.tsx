import AsyncButton from "@/app/protected/components/AsyncButton";
import { createClient } from "@/lib/supabase/client";
import {
  StopOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { Dropdown, Button, message, Modal, Input, Space } from "antd";
import React, { useState } from "react";

const UpdatePurchaseOrderStatusButton = ({
  isCreated,
  isPublished,
  isEditable,
  isFinal,
  id,
  onSuccess,
}: {
  isCreated: boolean;
  isPublished: boolean;
  isEditable: boolean;
  isFinal: boolean;
  id: string;
  onSuccess?: () => void;
}) => {
  const supabase = createClient();
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [notes, setNotes] = useState("");
  const updatePurchaseOrderStatusMutation = useMutation<
    {
      purchase_order_id: string;
      newStatus:
        | "cancelled"
        | "created"
        | "published"
        | "accepted"
        | "received"
        | "rejected"
        | undefined;
      notes?: string | null;
    },
    unknown,
    {
      purchase_order_id: string;
      newStatus:
        | "cancelled"
        | "created"
        | "published"
        | "accepted"
        | "received"
        | "rejected"
        | undefined;
      notes?: string | null;
    },
    unknown
  >({
    mutationFn: async ({ purchase_order_id, newStatus, notes }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id)
        throw new Error(
          "Usuario no autenticado: no se puede crear/actualizar órdenes de compra"
        );
      const { data: adminData, error: adminError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user?.id)
        .single();
      if (adminError) throw adminError;

      const payload = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        /* updated_by: user?.id || null, */
        updated_by: adminData?.id || null,
        notes: notes || null,
      };

      const { error } = await supabase
        .from("purchase_order")
        .update(payload)
        .eq("id", purchase_order_id);
      if (error) throw error;
      return { purchase_order_id, newStatus, notes };
    },
    onSuccess: () => {
      message.success("Estado actualizado");
      onSuccess?.();
    },
    onError: (err) => {
      console.error("Error al actualizar estado:", err);
      message.error("No se pudo actualizar el estado");
    },
  });
  const handleRejectOrder = () => {
    updatePurchaseOrderStatusMutation.mutate({
      purchase_order_id: id,
      newStatus: "rejected",
      notes: notes?.trim() || null,
    });

    setRejectModalVisible(false);
    setNotes("");
  };

  const handleCancelOrder = () => {
    updatePurchaseOrderStatusMutation.mutate({
      purchase_order_id: id,
      newStatus: "cancelled",
      notes: notes?.trim() || null,
    });

    setCancelModalVisible(false);
    setNotes("");
  };
  return (
    <>
      {isCreated ? (
        <Button
          type="primary"
          disabled={updatePurchaseOrderStatusMutation.isPending}
          onClick={() => {
            updatePurchaseOrderStatusMutation.mutate({
              purchase_order_id: id,
              newStatus: "published",
            });
          }}
        >
          Publicar
        </Button>
      ) : null}
      {isPublished ? (
        <AsyncButton
          onClick={() => {
            updatePurchaseOrderStatusMutation.mutate({
              purchase_order_id: id,
              newStatus: "accepted",
            });
          }}
          type="primary"
          disabled={updatePurchaseOrderStatusMutation.isPending}
        >
          Aceptar en nombre del proveedor
        </AsyncButton>
      ) : null}
      {isEditable ? (
        <>
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
                  setRejectModalVisible(true);
                } else if (key === "cancelled") {
                  setCancelModalVisible(true);
                }
              },
            }}
            onClick={() => {
              updatePurchaseOrderStatusMutation.mutate({
                purchase_order_id: id,
                newStatus: "received",
              });
            }}
            type="primary"
            disabled={updatePurchaseOrderStatusMutation.isPending}
            style={{ justifyContent: "end" }}
          >
            <CheckCircleOutlined /> Completar recibo
          </Dropdown.Button>
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
              setNotes("");
            }}
            okText="Sí, rechazar"
            cancelText="Cancelar"
            confirmLoading={updatePurchaseOrderStatusMutation.isPending}
          >
            <p>¿Deseas marcar la orden como Rechazada?</p>
            <Input.TextArea
              placeholder="Motivo del rechazo (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              setNotes("");
            }}
            okText="Sí, cancelar"
            cancelText="Cancelar"
            confirmLoading={updatePurchaseOrderStatusMutation.isPending}
          >
            <p>¿Deseas marcar la orden como Cancelada?</p>
            <Input.TextArea
              placeholder="Motivo de la cancelación (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ marginTop: 16 }}
            />
          </Modal>
        </>
      ) : null}
      {isFinal ? (
        <Button
          type="primary"
          disabled={updatePurchaseOrderStatusMutation.isPending}
          onClick={() => {
            updatePurchaseOrderStatusMutation.mutate({
              purchase_order_id: id,
              newStatus: "accepted",
            });
          }}
        >
          Volver a editar
        </Button>
      ) : null}
    </>
  );
};

export default UpdatePurchaseOrderStatusButton;
