"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, InputNumber, message } from "antd";

interface SaleOrder {
  id: string;
  delivery_fee: number | null;
}
const SaleOrderDeliveryFeeForm = ({
  id,
  disabled,
  onSuccess,
}: {
  id: string;
  disabled: boolean;
  onSuccess?: () => Promise<void>;
}) => {
  const supabase = createClient();
  const [form] = Form.useForm();
  const { data, error, isPending } = useQuery<SaleOrder>({
    queryKey: [
      "finance",
      "components",
      "sale-order-delivery-fee-form",
      { saleOrderId: id },
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          delivery_fee
        `
        )
        .eq("id", id)
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
        saleOrderId: id,
        newValue: values.delivery_fee,
      });
    }
  };
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  return (
    <Form
      initialValues={{
        delivery_fee: data.delivery_fee,
      }}
      form={form}
      onFinish={handleSubmit}
    >
      <Form.Item name="delivery_fee">
        <InputNumber
          disabled={updateMutation.isPending || disabled}
          min={0}
          prefix="$"
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
