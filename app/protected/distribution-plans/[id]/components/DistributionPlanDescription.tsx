"use client";
import DistributionPlanStatusTag from "@/app/protected/components/DistributionPlanStatusTag";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Descriptions } from "antd";
import dayjs from "dayjs";
import DistributionPlanNotesForm from "./DistributionPlanNotesForm";

function DistributionPlanDescription({ id }: { id: string }) {
  const supabase = createClient();
  const { isPending, error, data } = useQuery({
    queryKey: ["distribution-plan", "components", "description", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
          id,
          plan_code,
          plan_date,
          status,
          operator:operator_id (
            id,
            name
          ),
          cutoff_at
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
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  const { plan_code, plan_date, status /* , operator, cutoff_at */ } =
    data ?? {};
  return (
    <Descriptions
      bordered
      column={{ xs: 1, sm: 2, md: 2, lg: 3, xl: 4, xxl: 4 }}
      style={{ marginBottom: "16px" }}
    >
      <Descriptions.Item label="Código">{plan_code ?? "-"}</Descriptions.Item>
      <Descriptions.Item label="Fecha del plan">
        {plan_date ? dayjs(plan_date).format("YYYY-MM-DD") : "-"}
      </Descriptions.Item>
      <Descriptions.Item label="Estado">
        <DistributionPlanStatusTag status={status} />
      </Descriptions.Item>
      {/* <Descriptions.Item label="Coordinador">
        {operator?.name ?? "-"}
      </Descriptions.Item>
      <Descriptions.Item label="Corte">
        {cutoff_at ? dayjs(cutoff_at).format("YYYY-MM-DD HH:mm") : "-"}
      </Descriptions.Item> */}
      <Descriptions.Item label="Notas">
        <DistributionPlanNotesForm planId={id} />
      </Descriptions.Item>
    </Descriptions>
  );
}

export default DistributionPlanDescription;
