"use client";
import { createClient } from "@/lib/supabase/client";
import { HomeOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Card, Space, Layout } from "antd";
import { useParams, usePathname, useRouter } from "next/navigation";
import React from "react";
import DistributionPlanStatusTag from "../../components/DistributionPlanStatusTag";

export default function DistributionPlanEditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const params = useParams();
  const path = usePathname();
  const router = useRouter();
  const planId = params.id as string | undefined;
  const supabase = createClient();
  const { data } = useQuery({
    queryKey: ["distribution-plan", "forCardTitle", planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data: plan, error: planErr } = await supabase
        .from("distribution_plan")
        .select("id, plan_date, status, plan_code")
        .eq("id", planId!)
        .single();
      if (planErr) throw planErr;

      return { plan };
    },
  });
  const lateralMenuItems = [
    {
      key: `/`,
      icon: React.createElement(HomeOutlined),
      label: "Inicio",
      children: undefined,
    },
    {
      key: `/assign-suppliers`,
      icon: React.createElement(HomeOutlined),
      label: "Asignación de Proveedores",
      children: undefined,
    },
    {
      key: `/suppliers-reception`,
      icon: React.createElement(HomeOutlined),
      label: "Recepción de Proveedores",
      children: undefined,
    },
    {
      key: `/finance`,
      icon: React.createElement(HomeOutlined),
      label: "Finanzas",
      children: undefined,
    },
    {
      key: `/sale-orders-delivery`,
      icon: React.createElement(HomeOutlined),
      label: "Domicilio de Pedidos",
      disabled: true,
      children: undefined,
    },
  ];
  const availableKeys = lateralMenuItems.map((item) => item.key);
  const activeKey = "/" + path.split("/").at(4)?.split("?")[0] || "";
  return (
    <Layout
      style={{
        padding: "16px",
        width: "100%",
      }}
    >
      <Card
        style={{ width: "100%", overflow: "auto" }}
        title={
          <Space separator="~">
            <p>Plan {data?.plan?.plan_code}</p>
            <p>{data?.plan?.plan_date}</p>
            <DistributionPlanStatusTag status={data?.plan?.status} />
          </Space>
        }
        tabList={lateralMenuItems}
        activeTabKey={availableKeys.includes(activeKey) ? activeKey : "/"}
        onTabChange={(key) =>
          router.push(`/protected/distribution-plans/${planId}/${key}`)
        }
      >
        {children}
      </Card>
    </Layout>
  );
}
