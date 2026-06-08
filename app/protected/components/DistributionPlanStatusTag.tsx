import { TruckOutlined } from "@ant-design/icons";
import { Tag } from "antd";
type statuses =
  | "planned"
  | "preparing"
  | "in_progress"
  | "invoicing"
  | "completed"
  | "cancelled";
const label: Record<statuses, string> = {
  planned: "Planeado",
  preparing: "En preparación",
  in_progress: "En progreso",
  invoicing: "Procesando cuentas",
  completed: "Completado",
  cancelled: "Cancelado",
};

const color: Record<statuses, string> = {
  planned: "gray",
  preparing: "orange",
  in_progress: "blue",
  invoicing: "cyan",
  completed: "green",
  cancelled: "red",
};

const DistributionPlanStatusTag = ({ status }: { status?: statuses }) => {
  if (!status) return null;
  if (!label[status]) {
    return <Tag>{status}</Tag>;
  }
  return (
    <Tag color={color[status]} icon={<TruckOutlined />}>
      {label[status]}
    </Tag>
  );
};

export default DistributionPlanStatusTag;
