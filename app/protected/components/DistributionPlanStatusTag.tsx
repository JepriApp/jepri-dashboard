import { TruckOutlined } from "@ant-design/icons";
import { Tag } from "antd";
type statuses =
  | "planned"
  | "preparing"
  | "in_progress"
  | "completed"
  | "cancelled";
const label: Record<statuses, string> = {
  planned: "Planeado",
  preparing: "En preparación",
  in_progress: "En progreso",
  completed: "Completado",
  cancelled: "Cancelado",
};

const color: Record<statuses, string> = {
  planned: "gray",
  preparing: "orange",
  in_progress: "blue",
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
