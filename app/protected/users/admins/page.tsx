"use client";
import { Space, Table } from "antd";
import { listAdmins } from "./services/listAdmins";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import CreateAdminModal from "./components/createCustomerModal";

interface CustomerRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

function Index() {
  const supabase = createClient();

  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["users", "admins"],
    queryFn: async () => {
      const data = await listAdmins(supabase);
      return data;
    },
    staleTime: 300_000,
    retry: 1,
  });

  const columns = [
    { title: "Nombre", dataIndex: "profile_name", key: "profile_name" },
    { title: "Teléfono", dataIndex: "profile_phone", key: "profile_phone" },
    { title: "Email", dataIndex: "email", key: "email" },
    {
      title: "Fecha de creación",
      dataIndex: "auth_created_at",
      key: "auth_created_at",
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      title: "Estado del registro",
      dataIndex: "registration_status",
      key: "registration_status",
    },
    {
      title: "Última conexión",
      dataIndex: "last_sign_in_at",
      key: "last_sign_in_at",
      render: (value: string) =>
        value ? new Date(value).toLocaleString() : "Nunca",
    },
    { title: "Acciones", key: "actions" },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <CreateAdminModal
          onSuccess={async () => {
            await refetch();
          }}
        />
      </Space>
      <Table<CustomerRow>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading}
      />
    </div>
  );
}

export default Index;
