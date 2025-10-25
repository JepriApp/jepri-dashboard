import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement } from "react";
import { Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { createClient as createSupabaseComponent } from "@/utils/supabase/component";
const supabase = createSupabaseComponent();

interface CustomerRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

const Index = () => {
  const { data = [], isLoading } = useQuery<CustomerRow[]>({
    queryKey: ["users", "customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer")
        .select(
          `
          id,
          name,
          phone,
          auth:user_id ( email )
        `
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.auth?.email,
        phone: c.phone,
      }));
    },
    staleTime: 300_000,
    retry: 1,
  });

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Teléfono", dataIndex: "phone", key: "phone" },
  ];

  return (
    <div>
      <Table rowKey="id" columns={columns} dataSource={data} loading={isLoading} />
    </div>
  );
};

export default Index;

Index.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};
