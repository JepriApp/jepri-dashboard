"use client";
import { Button, Space, Divider } from "antd";
import { ArrowDownOutlined, PlusOutlined } from "@ant-design/icons";
import { redirect, useParams } from "next/navigation";
import ModifyPlanStatus from "./components/ModifyPlanStatus";
import DistributionPlanStatistic from "./components/DistributionPlanStatistic";
import DistributionPlanDescription from "./components/DistributionPlanDescription";
import SaleOrdersTable from "./components/SaleOrdersTable";
import PurchaseOrdersTable from "./components/PurchaseOrdersTable";
import { useQueryClient } from "@tanstack/react-query";

const PlanEditorPage = () => {
  const params = useParams();
  const planId = params.id as string | undefined;
  const queryClient = useQueryClient();
  if (!planId) {
    return null;
  }
  return (
    <>
      <DistributionPlanDescription id={planId} />
      <Space
        style={{
          marginBottom: 16,
          display: "flex",
          flexDirection: "row-reverse",
        }}
      >
        <ModifyPlanStatus
          id={planId}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["distribution-plan", "components"] })
          }
        />
      </Space>
      <DistributionPlanStatistic id={planId} />
      <Divider orientation="horizontal">Pedidos</Divider>
      <Space
        style={{
          marginBottom: 16,
          display: "flex",
          flexDirection: "row-reverse",
        }}
      >
        <Button
          onClick={() =>
            redirect(`/protected/sale-orders/create?planId=${planId}`)
          }
          icon={<PlusOutlined />}
        >
          Agregar pedido
        </Button>
      </Space>
      <SaleOrdersTable id={planId} />

      <Divider>Órdenes de compra</Divider>
      <Space
        style={{
          marginBottom: 16,
          display: "flex",
          flexDirection: "row-reverse",
        }}
      >
        <Button
          onClick={() =>
            redirect(`/protected/distribution-plans/${planId}/assign-suppliers`)
          }
          icon={<ArrowDownOutlined />}
        >
          Asignar proveedores
        </Button>
      </Space>
      <PurchaseOrdersTable id={planId} />
    </>
  );
};

export default PlanEditorPage;
