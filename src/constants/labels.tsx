import {
  AppleOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ShopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Tag } from "antd";

export const BRANCH_TYPE_LABELS = {
  individual: "Individual",
  company: "Empresa",
};
export const BRANCH_IS_ACTIVE_LABELS: Record<string, React.ReactNode> = {
  true: "Activo",
  false: (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <ExclamationCircleOutlined style={{ color: "orange" }} />
      Inactivo
    </div>
  ),
};
export const VENDOR_STATUS_TAG_PROPS = {
  created: {
    props: {},
    text: "Creado",
  },
  verified: {
    props: {
      icon: <CheckCircleOutlined />,
      color: "success",
    },
    text: "Verificado",
  },
  suspended: {
    props: {
      icon: <ExclamationCircleOutlined />,
      color: "warning",
    },
    text: "Suspendido",
  },
};

export const VENDOR_STATE_LABELS: Record<string, React.ReactNode> = {
  created: "Creado",
  verified: "Verificado",
  suspended: (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <ExclamationCircleOutlined style={{ color: "orange" }} />
      Suspendido
    </div>
  ),
};

export const VENDOR_IS_ACTIVE_LABELS: Record<string, React.ReactNode> = {
  true: "Activo",
  false: (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <ExclamationCircleOutlined style={{ color: "orange" }} />
      Inactivo
    </div>
  ),
};

export const VENDOR_IS_EMAIL_VERIFIED_LABELS: Record<string, React.ReactNode> =
  {
    true: "Verificado",
    false: (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <ExclamationCircleOutlined style={{ color: "orange" }} />
        No verificado
      </div>
    ),
  };

export const VENDOR_IS_HABEAS_DATA_LABELS: Record<string, React.ReactNode> = {
  true: "Confirmado",
  false: (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <ExclamationCircleOutlined style={{ color: "orange" }} />
      Pendiente
    </div>
  ),
};

export const PRODUCT_TYPE_TAG: Record<string, any> = {
  product: (
    <Tag bordered={false} color="geekblue">
      Producto
    </Tag>
  ),
  service: (
    <Tag bordered={false} color="magenta">
      Servicio
    </Tag>
  ),
};
export const PRODUCT_STATE_TAG: Record<string, any> = {
  available: (
    <Tag bordered={false} color="blue">
      Disponible
    </Tag>
  ),
  unavailable: (
    <Tag bordered={false} color="default">
      No disponible
    </Tag>
  ),
  out_of_stock: (
    <Tag bordered={false} color="red">
      Sin stock
    </Tag>
  ),
};

export const PRODUCT_CATEGORY_LABELS: Record<string, any> = {
  Confecciones: "Confecciones",
  Belleza: "Belleza",
  Gastronomía: "Gastronomía",
};
