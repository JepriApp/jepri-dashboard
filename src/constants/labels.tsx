import React from "react";
import { Tag } from "antd";

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
  accepted: "Aceptada",
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

export const PurchaseOrderStatus = {
  colors: STATUS_COLOR_MAP,
  labels: STATUS_LABEL_MAP,
} as const;