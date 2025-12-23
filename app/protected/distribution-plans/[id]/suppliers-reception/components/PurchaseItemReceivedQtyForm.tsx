"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, InputNumber, message } from "antd";

interface PurchaseItem {
  id: string;
  received_quantity: number | null;
}
const PurchaseItemReceivedQtyForm = ({
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
      "purchase-item-received-qty-form",
      { purchaseItemId: id },
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_item")
        .select(
          `
          id,
          received_quantity
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
      newQty,
    }: {
      purchaseItemId: string;
      newQty: number | null;
    }) => {
      const { data, error } = await supabase
        .from("purchase_item")
        .update({ received_quantity: newQty ?? null })
        .eq("id", purchaseItemId)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    onSuccess: (data) => {
      form.setFieldValue("received_quantity", data.data.received_quantity);
      message.success("Precio actualizado");
    },
    onError: (err) => {
      console.error("Error al actualizar precio real:", err);
      message.error("No se pudo guardar el precio real");
    },
  });
  const handleSubmit = (values: { received_quantity: number }) => {
    if (form.isFieldTouched("received_quantity")) {
      updateActualPriceMutation.mutateAsync({
        purchaseItemId: id,
        newQty: values.received_quantity,
      });
    }
  };
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  return (
    <Form
      initialValues={{
        received_quantity: data.received_quantity,
      }}
      form={form}
      onFinish={handleSubmit}
    >
      <Form.Item name="received_quantity">
        <InputNumber
          disabled={updateActualPriceMutation.isPending || disabled}
          min={0}
          style={{ width: 120 }}
          onBlur={() => {
            form.submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              form.submit();
            }
          }}
          placeholder="Cantidad recibida"
        />
      </Form.Item>
    </Form>
  );
};

export default PurchaseItemReceivedQtyForm;
