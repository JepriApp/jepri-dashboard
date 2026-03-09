"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Form, Input, Typography } from "antd";

interface PurchaseOrder {
  id: string;
  notes: string | null;
}
const PurchaseOrderNotesForm = ({
  purchaseOrderId,
  planId,
}: {
  purchaseOrderId: string;
  planId: string;
}) => {
  const supabase = createClient();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const distributionPlanQuery = useQuery({
    queryKey: [
      "distribution-plan",
      planId,
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
        .eq("id", planId)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
  const { data, error, isPending } = useQuery<PurchaseOrder>({
    queryKey: [
      "suppliers-reception",
      "components",
      "purchase-order-notes-form",
      { purchaseOrderId: purchaseOrderId },
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order")
        .select(
          `
          id,
          notes
        `,
        )
        .eq("id", purchaseOrderId)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
  const updateNotesMutation = useMutation({
    mutationFn: async ({
      purchaseOrderId,
      newNotes,
    }: {
      purchaseOrderId: string;
      newNotes: string | null;
    }) => {
      const { data, error } = await supabase
        .from("purchase_order")
        .update({
          notes: newNotes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseOrderId)
        .select()
        .single();
      if (error) throw error;
      return { data };
    },
    onSuccess: (data) => {
      form.setFieldValue("notes", data.data.notes);
      message.success("Notas actualizadas correctamente");
    },
    onError: (err) => {
      console.error("Error al actualizar notas:", err);
      message.error("No se pudo guardar las notas. Inténtalo de nuevo.");
    },
  });
  const handleSubmit = (values: { notes: string | null }) => {
    if (form.isFieldTouched("notes")) {
      updateNotesMutation.mutateAsync({
        purchaseOrderId: purchaseOrderId,
        newNotes: values.notes,
      });
    }
  };

  if (isPending || distributionPlanQuery.isPending) return "Loading...";
  if (error || distributionPlanQuery.error)
    return "An error has occurred: " + error?.message;
  if (
    distributionPlanQuery.data?.status === "cancelled" ||
    distributionPlanQuery.data?.status === "completed"
  ) {
    return <Typography.Text>{data.notes}</Typography.Text>;
  }
  return (
    <Form
      initialValues={{
        notes: data.notes,
      }}
      form={form}
      onFinish={handleSubmit}
      style={{ width: "100%" }}
    >
      <Form.Item name="notes" noStyle>
        <Input.TextArea
          disabled={updateNotesMutation.isPending}
          onBlur={() => {
            form.submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              form.submit();
            }
          }}
          placeholder="Notas de la orden (opcional)"
        />
      </Form.Item>
    </Form>
  );
};

export default PurchaseOrderNotesForm;
