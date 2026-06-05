import { PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Form, InputNumber, Modal, Select } from "antd";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { listSuppliers } from "../../services/listSuppliers";

const CreateNewOfferForProductButton = ({
  productId,
  productName,
  onSuccess,
  supplierIdsOfExistingOffers,
}: {
  productId: string;
  productName: string;
  onSuccess?: () => Promise<void>;
  supplierIdsOfExistingOffers: string[];
}) => {
  const supabase = createClient();
  const { message } = App.useApp();
  const [isOpen, setIsOpen] = useState(false);
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["users", "suppliers"],
    queryFn: async () => {
      const data = await listSuppliers(supabase);
      return data;
    },
    staleTime: 60_000,
  });
  const saveOffersMutation = useMutation({
    mutationFn: async (values: { productId: string; price: number }) => {
      const newOffer = {
        product_id: productId,
        ...values,
      };
      const { error } = await supabase.from("offer").insert(newOffer);
      if (error) throw error;
    },
    onSuccess: async () => {
      message.success("Proveedores disponibles actualizados");
      setIsOpen(false);
      await onSuccess?.();
    },
    onError: (err) => {
      console.error(err);
      message.error(
        err?.message || "Error al actualizar los proveedores disponibles",
      );
    },
  });
  return (
    <>
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => {
          setIsOpen(true);
        }}
        block
        disabled={isLoading}
      >
        Agregar un nuevo proveedor
      </Button>
      <Modal
        title={"Creación de un nuevo proveedor para el producto " + productName}
        open={isOpen}
        closable
        onCancel={() => setIsOpen(false)}
        maskClosable={false}
        destroyOnHidden
        footer={null}
      >
        <Form
          initialValues={{ price: 1 }}
          onFinish={saveOffersMutation.mutateAsync}
        >
          <Form.Item name={"supplier_id"} label="Proveedor" required>
            <Select
              showSearch={{
                optionFilterProp: "label",
                filterSort: (optionA, optionB) =>
                  (optionA?.label ?? "")
                    .toLowerCase()
                    .localeCompare((optionB?.label ?? "").toLowerCase()),
              }}
              options={suppliers
                .filter(
                  (supplier) =>
                    !supplierIdsOfExistingOffers.includes(supplier.id),
                )
                .map((supplier) => {
                  return {
                    value: supplier.id,
                    label: supplier.name,
                  };
                })}
            />
          </Form.Item>
          <Form.Item name={"price"} label="Precio" required>
            <InputNumber prefix="$" min={1} step={100} />
          </Form.Item>
          <Button htmlType="submit">Guardar</Button>
        </Form>
      </Modal>
    </>
  );
};

export default CreateNewOfferForProductButton;
