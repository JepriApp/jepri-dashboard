"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, InputNumber, message, Typography } from "antd";

interface DistributionPlan {
  id: string;
  service_fee_percentage: number;
  status: "planned" | "preparing" | "in_progress" | "completed" | "cancelled";
}
const DistributionPlanServiceFeePercentageForm = ({
  id,
  disabled,
  onSuccess,
}: {
  id: string;
  disabled: boolean;
  onSuccess?: () => void;
}) => {
  const supabase = createClient();
  const [form] = Form.useForm();
  const { data, error, isPending } = useQuery<DistributionPlan>({
    queryKey: [
      "finance",
      "components",
      "distribution-plan-service-fee-percentage-form",
      { planId: id },
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
          id,
          service_fee_percentage,
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
  const updateActualPriceMutation = useMutation({
    mutationFn: async ({
      planId,
      newValue,
    }: {
      planId: string;
      newValue: number;
    }) => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .update({ service_fee_percentage: newValue })
        .eq("id", planId)
        .select("service_fee_percentage")
        .single();
      if (error) throw error;
      return { data };
    },
    onSuccess: (data) => {
      onSuccess?.();
      form.setFieldValue(
        "service_fee_percentage",
        data.data.service_fee_percentage,
      );
      message.success("Porcentaje actualizado");
    },
    onError: (err) => {
      console.error("Error al actualizar porcentaje:", err);
      message.error("No se pudo guardar el porcentaje");
    },
  });
  const handleSubmit = (values: { service_fee_percentage: number }) => {
    if (form.isFieldTouched("service_fee_percentage")) {
      updateActualPriceMutation.mutateAsync({
        planId: id,
        newValue: values.service_fee_percentage,
      });
    }
  };
  const isComponentDisabled =
    data?.status === "completed" || data?.status === "cancelled";
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  return (
    <Form
      initialValues={{
        service_fee_percentage: data.service_fee_percentage,
      }}
      form={form}
      onFinish={handleSubmit}
    >
      <Form.Item name="service_fee_percentage" label="Comisión por venta">
        {isComponentDisabled ? (
          <Typography.Text>{data.service_fee_percentage} %</Typography.Text>
        ) : (
          <InputNumber
            disabled={updateActualPriceMutation.isPending || disabled}
            onBlur={() => {
              form.submit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                form.submit();
              }
            }}
            style={{ width: 120 }}
            min={0}
            max={100}
            precision={1}
            suffix="%"
          />
        )}
      </Form.Item>
    </Form>
  );
};

export default DistributionPlanServiceFeePercentageForm;
