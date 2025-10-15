import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement } from "react";
import { Table, Tag, Button, Space } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import Link from "next/link";
import { supabase } from "@/services/supabase.client";

type DistributionPlanRow = {
  id: string;
  plan_date: string;
  status: string;
  notes?: string | null;
  created_at?: string;
};

const DistributionPlansPage = () => {
  const { data = [], isLoading, refetch } = useQuery<DistributionPlanRow[]>({
    queryKey: ["distributionPlans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select("id, plan_date, status, notes, created_at")
        .order("plan_date", { ascending: false });
      if (error) throw error;
      return data as DistributionPlanRow[];
    },
    staleTime: 30_000,
  });

  const columns = [
    {
      title: "Fecha",
      dataIndex: "plan_date",
      key: "plan_date",
      render: (d: string) => dayjs(d).format("YYYY-MM-DD"),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (s: string) => <Tag>{s}</Tag>,
    },
    {
      title: "Notas",
      dataIndex: "notes",
      key: "notes",
    },
    {
      title: "Acciones",
      key: "actions",
      render: (_: unknown, record: DistributionPlanRow) => (
        <Space>
          <Link href={`/a/planning/${record.id}`}>Abrir editor</Link>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => refetch()}>Refrescar</Button>
        <Link href="/a/planning">Ir a crear plan</Link>
      </Space>
      <Table
        loading={isLoading}
        dataSource={data}
        columns={columns as any}
        rowKey="id"
      />
    </>
  );
};

export default DistributionPlansPage;

DistributionPlansPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};