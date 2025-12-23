"use client";
import { Table, Tag, Space } from "antd";
import dayjs from "dayjs";
import Link from "next/link";

export type DistributionPlanRow = {
  id: string;
  plan_date: string;
  status: string;
  notes?: string | null;
  plan_code: string;
  created_at?: string;
};

export default function DistributionPlansTable({
  data,
}: {
  data: DistributionPlanRow[];
}) {
  const columns = [
    {
      title: "# Operación",
      dataIndex: "plan_code",
      key: "plan_code",
    },
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
          <Link
            href={`/protected/distribution-plans/${record.id}?plan_date=${record.plan_date}&plan_code=${record.plan_code}`}
          >
            Abrir editor
          </Link>
        </Space>
      ),
    },
  ];

  return <Table dataSource={data} columns={columns} rowKey="id" />;
}
