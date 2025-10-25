import React from "react";
import { useRouter } from "next/router";
import { Layout, Card, Space, Tag } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { createClient as createSupabaseComponent } from "@/utils/supabase/component";
const supabase = createSupabaseComponent();

export const SIDER_WIDTH = {
  COLLAPSED: 80,
  EXPANDED: 200,
} as const;

export const SCREEN_BREAKPOINTS = {
  MOBILE: 768,
} as const;

interface DashboardLayoutProps {
  children: React.ReactNode;
  backButton?: boolean;
  noStyle?: boolean;
}
function DistributionPlanLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const { id } = router.query;
  const lateralMenuItems = [
    {
      key: `/a/distribution-plans/${id}`,
      icon: React.createElement(HomeOutlined),
      label: "Inicio",
      children: undefined,
    },
    {
      key: `/a/distribution-plans/${id}/assign-suppliers`,
      icon: React.createElement(HomeOutlined),
      label: "Asignación de Proveedores",
      children: undefined,
    },
    {
      key: `/a/distribution-plans/${id}/suppliers-reception`,
      icon: React.createElement(HomeOutlined),
      label: "Recepción de Proveedores",
      children: undefined,
    },
    {
      key: `/a/distribution-plans/${id}/sale-orders-delivery`,
      icon: React.createElement(HomeOutlined),
      label: "Domicilio de Pedidos",
      disabled: true,
      children: undefined,
    },
    {
      key: `/a/distribution-plans/${id}/finance`,
      icon: React.createElement(HomeOutlined),
      label: "Finanzas",
      disabled: true,
      children: undefined,
    },
  ];
  const { data } = useQuery({
    queryKey: ["distributionPlan", "forCardTitle", id],
    enabled: !!id,
    queryFn: async () => {
      const { data: plan, error: planErr } = await supabase
        .from("distribution_plan")
        .select("id, plan_date, status, plan_code")
        .eq("id", id)
        .single();
      if (planErr) throw planErr;

      return { plan };
    },
  });
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
          <Space split="~">
            <p>Plan {data?.plan?.plan_code}</p>
            <p>{data?.plan?.plan_date}</p>
            <Tag>{data?.plan?.status}</Tag>
          </Space>
        }
        tabList={lateralMenuItems}
        activeTabKey={router.asPath.split("?")[0]}
        onTabChange={(key) => router.push(key)}
      >
        {children}
      </Card>
    </Layout>
  );
}

export default DistributionPlanLayout;
