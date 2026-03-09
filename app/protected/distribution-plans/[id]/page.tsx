"use client"
import { Button, Space, Divider } from "antd";
import { ArrowDownOutlined } from "@ant-design/icons";
import { useParams, useRouter } from "next/navigation";
import ModifyPlanStatus from "./components/ModifyPlanStatus";
import DistributionPlanStatistic from "./components/DistributionPlanStatistic";
import DistributionPlanDescription from "./components/DistributionPlanDescription";
import SaleOrdersTable from "./components/SaleOrdersTable";
import PurchaseOrdersTable from "./components/PurchaseOrdersTable";
import { useQueryClient } from "@tanstack/react-query";
import CreateSaleOrderButton from "./components/CreateSaleOrderButton";

const PlanEditorPage = () => {
  const params = useParams();
  const router = useRouter();
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
            queryClient.invalidateQueries({
              queryKey: ["distribution-plan", planId],
            })
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
        <CreateSaleOrderButton id={planId} />
      </Space>
      <SaleOrdersTable id={planId} />

      <Divider>Compras</Divider>
      <Space
        style={{
          marginBottom: 16,
          display: "flex",
          flexDirection: "row-reverse",
        }}
      >
        <Button
          onClick={() =>
            router.push(
              `/protected/distribution-plans/${planId}/assign-suppliers`,
            )
          }
          icon={<ArrowDownOutlined />}
        >
          Asignación de proveedores
        </Button>
      </Space>
      <PurchaseOrdersTable id={planId} />
    </>
  );
};

export default PlanEditorPage;
