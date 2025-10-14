// 1. Primero, extrae el componente RenderChangeRequestInstance a un archivo separado
// Crea un nuevo archivo: src/components/pure/RenderChangeRequestInstance.tsx

import { Space, Typography } from "antd";
import { ChangeRequest } from "@/constants/models";
import dynamic from "next/dynamic";
import DisplayBranchInfo from "./DisplayBranchInfo";
import DisplayVendorInfo from "./DisplayVendorInfo";
import DisplayProductServiceInfo from "./DisplayProductServiceInfo";
const { Title } = Typography;

const NewBranchFormDynamic = dynamic(
  () =>
    import("@/components/forms/newBranchForm").then((mod) => mod.FormElement),
  { ssr: false }
);

const RenderChangeRequestInstance = (prop: {
  type: ChangeRequest["entityType"];
  value: ChangeRequest["requestedChanges"];
  vendorId: ChangeRequest["vendorId"];
}) => {
  const { type, value, vendorId } = prop;
  const { oldValues, newValues } = value;

  if (type === "STORE") {
    return (
      <Space>
        <Space direction="vertical" style={{ textAlign: "center" }}>
          <Title level={4}>Valores Antiguos</Title>
          <DisplayBranchInfo branch={oldValues as any} />
        </Space>
        <Space direction="vertical" style={{ textAlign: "center" }}>
          <Title level={4}>Valores Nuevos</Title>
          <DisplayBranchInfo branch={newValues as any} />
        </Space>
      </Space>
    );
  }
  if (type === "VENDOR_PROFILE") {
    return (
      <Space>
        <Space direction="vertical" style={{ textAlign: "center" }}>
          <Title level={4}>Valores Antiguos</Title>
          <DisplayVendorInfo vendor={oldValues as any} />
        </Space>
        <Space direction="vertical" style={{ textAlign: "center" }}>
          <Title level={4}>Valores Nuevos</Title>
          <DisplayVendorInfo vendor={newValues as any} />
        </Space>
      </Space>
    );
  }
  if (type === "PRODUCT_AND_SERVICE") {
    return (
      <Space>
        <Space direction="vertical" style={{ textAlign: "center" }}>
          <Title level={4}>Valores Antiguos</Title>
          <DisplayProductServiceInfo productService={oldValues as any} />
        </Space>
        <Space direction="vertical" style={{ textAlign: "center" }}>
          <Title level={4}>Valores Nuevos</Title>
          <DisplayProductServiceInfo productService={newValues as any} />
        </Space>
      </Space>
    );
  }

  return null;
};

export default RenderChangeRequestInstance;
