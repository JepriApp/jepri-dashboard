import React from "react";
import { Space, Tag, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

// Mapa de colores por estado de la orden de compra
const STATUS_COLOR_MAP: Record<string, string> = {
  created: "purple",
  published: "geekblue",
  accepted: "green",
  received: "blue",
  cancelled: "volcano",
  rejected: "red",
};

// Mapa de etiquetas (ES) por estado
const STATUS_LABEL_MAP: Record<string, string> = {
  created: "Creada",
  published: "Publicada",
  accepted: "Aceptada por el proveedor",
  received: "Recibida",
  cancelled: "Cancelada",
  rejected: "Rechazada",
};

/**
 * Renderiza un Tag de Ant Design con color y etiqueta según el estado
 * de una purchase order.
 */
export const renderPurchaseOrderStatusTag = (status?: string | null) => {
  const s = (status || "").toLowerCase();
  const color = STATUS_COLOR_MAP[s];
  const label = STATUS_LABEL_MAP[s] ?? "—";
  return <Tag color={color}>{label}</Tag>;
};
const STATUS_INFO_MAP: Record<string, string> = {
  created: "Esta información aun no es pública para el proveedor",
  published: "Información publicada. Esperando que el proveedor la acepte.",
  accepted: "Ya puedes recibir la mercancía en bodega",
  received: "Ya ha sido diligenciada la recepción de la mercancia",
  cancelled: "",
  rejected: "",
};
export const renderPurchaseOrderStateInfo = (status?: string | null) => {
  const s = (status || "").toLowerCase();
  const label = STATUS_INFO_MAP[s] ?? "—";
  return (
    <Space>
      <InfoCircleOutlined />
      <Typography.Text type="secondary">{label}</Typography.Text>
    </Space>
  );
};
export const PurchaseOrderStatus = {
  colors: STATUS_COLOR_MAP,
  labels: STATUS_LABEL_MAP,
} as const;