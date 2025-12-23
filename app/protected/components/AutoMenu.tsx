"use client";
import {
  HomeOutlined,
  ShoppingCartOutlined,
  TruckOutlined,
  ShopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { MenuProps, Menu } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export const AutoMenu = (props: MenuProps) => {
  const pathname = usePathname();
  return (
    <Menu
      mode="inline"
      selectedKeys={[pathname]}
      style={{ border: "1px solid transparent" }}
      defaultOpenKeys={["/user"]}
      {...props}
      items={[
        {
          key: `/protected`,
          icon: React.createElement(HomeOutlined),
          label: <Link href="/protected">Inicio</Link>,
          children: undefined,
        },
        {
          key: `/protected/sale-orders`,
          icon: React.createElement(ShoppingCartOutlined),
          label: <Link href="/protected/sale-orders">Pedidos</Link>,
          children: undefined,
        },
        {
          key: `/protected/distribution-plans`,
          icon: React.createElement(TruckOutlined),
          label: <Link href="/protected/distribution-plans">Operación</Link>,
          children: undefined,
        },
        {
          key: `/protected/products`,
          icon: React.createElement(ShopOutlined),
          label: <Link href="/protected/products">Productos</Link>,
          children: undefined,
        },
        {
          key: `/user`,
          icon: React.createElement(UserOutlined),
          label: "Usuarios",
          children: [
            {
              key: `/protected/users/customers`,
              label: <Link href="/protected/users/customers">Clientes</Link>,
              children: undefined,
            },
            {
              key: `/protected/users/suppliers`,
              label: <Link href="/protected/users/suppliers">Proveedores</Link>,
              children: undefined,
            },
            {
              key: `/users/operators`,
              label: <Link href="/users/operators">Operadores</Link>,
              children: undefined,
              disabled: true,
            },
            {
              key: `/users/admins`,
              label: <Link href="/users/admins">Administradores</Link>,
              children: undefined,
              disabled: true,
            },
          ],
        },
      ]}
    />
  );
};
