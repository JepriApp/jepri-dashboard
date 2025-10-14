import {
  AppleOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ShopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  BranchStateType,
  ChangeRequestStatusOptionsType,
  entityTypeOptionsType,
  ServiceOrderOrderStatusType,
  ServiceOrderPaymentMethodType,
  ServiceOrderPaymentStatusType,
  VendorGendersType,
} from "./models";
import { Tag } from "antd";

export const BRANCH_TYPE_LABELS = {
  individual: "Individual",
  company: "Empresa",
};
export const BRANCH_STATE_LABELS: Record<BranchStateType[number], string> = {
  active: "Activo",
  inactive: "Inactivo",
  temporarily_closed: "Cerrado temporalmente",
  maintenance: "En mantenimiento",
  created: "Creado",
  verified: "Verificado",
  suspended: "Suspendido",
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

export const SERVICE_ORDER_ORDER_STATUS_LABELS: Record<
  ServiceOrderOrderStatusType[number],
  any
> = {
  received: <Tag color="yellow">Recibido</Tag>,
  preparing: <Tag color="orange">En preparación</Tag>,
  shipped: <Tag color="green">En ruta</Tag>,
  delivered: <Tag color="gray">Entregado</Tag>,
  cancelled: <Tag color="red">Cancelado</Tag>,
};

export const SERVICE_ORDER_PAYMENT_STATUS_LABELS: Record<
  ServiceOrderPaymentStatusType[number],
  any
> = {
  pending: <Tag>Pendiente</Tag>,
  paid: <Tag color="green">Pagado</Tag>,
  failed: <Tag color="red">Fallido</Tag>,
  refunded: <Tag color="blue">Reembolsado</Tag>,
};

export const GENDER_LABELS: Record<VendorGendersType[number], string> = {
  M: "Hombre",
  F: "Mujer",
  O: "Otro",
};

export const CHANGE_REQUEST_STATUS_LABEL: Record<
  ChangeRequestStatusOptionsType[number],
  string
> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export const CHANGE_REQUEST_TYPE_LABEL: Record<
  entityTypeOptionsType[number],
  any
> = {
  PRODUCT_AND_SERVICE: (
    <Tag icon={<AppleOutlined />} color="geekblue">
      Producto/Servicio
    </Tag>
  ),
  STORE: (
    <Tag icon={<AppstoreOutlined />} color="geekblue">
      Tienda
    </Tag>
  ),
  VENDOR_PROFILE: (
    <Tag icon={<UserOutlined />} color="geekblue">
      Perfil de Vendedor
    </Tag>
  ),
};

export const SERVICE_ORDER_PAYMENT_METHOD_LABELS: Record<
  ServiceOrderPaymentMethodType[number],
  string
> = {
  cash: "Pago contraentrega - Efectivo",
  transfer: "Pago en linea - Wompi",
};
