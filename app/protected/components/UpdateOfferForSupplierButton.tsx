import { EditFilled } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { App, Button, Form, InputNumber, Modal } from "antd";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

const UpdateOfferForSupplierButton = ({
  onSuccess,
  supplierId,
  supplierName,
  productId,
  productName,
  offerId,
  offerPrice,
}: {
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  offerId: string;
  offerPrice: number;
  onSuccess?: () => Promise<void>;
}) => {
  const supabase = createClient();
  const { message } = App.useApp();
  const [isOpen, setIsOpen] = useState(false);

  const saveOfferMutation = useMutation({
    mutationFn: async (values: { price: number }) => {
      const { error: updatingError } = await supabase
        .from("offer")
        .update({ available: false })
        .eq("id", offerId);
      if (updatingError) throw updatingError;

      const newOffer = {
        supplier_id: supplierId,
        product_id: productId,
        available: true,
        ...values,
      };
      const { error: insertError } = await supabase
        .from("offer")
        .insert(newOffer);
      if (insertError) throw insertError;
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
        type="link"
        icon={<EditFilled />}
        onClick={() => {
          setIsOpen(true);
        }}
      >
        Modificar
      </Button>
      <Modal
        title={`Modificando el precio de ${productName} del proveedor ${supplierName}`}
        open={isOpen}
        closable
        onCancel={() => setIsOpen(false)}
        maskClosable={false}
        destroyOnHidden
        footer={null}
      >
        <Form
          initialValues={{ price: offerPrice }}
          onFinish={saveOfferMutation.mutateAsync}
        >
          <Form.Item name={"price"} label="Precio" required>
            <InputNumber prefix="$" min={1} step={50} />
          </Form.Item>
          <Button htmlType="submit" loading={saveOfferMutation.isPending}>
            Guardar
          </Button>
        </Form>
      </Modal>
    </>
  );
};

export default UpdateOfferForSupplierButton;
