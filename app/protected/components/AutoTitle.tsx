"use client";

import { Typography } from "antd";
import { usePathname, useSearchParams } from "next/navigation";

const titles: Record<string, string> = {
  protected: "Bienvenido ${a}",
  // Pedidos
  "protected/sale-orders": "Pedidos",
  "protected/sale-orders/create": "Crear pedido",
  // Planes de distribución
  "protected/distribution-plans": "Planes de distribución",
  "protected/distribution-plans/calendar": "Calendario de distribución",
  "protected/distribution-plans/[id]": "Plan de distribución ${plan_code} - ${plan_date}",
  "protected/distribution-plans/[id]/assign-suppliers": "Asignación de proveedores",
  "protected/distribution-plans/[id]/finance": "Finanzas del plan",
  "protected/distribution-plans/[id]/sale-orders-delivery": "Despacho de pedidos",
  "protected/distribution-plans/[id]/suppliers-reception": "Recepción de proveedores",
  // Productos
  'protected/products': "Productos",
  // Usuarios
  "protected/users/customers": "Clientes",
  "protected/users/suppliers": "Proveedores",
  "protected/users/operators": "Operadores",
  "protected/users/admins": "Administradores",
};

const subtitles: Record<string, string> = {
  protected: "Resumen general",
  // Pedidos
  "protected/sale-orders": "Listado y gestión de pedidos",
  "protected/sale-orders/create": "Selecciona cliente, productos y plan de distribución",
  // Planes de distribución
  "protected/distribution-plans": "Resumen y gestión de planes",
  "protected/distribution-plans/calendar": "Visualiza planes por fecha",
  "protected/distribution-plans/[id]": "Detalles del plan",
  "protected/distribution-plans/[id]/assign-suppliers":
    "Editor para asignar proveedores a pedidos",
  "protected/distribution-plans/[id]/finance": "Costos, ingresos y márgenes del plan",
  "protected/distribution-plans/[id]/sale-orders-delivery":
    "Preparación y entrega de pedidos a clientes",
  "protected/distribution-plans/[id]/suppliers-reception":
    "Recepción de mercadería y precios reales",
  // Productos
  "protected/products": "Listado y gestión de productos",
  // Usuarios
  "protected/users/customers": "Información básica de clientes",
  "protected/users/suppliers": "Información básica de proveedores",
  "protected/users/operators": "Información básica de operadores",
  "protected/users/admins": "Información básica de administradores",
};

export const AutoTitle = () => {
  const query = useSearchParams();
  const pathname = usePathname();

  const replacePlaceholders = (text: string): string => {
    return text.replace(/\${(\w+)}/g, (_, key) => {
      const value = query.has(key) ? String(query.get(key)) : `\${${key}}`;
      return value;
    });
  };
  // Remove the first segment of the pathname (role)
  const trimmedPathname = pathname.split("/").slice(1).join("/");
  const title = titles[trimmedPathname] || "";
  const subtitle = subtitles[trimmedPathname] || "";

  return (
    <>
      <Typography.Title level={2} style={{ marginBottom: 0 }}>
        {replacePlaceholders(title)}
      </Typography.Title>
      <Typography.Text type="secondary">
        {replacePlaceholders(subtitle)}
      </Typography.Text>
    </>
  );
};
