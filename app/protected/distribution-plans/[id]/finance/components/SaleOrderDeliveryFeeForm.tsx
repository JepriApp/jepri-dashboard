"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, InputNumber, message, Typography } from "antd";

interface SaleOrder {
  id: string;
  delivery_fee: number | null;
}
const SaleOrderDeliveryFeeForm = ({
  saleOrderId,
  planId,
  disabled,
  onSuccess,
}: {
  saleOrderId: string;
  planId: string;
  disabled: boolean;
  onSuccess?: () => Promise<void>;
}) => {
  const supabase = createClient();
  const [form] = Form.useForm();
  const distributionPlanQuery = useQuery({
    queryKey: ["distribution-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
            id,
            status
          `,
        )
        .eq("id", planId)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
  const { data, error, isPending } = useQuery<SaleOrder>({
    queryKey: [
      "finance",
      "components",
      "sale-order-delivery-fee-form",
      { saleOrderId: saleOrderId },
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          delivery_fee
        `,
        )
        .eq("id", saleOrderId)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({
      saleOrderId,
      newValue,
    }: {
      saleOrderId: string;
      newValue: number | null;
    }) => {
      const { data, error } = await supabase
        .from("sale_order")
        .update({ delivery_fee: newValue ?? null })
        .eq("id", saleOrderId)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    onSuccess: async (data) => {
      form.setFieldValue("delivery_fee", data.data.delivery_fee);
      await onSuccess?.();
      message.success("Precio actualizado");
    },
    onError: (err) => {
      console.error("Error al actualizar precio real:", err);
      message.error("No se pudo guardar el precio real");
    },
  });
  const handleSubmit = (values: { delivery_fee: number }) => {
    if (form.isFieldTouched("delivery_fee")) {
      updateMutation.mutateAsync({
        saleOrderId: saleOrderId,
        newValue: values.delivery_fee,
      });
    }
  };

  const isComponentDisabled =
    distributionPlanQuery.data?.status === "completed" ||
    distributionPlanQuery.data?.status === "cancelled";

  if (isPending || distributionPlanQuery.isPending) return "Loading...";
  if (error || distributionPlanQuery.error)
    return "An error has occurred: " + error?.message;
  if (isComponentDisabled) {
    return <Typography.Text>$ {data.delivery_fee}</Typography.Text>;
  }
  return (
    <Form
      initialValues={{
        delivery_fee: data.delivery_fee,
      }}
      form={form}
      onFinish={handleSubmit}
    >
      <Form.Item name="delivery_fee" noStyle>
        <InputNumber
          disabled={updateMutation.isPending || disabled}
          min={0}
          prefix="$"
          step={100}
          style={{ width: 120 }}
          onBlur={() => {
            form.submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              form.submit();
            }
          }}
          placeholder="Domicilio..."
        />
      </Form.Item>
    </Form>
  );
};

export default SaleOrderDeliveryFeeForm;
