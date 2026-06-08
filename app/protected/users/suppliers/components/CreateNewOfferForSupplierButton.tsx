import { PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Form, InputNumber, Modal, Select } from "antd";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { ProductMinimal } from "../page";
import { listProducts } from "../services/listProducts";

const CreateNewOfferForSupplierButton = ({
  onSuccess,
  supplierId,
  supplierName,
  productIdsOfExistingOffers,
}: {
  supplierId: string;
  supplierName: string;
  onSuccess?: () => Promise<void>;
  productIdsOfExistingOffers: string[];
}) => {
  const supabase = createClient();
  const { message } = App.useApp();
  const [isOpen, setIsOpen] = useState(false);
  const { data: products = [], isLoading: productsLoading } = useQuery<
    ProductMinimal[]
  >({
    queryKey: ["products-minimal"],
    queryFn: async () => {
      const data = await listProducts(supabase);
      return data;
    },
    staleTime: 60_000,
  });
  const saveOffersMutation = useMutation({
    mutationFn: async (values: { productId: string; price: number }) => {
      const newOffer = {
        supplier_id: supplierId,
        ...values,
      };
      const { error } = await supabase.from("offer").insert(newOffer);
      if (error) throw error;
    },
    onSuccess: async () => {
      message.success("Productos ofrecidos actualizados");
      setIsOpen(false);
      await onSuccess?.();
    },
    onError: (err) => {
      console.error(err);
      message.error(
        err?.message || "Error al actualizar las productos ofrecidos",
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
        disabled={productsLoading}
      >
        Agregar un nuevo producto
      </Button>
      <Modal
        title={"Creación de un nuevo producto para " + supplierName}
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
          <Form.Item name={"product_id"} label="Producto" required>
            <Select
              showSearch={{
                optionFilterProp: "label",
                filterSort: (optionA, optionB) =>
                  (optionA?.label ?? "")
                    .toLowerCase()
                    .localeCompare((optionB?.label ?? "").toLowerCase()),
              }}
              options={products
                .filter(
                  (product) => !productIdsOfExistingOffers.includes(product.id),
                )
                .map((product) => {
                  return {
                    value: product.id,
                    label: product.name,
                  };
                })}
            />
          </Form.Item>
          <Form.Item name={"price"} label="Precio" required>
            <InputNumber prefix="$" min={1} step={50} />
          </Form.Item>
          <Button htmlType="submit">Guardar</Button>
        </Form>
      </Modal>
    </>
  );
};

export default CreateNewOfferForSupplierButton;
