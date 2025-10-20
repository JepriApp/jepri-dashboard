import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement } from "react";
import { Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/supabase.client";

interface SupplierRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

const Index = () => {
  const { data = [], isLoading } = useQuery<SupplierRow[]>({
    queryKey: ["users", "suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier")
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
      return (data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.auth?.email,
        phone: s.phone,
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