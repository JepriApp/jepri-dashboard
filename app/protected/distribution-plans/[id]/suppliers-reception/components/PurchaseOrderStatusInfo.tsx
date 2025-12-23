import { InfoCircleOutlined } from "@ant-design/icons";
import { Space, Typography } from "antd";
import React from "react";
const STATUS_INFO_MAP: Record<string, string> = {
  created: "Esta información aun no es pública para el proveedor",
  published: "Información publicada. Esperando que el proveedor la acepte.",
  accepted: "Ya puedes recibir la mercancía en bodega",
  received: "Ya ha sido diligenciada la recepción de la mercancia",
  cancelled: "",
  rejected: "",
};
const PurchaseOrderStatusInfo = ({status}: {status: string | null}) => {
  const s = (status || "").toLowerCase();
  const label = STATUS_INFO_MAP[s] ?? "—";
  return (
    <Space>
      <InfoCircleOutlined />
      <Typography.Text type="secondary">{label}</Typography.Text>
    </Space>
  );
};

export default PurchaseOrderStatusInfo;
