import { ShoppingCartOutlined } from "@ant-design/icons";
import { Tag } from "antd";
type statuses =
  | "pending"
  | "processing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";
const label: Record<
  statuses,
  string
> = {
  pending: "Pendiente",
  processing: "En proceso",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const color: Record<
  statuses,
  string
> = {
  pending: "gray",
  processing: "orange",
  out_for_delivery: "blue",
  delivered: "green",
  cancelled: "red",
};

const SaleOrderStatusTag = ({
  status,
}: {
  status:statuses;
}) => {
  if (!label[status]) {
    return <Tag>{status}</Tag>;
  }
  return (
    <Tag color={color[status]} icon={<ShoppingCartOutlined />}>
      {label[status]}
    </Tag>
  );
};

export default SaleOrderStatusTag;
