import { Tag } from "antd";
import React from "react";
const STATUS_COLOR_MAP: Record<string, string> = {
  created: "purple",
  published: "geekblue",
  accepted: "green",
  received: "blue",
  cancelled: "volcano",
  rejected: "red",
};
const STATUS_LABEL_MAP: Record<string, string> = {
  created: "Creada",
  published: "Publicada",
  accepted: "Aceptada por el proveedor",
  received: "Recibida",
  cancelled: "Cancelada",
  rejected: "Rechazada",
};
const PurchaseOrderStatusTag = ({ status }: { status: string | null }) => {
  const s = (status || "").toLowerCase();
  const color = STATUS_COLOR_MAP[s];
  const label = STATUS_LABEL_MAP[s] ?? "—";
  return <Tag color={color}>{label}</Tag>;
};

export default PurchaseOrderStatusTag;
