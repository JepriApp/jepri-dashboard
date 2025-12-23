"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { Button, Form, Input, message, Modal } from "antd";
import React, { useState } from "react";
interface createSupplierValues {
  name: string;
  contact: string;
  phone: string;
}
const CreateSupplierModal = ({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<createSupplierValues>();
  const supabase = createClient();

  const createSupplierMutation = useMutation({
    mutationFn: async ({ name, contact, phone }: createSupplierValues) => {
      // 1) Crear el usuario en Auth solo con teléfono
      const { data: createdUser, error: createErr } =
        await supabase.auth.signUp({
          phone,
          password: "default-password-jepri-1234",
          options: {
            channel: "sms",
          },
        });
      if (createErr) {
        throw new Error(
          `No se pudo crear el usuario Auth (teléfono): ${createErr.message}`
        );
      }
      const userId = createdUser?.user?.id;
      if (!userId) {
        throw new Error("No se obtuvo el ID del usuario creado en Auth.");
      }

      // 2) Actualizar el perfil (el trigger ya creó profiles con rol 'customer')
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          role: "supplier",
          name,
          phone,
        })
        .eq("id", userId);
      if (profileErr) {
        throw new Error(
          `No se pudo actualizar el perfil: ${profileErr.message}`
        );
      }

      // 3) Crear el registro en supplier
      const { data: supplierRow, error: supplierErr } = await supabase
        .from("supplier")
        .insert({
          user_id: userId,
          name,
          contact: contact,
          phone,
          bank_accounts: [], // mínimo viable
        })
        .select("id")
        .single();
      if (supplierErr) {
        throw new Error(`No se pudo crear el supplier: ${supplierErr.message}`);
      }

      return { userId: userId, supplierId: supplierRow.id };
      /*       const payload = {
        name: values.name,
        contact: values.contact || null,
        phone: values.phone || null,
      };
      const { error } = await supabase.from("supplier").insert([payload]);
      if (error) throw error; */
    },
    onSuccess: async () => {
      message.success("Proveedor creado");
      setCreateOpen(false);
      createForm.resetFields();
      await onSuccess?.();
    },
    onError: (err) => {
      console.error(err);
      // Mensaje amigable para email duplicado en auth
      const msg =
        typeof err?.message === "string" &&
        err.message.includes("duplicate key")
          ? "El email ya está en uso. Usa otro email."
          : err?.message || "Error al crear proveedor";
      message.error(msg, 20);
    },
  });
  return (
    <>
      <Button type="primary" onClick={() => setCreateOpen(true)}>
        Crear proveedor
      </Button>
      <Modal
        title="Crear proveedor"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        okText="Crear"
        confirmLoading={createSupplierMutation.isPending}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => createSupplierMutation.mutate(values)}
          initialValues={{
            phone: "+57",
          }}
        >
          <Form.Item
            name="name"
            label="Nombre"
            rules={[
              { required: true, message: "Ingresa el nombre del negocio" },
            ]}
          >
            <Input placeholder="Nombre del proveedor" />
          </Form.Item>
          <Form.Item
            name="contact"
            label="Contacto"
            rules={[
              { required: true, message: "Ingresa el nombre del proveedor" },
            ]}
          >
            <Input placeholder="Persona de contacto" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Teléfono"
            rules={[
              { required: true, message: "Ingresa el nombre del proveedor" },
              {
                pattern: new RegExp(/^\+\d{1,3}\d{1,14}$/),
                message:
                  "Ingresa un número de teléfono válido. Incluye el código del pais seguido del número de telefono sin espacios.",
              },
            ]}
          >
            <Input placeholder="Teléfono" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CreateSupplierModal;
