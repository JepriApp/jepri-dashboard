"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { Button, Form, Input, message, Modal, Select } from "antd";
import React, { useState } from "react";

interface CreateCustomerValues {
  name: string;
  contact: string;
  phone: string;
  identification_type: "CC" | "NIT" | "PPT" | "PEP";
  identification_number: string;

}
const CreateAdminModal = ({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateCustomerValues>();
  const supabase = createClient();

  const createCustomerMutation = useMutation({
    mutationFn: async ({ name, contact, phone, identification_type, identification_number }: CreateCustomerValues) => {
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
          `No se pudo crear el usuario Auth (teléfono): ${createErr.message}`,
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
          role: "customer",
          name,
          phone,
        })
        .eq("id", userId);
      if (profileErr) {
        throw new Error(
          `No se pudo actualizar el perfil: ${profileErr.message}`,
        );
      }

      // 3) Crear el registro en customer
      const { data: customerRow, error: customerErr } = await supabase
        .from("customer")
        .insert({
          user_id: userId,
          name,
          contact,
          phone,
          identification_type,
          identification_number,
        })
        .select("id")
        .single();
      if (customerErr) {
        throw new Error(`No se pudo crear el customer: ${customerErr.message}`);
      }

      return { userId: userId, customerId: customerRow.id };
      /*       const payload = {
        name: values.name,
        contact: values.contact || null,
        phone: values.phone || null,
      };
      const { error } = await supabase.from("supplier").insert([payload]);
      if (error) throw error; */
    },
    onSuccess: async () => {
      message.success("Cliente creado");
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
          : err?.message || "Error al crear cliente";
      message.error(msg, 20);
    },
  });
  return (
    <>
      <Button type="primary" onClick={() => setCreateOpen(true)}>
        Crear administrador
      </Button>
      <Modal
        title="Crear administrador"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        okText="Crear"
        confirmLoading={createCustomerMutation.isPending}
      >
        <Form<CreateCustomerValues>
          form={createForm}
          layout="vertical"
          onFinish={(values) => createCustomerMutation.mutate(values)}
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
            <Input placeholder="Nombre del cliente" />
          </Form.Item>
          <Form.Item
            name="contact"
            label="Contacto"
            rules={[
              { required: true, message: "Ingresa el nombre del cliente" },
            ]}
          >
            <Input placeholder="Persona de contacto" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Teléfono"
            rules={[
              { required: true, message: "Ingresa el teléfono del cliente" },
              {
                pattern: new RegExp(/^\+\d{1,3}\d{1,14}$/),
                message:
                  "Ingresa un número de teléfono válido. Incluye el código del pais seguido del número de telefono sin espacios.",
              },
            ]}
          >
            <Input placeholder="Teléfono" />
          </Form.Item>
          <Form.Item
            name="identification_type"
            label="Tipo de documento"
            rules={[
              { required: true, message: "Selecciona el tipo de documento" },
            ]}
          >
            <Select
              placeholder="Tipo de documento"
              options={[
                { label: "CC", value: "CC" },
                { label: "NIT", value: "NIT" },
                { label: "PPT", value: "PPT" },
                { label: "PEP", value: "PEP" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="identification_number"
            label="Número de documento"
            rules={[
              { required: true, message: "Ingresa el número de documento" },
            ]}
          >
            <Input placeholder="Número de documento" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CreateAdminModal;
