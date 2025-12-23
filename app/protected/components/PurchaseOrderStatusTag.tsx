import { RestOutlined } from "@ant-design/icons";
import { Tag } from "antd";
type statuses =
  | "created"
  | "published"
  | "accepted"
  | "received"
  | "cancelled"
  | "rejected";
const label: Record<statuses, string> = {
  created: "Creado",
  published: "Publicada",
  accepted: "Aceptado",
  received: "Recibido",
  cancelled: "Cancelado",
  rejected: "Rechazado",
};

const color: Record<statuses, string> = {
  created: "gray",
  published: "orange",
  accepted: "blue",
  received: "green",
  cancelled: "red",
  rejected: "red",
};

const PurchaseOrderStatusTag = ({ status }: { status: statuses }) => {
  if (!label[status]) {
    return <Tag>{status}</Tag>;
  }
  return (
    <Tag color={color[status]} icon={<RestOutlined />}>
      {label[status]}
    </Tag>
  );
};

export default PurchaseOrderStatusTag;
