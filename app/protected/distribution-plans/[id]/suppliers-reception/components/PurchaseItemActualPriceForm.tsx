"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, InputNumber, message } from "antd";

interface PurchaseItem {
  id: string;
  actual_price: number | null;
}
const PurchaseItemActualPriceForm = ({
  id,
  disabled,
}: {
  id: string;
  disabled: boolean;
}) => {
  const supabase = createClient();
  const [form] = Form.useForm();
  const { data, error, isPending } = useQuery<PurchaseItem>({
    queryKey: [
      "suppliers-reception",
      "components",
      "purchase-item-actual-price-form",
      { purchaseItemId: id },
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_item")
        .select(
          `
          id,
          actual_price
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
  const updateActualPriceMutation = useMutation({
    mutationFn: async ({
      purchaseItemId,
      newPrice,
    }: {
      purchaseItemId: string;
      newPrice: number | null;
    }) => {
      const { data, error } = await supabase
        .from("purchase_item")
        .update({ actual_price: newPrice ?? null })
        .eq("id", purchaseItemId)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    onSuccess: (data) => {
      form.setFieldValue("actual_price", data.data.actual_price);
      message.success("Precio actualizado");
    },
    onError: (err) => {
      console.error("Error al actualizar precio real:", err);
      message.error("No se pudo guardar el precio real");
    },
  });
  const handleSubmit = (values: { actual_price: number }) => {
    if (form.isFieldTouched("actual_price")) {
      updateActualPriceMutation.mutateAsync({
        purchaseItemId: id,
        newPrice: values.actual_price,
      });
    }
  };
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  return (
    <Form
      initialValues={{
        actual_price: data.actual_price,
      }}
      form={form}
      onFinish={handleSubmit}
    >
      <Form.Item name="actual_price" noStyle>
        <InputNumber
          disabled={updateActualPriceMutation.isPending || disabled}
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
          placeholder="Precio real"
        />
      </Form.Item>
    </Form>
  );
};

export default PurchaseItemActualPriceForm;
