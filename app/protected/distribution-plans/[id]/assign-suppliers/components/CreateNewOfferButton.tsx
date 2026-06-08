import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button, Form, InputNumber, message, Modal, Select } from "antd";
import { useState } from "react";

const CreateNewOfferButton = ({
  productId,
  existingSuppliers,
  onSuccess,
}: {
  productId: string;
  existingSuppliers: string[];
  onSuccess?: () => Promise<void>;
}) => {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: [
      "distribution-plan",
      "components",
      "create-new-offer-button",
      {
        productId,
      },
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier")
        .select(
          `
          id,
          name
        `
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
  const saveOffersMutation = useMutation({
    mutationFn: async (values: {
      supplier_id: string;
      productId: string;
      price: number;
    }) => {
      const base = {
        supplier_id: values.supplier_id,
        price: Number(values.price ?? 0),
        available: true,
        product_id: productId,
      };
      const { data, error } = await supabase
        .from("offer")
        .insert(base)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      message.success("Proveedor agregado correctamente");
      await onSuccess?.();
      setOpen(false);
    },
    onError: (err: Error) => {
      console.error(err);
      message.error(err?.message || "Error al actualizar las catálogos");
    },
  });
  const openModal = () => {
    setOpen(true);
  };
  if (!productId || !existingSuppliers) return null;
  return (
    <>
      <Button onClick={openModal} block>
        Agregar nuevo proveedor
      </Button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        styles={{ body: { paddingTop: "24px" } }}
        title="Agregar nuevo proveedor"
      >
        <Form
          onFinish={async (values) => {
            await saveOffersMutation.mutateAsync(values);
          }}
          initialValues={{
            price: 1,
          }}
        >
          <Form.Item
            name="supplier_id"
            label="Proveedor"
            rules={[{ required: true }]}
          >
            <Select
              options={data
                .filter((s) => !existingSuppliers.includes(s.id))
                .map(({ id, name }) => ({
                  label: name,
                  value: id,
                }))}
              loading={isLoading}
              showSearch={{
                filterOption: (input, option) =>
                  (option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase()),
              }}
            />
          </Form.Item>
          <Form.Item name="price" label="Precio" rules={[{ required: true }]}>
            <InputNumber min={0} prefix="$" step={50} />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={saveOffersMutation.isPending}
            >
              Guardar
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CreateNewOfferButton;
