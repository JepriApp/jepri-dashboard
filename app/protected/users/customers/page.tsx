"use client";
import { Space, Table } from "antd";
import { listCustomers } from "./services/listCustomers";
import { createClient } from "@/lib/supabase/client";
import CreateSupplierModal from "../suppliers/components/createSupplierModal";
import { useQuery } from "@tanstack/react-query";
import CreateCustomerModal from "./components/createCustomerModal";

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
  } = useQuery<any[]>({
    queryKey: ["users", "customers"],
    queryFn: async () => {
      const data = await listCustomers(supabase);
      return data;
    },
    staleTime: 300_000,
    retry: 1,
  });

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    {
      title: "Tipo de Identificación",
      dataIndex: "identification_type",
      key: "identification_type",
    },
    {
      title: "Número de Identificación",
      dataIndex: "identification_number",
      key: "identification_number",
    },
    { title: "Contacto", dataIndex: "contact", key: "contact" },
    { title: "Teléfono", dataIndex: "phone", key: "phone" },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <CreateCustomerModal
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
