import { Tag } from "antd";

const label: Record<
  "planned" | "preparing" | "in_progress" | "completed" | "cancelled",
  string
> = {
  planned: "Planeado",
  preparing: "En preparación",
  in_progress: "En progreso",
  completed: "Completado",
  cancelled: "Cancelado",
};

const color: Record<
  "planned" | "preparing" | "in_progress" | "completed" | "cancelled",
  string
> = {
  planned: "gray",
  preparing: "orange",
  in_progress: "blue",
  completed: "green",
  cancelled: "red",
};

const DistributionPlanStatusTag = ({
  status,
}: {
  status: "planned" | "preparing" | "in_progress" | "completed" | "cancelled";
}) => {
  if (!label[status]) {
    return <Tag>{status}</Tag>;
  }
  return <Tag color={color[status]}>{label[status]}</Tag>;
};

export default DistributionPlanStatusTag;
