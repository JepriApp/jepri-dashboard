import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Divider,
  Modal,
  Steps,
  Table,
  Tag,
  Typography,
} from "antd";
import React, { useState } from "react";
const { Text } = Typography;
const planStatusLabels: Record<string, string> = {
  planned: "Planificado",
  preparing: "En preparación",
  in_progress: "En progreso",
  invoicing: "Procesando cuentas",
  completed: "Completado",
  cancelled: "Cancelado",
};
const PLAN_STATUSES_ORDER: (
  | "planned"
  | "preparing"
  | "in_progress"
  | "invoicing"
  | "completed"
  | "cancelled"
)[] = ["planned", "preparing", "in_progress", "invoicing", "completed"];

const isNewStatusValid = (
  currentStatus: string,
  newStatus: string,
): boolean => {
  const validTransitions: Record<string, string[]> = {
    planned: ["preparing", "cancelled"],
    preparing: ["in_progress", "cancelled"],
    in_progress: ["invoicing", "cancelled"],
    invoicing: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };
  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
};

const ModifyPlanStatus = ({
  id,
  onSuccess,
}: {
  id: string;
  onSuccess?: () => void;
}) => {
  const supabase = createClient();
  const { message } = App.useApp();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const { isPending, error, data } = useQuery({
    queryKey: ["distribution-plan", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
          id,
          status
        `,
        )
        .eq("id", id)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
  const {
    isPending: resumenIsPending,
    error: resumenError,
    data: resumen,
  } = useQuery({
    queryKey: ["distribution-plan", id, "changes-resume-to-close"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "simulate_transition_to_completed_state",
        {
          plan_id: id,
        },
      );
      if (error) {
        throw error;
      }
      return data as {
        detalles_ofertas: {
          product_id: string;
          supplier_id: string;
          nombre_producto: string;
          nuevo_precio_oferta: number;
          precio_oferta_anterior: number;
        }[];
        total_ofertas_a_crear: number;
        productos_a_actualizar: {
          nombre: string;
          product_id: string;
          ofertas_asociadas: number;
          nuevo_precio_referencia: number;
          precio_referencia_anterior: number;
        }[];
      };
    },
    enabled: data?.status === "invoicing",
  });
  const isComponentDisabled =
    data?.status === "completed" || data?.status === "cancelled";
  const openStatusModal = () => {
    setStatusModalOpen(true);
  };
  const getNextStateDescription = (nextState: string): React.ReactNode => {
    switch (nextState) {
      case "preparing":
        <ul style={{ marginTop: 8 }}>
          {/* <li>✔ Se notificará a los proveedores sobre sus órdenes asignadas</li>
        <li>✖ No se aceptarán mas pedidos desde la aplicación</li> */}
          <li>✖ No podrás volver al estado anterior</li>
        </ul>;
      case "in_progress":
        return (
          <ul style={{ marginTop: 8 }}>
            <li>✔ Se podrán recibir en bodega las órdenes de compra</li>
            <li>✖ No podrás volver al estado anterior</li>
          </ul>
        );
      case "invoicing":
        return (
          <ul style={{ marginTop: 8 }}>
            <li>✖ No podrás volver al estado anterior</li>
          </ul>
        );
      case "completed":
        return (
          <div>
            <ul style={{ marginTop: 8 }}>
              <li>
                ✔ Se marcarán los pedidos de los clientes como
                &quot;completados&quot;
              </li>
              <li>
                ✖ No podrás modificar el porcentaje de comisión de este plan, ni
                los costos de envío
              </li>
              <li>
                ✖ No podrás hacer más cambios en este plan de distribución
              </li>
              <li>✖ No podrás volver al estado anterior</li>
              {/* <li>✔ Se actualizarán los precios mostrados en la app</li>
          <li>✔ Se actualizarán las ofertas de los vendedores</li> */}
            </ul>

            <Divider orientation="horizontal">
              Cambios en los precios de los productos
            </Divider>

            {/* Tabla Principal de Cambios */}
            <Table
              dataSource={resumen?.productos_a_actualizar}
              columns={[
                {
                  title: "Producto",
                  dataIndex: "nombre",
                  key: "nombre",
                  render: (text: string) => <Text strong>{text}</Text>,
                },
                {
                  title: "Precio actual",
                  dataIndex: "precio_referencia_anterior",
                  key: "precio_referencia_anterior",
                  render: (valor: number) => `${formatPriceAccounting(valor)}`,
                },
                {
                  title: "Nuevo precio",
                  dataIndex: "nuevo_precio_referencia",
                  key: "nuevo_precio_referencia",
                  render: (valor: number) => (
                    <Text type="success" strong>
                      {formatPriceAccounting(valor)}
                    </Text>
                  ),
                },
                {
                  title: "Cambio",
                  key: "cambio",
                  render: (_: any, record: any) => {
                    const diff =
                      record.nuevo_precio_referencia -
                      (record.precio_referencia_anterior || 0);
                    if (diff === 0) return <Tag color="default">=</Tag>;
                    return diff > 0 ? (
                      <>
                        <ArrowUpOutlined />
                        {formatPriceAccounting(diff)}
                      </>
                    ) : (
                      <>
                        <ArrowDownOutlined />
                        {formatPriceAccounting(diff)}
                      </>
                    );
                  },
                },
                {
                  title: "Ofertas Afectadas",
                  dataIndex: "ofertas_asociadas",
                  key: "ofertas_asociadas",
                  align: "center" as const,
                  render: (cant: number) => <Tag color="blue">{cant}</Tag>,
                },
              ]}
              rowKey="product_id"
              pagination={{ pageSize: 10 }}
              bordered
            />
          </div>
        );
    }
    return null;
  };
  const updatePlanStatus = useMutation({
    mutationFn: async ({
      status,
    }: {
      status:
        | "planned"
        | "preparing"
        | "in_progress"
        | "invoicing"
        | "completed"
        | "cancelled";
    }) => {
      if (!isNewStatusValid(data?.status as string, status)) {
        throw new Error(
          "El nuevo estado no es válido según la lógica de negocio.",
        );
      }
      if (status === "preparing") {
        const { error } = await supabase
          .from("distribution_plan")
          .update({ status: status })
          .eq("id", String(id))

          .single();
        if (error) {
          throw error;
        }
        // Actualizar estado de todas las órdenes a "published"
        const { error: error1 } = await supabase
          .from("purchase_order")
          .update({ status: "published" })
          .eq("distribution_plan_id", id);
        if (error1) throw error1;
      }
      if (status === "in_progress") {
        const { error } = await supabase
          .from("distribution_plan")
          .update({ status: status })
          .eq("id", String(id))

          .single();
        if (error) {
          throw error;
        }
      }
      if (status === "invoicing") {
        const { error } = await supabase
          .from("distribution_plan")
          .update({ status: status })
          .eq("id", String(id))

          .single();
        if (error) {
          throw error;
        }
      }
      if (status === "completed") {
        const { error: error4 } = await supabase.rpc(
          "transition_to_completed_state",
          {
            plan_id: id,
          },
        );
        if (error4) throw error4;
      }
      if (status === "cancelled") {
        const { error } = await supabase
          .from("distribution_plan")
          .update({ status: status })
          .eq("id", String(id))

          .single();
        if (error) {
          throw error;
        }
      }
    },
    onSuccess: () => {
      setStatusModalOpen(false);
      setChecked(false);
      message.success("Estado del plan actualizado");
      onSuccess?.();
    },
  });

  const onFinish = async (values: {
    status:
      | "planned"
      | "preparing"
      | "in_progress"
      | "invoicing"
      | "completed"
      | "cancelled";
  }) => {
    try {
      await updatePlanStatus.mutateAsync(values);
    } catch (err) {
      console.error("Error actualizando estado del plan", err);
      message.error("No se pudo actualizar el estado del plan");
    }
  };
  if (isPending || (resumenIsPending && data?.status === "invoicing"))
    return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  if (resumenError) return "An error has occurred: " + resumenError.message;
  const currentState = data.status;
  const currentStateIndex = PLAN_STATUSES_ORDER.indexOf(currentState);
  const nextState = PLAN_STATUSES_ORDER[currentStateIndex + 1] || currentState;

  return (
    <>
      <Button onClick={openStatusModal} disabled={isComponentDisabled}>
        Editar estado del plan
      </Button>
      <Modal
        title={`Cambiar estado a "${nextState}"`}
        open={statusModalOpen}
        width={"fit-content"}
        onCancel={() => {
          setStatusModalOpen(false);
          setChecked(false);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setStatusModalOpen(false);
              setChecked(false);
            }}
          >
            Volver sin cambiar
          </Button>,

          <Button
            key="ok"
            type="primary"
            danger
            disabled={!checked}
            loading={updatePlanStatus.isPending}
            onClick={() => {
              onFinish({ status: nextState });
            }}
          >
            Confirmar cambio a {planStatusLabels[nextState]}
          </Button>,
        ]}
      >
        <Steps
          current={currentStateIndex}
          size="small"
          style={{ marginBottom: 30 }}
          items={[
            { title: "Planeado" },
            { title: "En preparación" },
            { title: "En progreso" },
            { title: "Procesando cuentas" },
            { title: "Completado" },
          ]}
        />
        <Alert
          type="warning"
          title={`¿Estás seguro de pasar de "${planStatusLabels[currentState]}" a "${planStatusLabels[nextState]}"?`}
          description={getNextStateDescription(nextState)}
          showIcon
          style={{ marginBottom: 20 }}
        />

        <Checkbox
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        >
          Entiendo que este cambio no se puede deshacer.
        </Checkbox>
      </Modal>
    </>
  );
};

export default ModifyPlanStatus;
