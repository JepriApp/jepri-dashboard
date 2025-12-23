import { Layout, Space } from "antd";
import { Suspense } from "react";
import SaleOrderFilter from "./components/SaleOrderFilter";
import SaleOrderTable from "./components/SaleOrderTable";

async function AssignSuppliersContent({ planId }: { planId: string }) {
  if (!planId) {
    return null;
  }
  return (
    <Layout style={{ backgroundColor: "transparent" }}>
      <Space
        style={{ marginBottom: "16px", flexDirection: "row-reverse" }}
      ></Space>

      <Layout hasSider style={{ backgroundColor: "transparent" }}>
        <SaleOrderFilter id={planId} />
        <Layout
          style={{
            marginLeft: "16px",
            backgroundColor: "transparent",
            display: "flex",
            flexDirection: "row",
            gap: "16px",
          }}
        ><SaleOrderTable id={planId}></SaleOrderTable></Layout>
      </Layout>
    </Layout>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: planId } = await params;
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AssignSuppliersContent planId={planId} />
    </Suspense>
  );
}
