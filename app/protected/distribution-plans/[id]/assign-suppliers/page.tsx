import { Layout, Space } from "antd";
import SaleOrderFilter from "./components/SaleOrderFilter";
import SaleOrderTable from "./components/SaleOrderTable";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: planId } = await params
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
