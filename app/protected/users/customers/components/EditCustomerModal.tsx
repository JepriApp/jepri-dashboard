"use client";
import { createClient } from "@/lib/supabase/client";
import {
  CUSTOMER_PHONE_HELP,
  CUSTOMER_PHONE_REGEX,
  CUSTOMER_WHATSAPP_ID_HELP,
  CUSTOMER_WHATSAPP_ID_REGEX,
} from "@/lib/customerContactValidation";
import { useMutation } from "@tanstack/react-query";
import { Button, Form, Input, message, Modal, Select } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useState } from "react";

export interface EditableCustomer {
  id: string;
  name: string | null;
  contact: string | null;
  phone: string | null;
  whatsapp_id: string | null;
  identification_type: "CC" | "NIT" | "PPT" | "PEP" | null;
  identification_number: string | null;
}

interface EditCustomerValues {
  name: string;
  contact: string;
  phone: string;
  whatsapp_id?: string;
  identification_type: "CC" | "NIT" | "PPT" | "PEP";
  identification_number: string;
}

const EDITABLE_FIELDS = [
  "name",
  "contact",
  "phone",
  "whatsapp_id",
  "identification_type",
  "identification_number",
] as const;

const EditCustomerModal = ({
  customer,
  adminId,
  onSuccess,
}: {
  customer: EditableCustomer;
  adminId: string;
  onSuccess: () => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<EditCustomerValues>();
  const supabase = createClient();

  const mutation = useMutation({
    mutationFn: async (values: EditCustomerValues) => {
      const currentData: Record<string, string | null> = {};
      const requestedData: Record<string, string | null> = {};
      for (const field of EDITABLE_FIELDS) {
        const nextValue = values[field] ?? null;
        const currentValue = customer[field] ?? null;
        if (nextValue !== currentValue) {
          currentData[field] = currentValue;
          requestedData[field] = nextValue;
        }
      }
      if (Object.keys(requestedData).length === 0) {
        throw new Error("No hay cambios para solicitar.");
      }
      const { error } = await supabase.from("customer_change_request").insert({
        customer_id: customer.id,
        current_data: currentData,
        requested_data: requestedData,
        requested_by: adminId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      message.success("Solicitud de cambio creada, queda pendiente de aprobación");
      setOpen(false);
      await onSuccess();
    },
    onError: (err) => {
      message.error(err instanceof Error ? err.message : "No se pudo crear la solicitud");
    },
  });

  return (
    <>
      <Button
        size="small"
        icon={<EditOutlined />}
        onClick={() => {
          form.setFieldsValue({
            name: customer.name || "",
            contact: customer.contact || "",
            phone: customer.phone || "",
            whatsapp_id: customer.whatsapp_id || "",
            identification_type: customer.identification_type || undefined,
            identification_number: customer.identification_number || "",
          });
          setOpen(true);
        }}
      >
        Editar
      </Button>
      <Modal
        title={`Solicitar cambios — ${customer.name}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Enviar solicitud"
        confirmLoading={mutation.isPending}
      >
        <Form<EditCustomerValues>
          form={form}
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
        >
          <Form.Item
            name="name"
            label="Nombre"
            rules={[{ required: true, message: "Ingresa el nombre del negocio" }]}
          >
            <Input placeholder="Nombre del cliente" />
          </Form.Item>
          <Form.Item
            name="contact"
            label="Contacto"
            rules={[{ required: true, message: "Ingresa el nombre del cliente" }]}
          >
            <Input placeholder="Persona de contacto" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Teléfono"
            rules={[
              { required: true, message: "Ingresa el teléfono del cliente" },
              { pattern: CUSTOMER_PHONE_REGEX, message: CUSTOMER_PHONE_HELP },
            ]}
          >
            <Input placeholder="+573134567890" />
          </Form.Item>
          <Form.Item
            name="whatsapp_id"
            label="WhatsApp ID"
            tooltip="Número con código de país que se usa para escribirle al cliente por WhatsApp, o un id alfanumérico si el contacto no es un número de teléfono."
            rules={[
              { pattern: CUSTOMER_WHATSAPP_ID_REGEX, message: CUSTOMER_WHATSAPP_ID_HELP },
            ]}
          >
            <Input placeholder="+573134567890" />
          </Form.Item>
          <Form.Item
            name="identification_type"
            label="Tipo de documento"
            rules={[{ required: true, message: "Selecciona el tipo de documento" }]}
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
            rules={[{ required: true, message: "Ingresa el número de documento" }]}
          >
            <Input placeholder="Número de documento" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default EditCustomerModal;
