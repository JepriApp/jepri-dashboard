"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { Button, Form, Input, InputNumber, message, Modal, Select } from "antd";
import React, { useState } from "react";
type ProductUnit = "lb" | "kg" | "unidad" | "atado";
interface NewProduct {
  name: string;
  unit: ProductUnit;
  description?: string;
  reference_price?: number;
  siigo_id: string;
  main_photo?: string;
}
const CreateProduct = ({ onSubmit }: { onSubmit: () => void }) => {
  const supabase = createClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const createProductMutation = useMutation({
    mutationFn: async (values: NewProduct) => {
      const payload = {
        name: (values.name || "").trim(),
        unit: values.unit as "lb" | "kg" | "unidad" | "atado",
        description: values.description || null,
        reference_price:
          values.reference_price !== undefined &&
          values.reference_price !== null
            ? Number(values.reference_price)
            : null,
        main_photo: values.main_photo || null,
        siigo_id: (values.siigo_id || "").trim(),
      };
      const { data, error } = await supabase
        .from("product")
        .insert([payload])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      message.success("Producto creado exitosamente");
      setCreateOpen(false);
      form.resetFields();
      await onSubmit?.();
    },
    onError: (err) => {
      console.error(err);
      message.error(err?.message || "Error al crear el producto");
    },
  });
  return (
    <>
      <Button type="primary" onClick={() => setCreateOpen(true)}>
        Nuevo producto
      </Button>
      <Modal
        title="Nuevo producto"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createProductMutation.isPending}
        destroyOnHidden
      >
        <Form<NewProduct>
          form={form}
          layout="vertical"
          onFinish={(values) => createProductMutation.mutate(values)}
        >
          <Form.Item
            name="name"
            label="Nombre"
            rules={[{ required: true, message: "Ingresa el nombre" }]}
          >
            <Input placeholder="Nombre del producto" />
          </Form.Item>
          <Form.Item
            name="unit"
            label="Unidad"
            rules={[{ required: true, message: "Selecciona la unidad" }]}
          >
            <Select
              placeholder="Unidad"
              options={[
                { value: "lb", label: "lb" },
                { value: "kg", label: "kg" },
                { value: "unidad", label: "unidad" },
              ]}
            />
          </Form.Item>
          <Form.Item name="siigo_id" label="Id en Siigo">
            <Input placeholder="Id en Siigo" />
          </Form.Item>
          <Form.Item name="reference_price" label="Precio de referencia">
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="0.00"
              step={50}
            />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input.TextArea rows={3} placeholder="Descripción del producto" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CreateProduct;
