"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Form, Input, Typography } from "antd";

const PurchaseOrderNotesForm = ({ planId }: { planId: string }) => {
  const supabase = createClient();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const distributionPlanStatusQuery = useQuery({
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
  const { data, error, isPending } = useQuery({
    queryKey: [
      "distribution-plan",
      "components",
      "distribution-plan-notes-form",
      planId,
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
            id,
            notes
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

  const updateNotesMutation = useMutation({
    mutationFn: async ({
      planId,
      newNotes,
    }: {
      planId: string;
      newNotes: string | null;
    }) => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .update({
          notes: newNotes ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", planId)
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
        planId: planId,
        newNotes: values.notes,
      });
    }
  };

  if (isPending||distributionPlanStatusQuery.isPending) return "Loading...";
  if (error) return "An error has occurred: " + error?.message;
  if (
    distributionPlanStatusQuery.data?.status === "cancelled" ||
    distributionPlanStatusQuery.data?.status === "completed"
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
          placeholder="Notas del plan (opcional)"
        />
      </Form.Item>
    </Form>
  );
};

export default PurchaseOrderNotesForm;
