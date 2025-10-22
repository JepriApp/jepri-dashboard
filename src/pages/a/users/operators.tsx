import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useState } from "react";
import { Table, Typography, Button, Space, Modal, Form, Input, Switch, Tag, App } from "antd";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/services/supabase.client";
import { PlusOutlined } from "@ant-design/icons";

interface OperatorRow {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
}

const { Text } = Typography;

// Utilidad: hash SHA-256 para password (simple, sin sal)
async function hashPasswordSHA256(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const Index = () => {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editingOperator, setEditingOperator] = useState<OperatorRow | null>(null);

  const { data = [], isLoading, refetch } = useQuery<OperatorRow[]>({
    queryKey: ["users", "operators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operator")
        .select(
          `
          id,
          name,
          phone,
          user_id,
          auth:user_id ( email, is_active )
        `
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []).map((o: any) => ({
        id: o.id,
        user_id: o.user_id,
        name: o.name,
        email: o.auth?.email,
        phone: o.phone,
        is_active: o.auth?.is_active,
      }));
    },
    staleTime: 300_000,
    retry: 1,
  });

  const openEditModal = (record: OperatorRow) => {
    setEditingOperator(record);
    editForm.setFieldsValue({
      name: record.name,
      phone: record.phone || undefined,
      email: record.email || undefined,
      is_active: typeof record.is_active === "boolean" ? record.is_active : true,
    });
    setEditOpen(true);
  };

  const updateOperatorMutation = useMutation({
    mutationFn: async (values: any) => {
      if (!editingOperator) throw new Error("No hay operador seleccionado");
      const payload: any = {
        name: values.name,
        phone: values.phone || null,
      };
      const { error } = await supabase
        .from("operator")
        .update(payload)
        .eq("id", editingOperator.id);
      if (error) throw error;
      if (typeof values.is_active === "boolean" && editingOperator.user_id) {
        const { error: authErr } = await supabase
          .from("auth")
          .update({ is_active: values.is_active })
          .eq("id", editingOperator.user_id);
        if (authErr) throw authErr;
      }
    },
    onSuccess: async () => {
      message.success("Operador actualizado");
      setEditOpen(false);
      setEditingOperator(null);
      editForm.resetFields();
      await refetch();
    },
    onError: (err: any) => {
      console.error(err);
      message.error(err?.message || "Error al actualizar operador");
    },
  });

  const createOperatorMutation = useMutation({
    mutationFn: async (values: any) => {
      // Crear usuario en auth
      const passwordHash = await hashPasswordSHA256(values.password);
      const { data: authRow, error: authErr } = await supabase
        .from("auth")
        .insert([{ 
          email: values.email,
          password_hash: passwordHash,
          role: "operator",
          is_active: true,
        }])
        .select("id")
        .single();
      if (authErr) throw authErr;

      // Crear operador con referencia a auth.id
      const payload = { 
        name: values.name, 
        phone: values.phone || null,
        user_id: authRow.id,
      };
      const { error } = await supabase.from("operator").insert([payload]);
      if (error) throw error;
    },
    onSuccess: async () => {
      message.success("Operador creado");
      setCreateOpen(false);
      createForm.resetFields();
      await refetch();
    },
    onError: (err: any) => {
      console.error(err);
      const msg = typeof err?.message === "string" && err.message.includes("duplicate key")
        ? "El email ya está en uso. Usa otro email."
        : (err?.message || "Error al crear operador");
      message.error(msg);
    },
  });

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Teléfono", dataIndex: "phone", key: "phone" },
    {
      title: "Estado",
      dataIndex: "is_active",
      key: "is_active",
      render: (val: boolean | undefined) => (
        val === true ? <Tag color="green">Activo</Tag> : <Tag color="red">Inactivo</Tag>
      ),
    },
    {
      title: "Acciones",
      key: "actions",
      width: 240,
      render: (_: any, record: OperatorRow) => (
        <Space>
          <Button onClick={() => openEditModal(record)}>Editar operador</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          Crear operador
        </Button>
      </Space>

      <Table rowKey="id" columns={columns} dataSource={data} loading={isLoading} />

      {/* Modal crear operador */}
      <Modal
        title="Crear operador"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        okText="Crear"
        confirmLoading={createOperatorMutation.isPending}
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => createOperatorMutation.mutate(values)}>
          <Form.Item
            name="name"
            label="Nombre"
            rules={[{ required: true, message: "Ingresa el nombre del operador" }]}
          >
            <Input placeholder="Nombre del operador" />
          </Form.Item>
          <Form.Item name="phone" label="Teléfono">
            <Input placeholder="Teléfono (opcional)" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email de acceso"
            rules={[
              { required: true, message: "Ingresa el email" },
              { type: "email", message: "Email inválido" },
            ]}
          >
            <Input placeholder="email@ejemplo.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Contraseña inicial"
            rules={[
              { required: true, message: "Ingresa una contraseña" },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  if (value.length < 6) {
                    return Promise.reject(new Error("La contraseña debe tener al menos 6 caracteres"));
                  }
                  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
                    return Promise.reject(new Error("La contraseña debe incluir letras y números"));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password placeholder="Contraseña" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal editar operador */}
      <Modal
        title="Editar operador"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingOperator(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        okText="Guardar"
        confirmLoading={updateOperatorMutation.isPending}
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => updateOperatorMutation.mutate(values)}>
          <Form.Item
            name="name"
            label="Nombre"
            rules={[{ required: true, message: "Ingresa el nombre del operador" }]}
          >
            <Input placeholder="Nombre del operador" />
          </Form.Item>
          <Form.Item name="phone" label="Teléfono">
            <Input placeholder="Teléfono (opcional)" />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="Activo"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input disabled placeholder="Email (inmutable)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Index;

Index.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};