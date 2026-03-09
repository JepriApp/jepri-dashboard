import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Checkbox, message, Modal, Steps } from "antd";
import React, { useState } from "react";

const planStatusLabels: Record<string, string> = {
  planned: "Planificado",
  preparing: "En preparación",
  in_progress: "En progreso",
  completed: "Completado",
  cancelled: "Cancelado",
};
const PLAN_STATUSES_ORDER: (
  | "planned"
  | "preparing"
  | "in_progress"
  | "completed"
  | "cancelled"
)[] = ["planned", "preparing", "in_progress", "completed"];

const isNewStatusValid = (
  currentStatus: string,
  newStatus: string,
): boolean => {
  const validTransitions: Record<string, string[]> = {
    planned: ["preparing", "cancelled"],
    preparing: ["in_progress", "cancelled"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
  };
  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
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
    case "completed":
      return (
        <ul style={{ marginTop: 8 }}>
          <li>
            ✔ Se marcarán los pedidos de los clientes como &quot;completados&quot;
          </li>
          {/* <li>✔ Se actualizarán los precios mostrados en la app</li>
          <li>✔ Se actualizarán las ofertas de los vendedores</li> */}
          <li>
            ✖ No podrás modificar el porcentaje de comisión de este plan, ni los
            costos de envío
          </li>
          <li>✖ No podrás hacer más cambios en este plan de distribución</li>
          <li>✖ No podrás volver al estado anterior</li>
        </ul>
      );
  }
  return null;
};

const ModifyPlanStatus = ({
  id,
  onSuccess,
}: {
  id: string;
  onSuccess?: () => void;
}) => {
  const supabase = createClient();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const { isPending, error, data } = useQuery({
    queryKey: [
      "distribution-plan",
      id,
    ],
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
  const isComponentDisabled = data?.status==='completed'||data?.status==='cancelled'
  const openStatusModal = () => {
    setStatusModalOpen(true);
  };
  const updatePlanStatus = useMutation({
    mutationFn: async ({
      status,
    }: {
      status:
        | "planned"
        | "preparing"
        | "in_progress"
        | "completed"
        | "cancelled";
    }) => {
      if (!isNewStatusValid(data?.status as string, status)) {
        throw new Error(
          "El nuevo estado no es válido según la lógica de negocio.",
        );
      }
      const { data: d_plan_data, error } = await supabase
        .from("distribution_plan")
        .update({ status: status })
        .eq("id", String(id))
        .select(`service_fee_percentage`)
        .single();
      if (error) {
        throw error;
      }
      if (status === "preparing") {
        // Actualizar estado de todas las órdenes a "published"
        const { error: error1 } = await supabase
          .from("purchase_order")
          .update({ status: "published" })
          .eq("distribution_plan_id", id);
        if (error1) throw error1;
      }
      if (status === "in_progress") {
      }
      if (status === "completed") {
        // Actualizar estado de todas las órdenes de venta como completadas "delivered"
        // Guardar porcentaje de comision usado
        const { error: error3 } = await supabase
          .from("sale_order")
          .update({
            status: "delivered",
            service_fee_percentage: d_plan_data.service_fee_percentage,
          })
          .eq("distribution_plan_id", id);
        if (error3) throw error3;
        //TODO: Actualizar precios de referencia de las ofertas usadas,
        //Debes crear una nueva oferta y deshabilitar las anterior (o siempre usar la mas reciente que este disponible)
        //Tambien se debe revisar TODOS los lugares donde se use la entidad offer para que tenga en cuenta que hay todo un historico de offers

        //TODO: Actualizar precios visibles de los productos en la aplicación
        //El Precio viene a ser el promedio de los precios ofrecidos en la ultima operacion para ese producto en especifico
      }
      if (status === "cancelled") {
      }
      return d_plan_data;
    },
    onSuccess: () => {
      setStatusModalOpen(false);
      setChecked(false);
      message.success("Estado del plan actualizado");
      onSuccess?.();
    },
  });

  const onFinish = async (values: {
    status: "planned" | "preparing" | "in_progress" | "completed" | "cancelled";
  }) => {
    try {
      await updatePlanStatus.mutateAsync(values);
    } catch (err) {
      console.error("Error actualizando estado del plan", err);
      message.error("No se pudo actualizar el estado del plan");
    }
  };
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
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
            { title: "Completado" },
          ]}
        />
        <Alert
          type="warning"
          message={`¿Estás seguro de pasar de "${planStatusLabels[currentState]}" a "${planStatusLabels[nextState]}"?`}
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
