import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Layout, theme, Typography, Button, Drawer } from "antd";
import {
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TruckOutlined,
  UserOutlined,
} from "@ant-design/icons";
import Image from "next/image";
import type { MenuProps } from "antd";
import Link from "next/link";
import AuthVerifier from "../auth/AuthVerifier";
import GoBackButton from "../pure/goBackButton";
import { subtitles, titles } from "@/constants/titles";
import { AutoTitle } from "../pure/AutoTitle";
import { AutoMenu } from "../pure/AutoMenu";
import { ProfileButton } from "../pure/ProfileButton";
import { useWindowSize } from "../../../hooks/useWindowSize";
import { useAuthStore, User } from "@/store/auth.store";
import { createClient as clientToSignOut } from "@/utils/supabase/component";

export const SIDER_WIDTH = {
  COLLAPSED: 80,
  EXPANDED: 200,
} as const;

export const SCREEN_BREAKPOINTS = {
  MOBILE: 768,
} as const;

const lateralMenuItems: Record<string, MenuProps["items"]> = {
  a: [
    {
      key: `/a/home`,
      icon: React.createElement(HomeOutlined),
      label: <Link href="/a/home">Inicio</Link>,
      children: undefined,
    },
    {
      key: `/a/sale-orders`,
      icon: React.createElement(ShoppingCartOutlined),
      label: <Link href="/a/sale-orders">Pedidos</Link>,
      children: undefined,
    },
    {
      key: `/a/distribution-plans`,
      icon: React.createElement(TruckOutlined),
      label: <Link href="/a/distribution-plans">Operación</Link>,
      children: undefined,
    },
    {
      key: `/a/products`,
      icon: React.createElement(ShopOutlined),
      label: <Link href="/a/products">Productos</Link>,
      children: undefined,
    },
    {
      key: `/a/user`,
      icon: React.createElement(UserOutlined),
      label: "Usuarios",
      children: [
        {
          key: `/a/users/customers`,
          label: <Link href="/a/users/customers">Clientes</Link>,
          children: undefined,
        },
        {
          key: `/a/users/suppliers`,
          label: <Link href="/a/users/suppliers">Proveedores</Link>,
          children: undefined,
        },
        {
          key: `/a/users/operators`,
          label: <Link href="/a/users/operators">Operadores</Link>,
          children: undefined,
        },
        {
          key: `/a/users/admins`,
          label: <Link href="/a/users/admins">Administradores</Link>,
          children: undefined,
        },
      ],
    },
  ],
};

const roleLabels: Record<string, string> = {
  a: "Administrador",
  v: "Veciproveedor",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
  backButton?: boolean;
  noStyle?: boolean;
}

const { Header, Content, Sider, Footer } = Layout;
const { Text, Title } = Typography;

function DashboardLayout({
  children,
  backButton = false,
  noStyle = false,
}: DashboardLayoutProps) {
  const router = useRouter();
  const {
    token: { colorPrimary },
  } = theme.useToken();
  const [sideMenuCollapsed, setSideMenuCollapsed] = useState<boolean>(false);
  const primaryUrlSegment = router.pathname.split("/")[1];
  const { width } = useWindowSize();
  const [mounted, setMounted] = useState(false);
  const supabase = clientToSignOut();

  useEffect(() => setMounted(true), []);
  const isSmallScreen = mounted && width < SCREEN_BREAKPOINTS["MOBILE"];
  const { user: userSession } = useAuthStore();
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(error);
      return
    }
    router.push("/");
  }
  const dropdownMenu = {
    items: [
      {
        key: "logout",
        label: "Cerrar sesión",
        icon: <LogoutOutlined />,
        onClick: async () => {
          await signOut();
        },
      },
    ],
  };
  const footer = (
    <Footer style={{ textAlign: "center" }}>
      <Title level={5}>Jepri</Title>
      <Text type="secondary">
        Simplificamos el abastecimiento de frutas y verduras de tu negocio.
      </Text>
    </Footer>
  );
  const desktopLayout = (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        onCollapse={(collapsed) => setSideMenuCollapsed(collapsed)}
        theme="light"
        width={SIDER_WIDTH["EXPANDED"]}
        style={{
          overflow: "auto",
          height: "calc(100vh - 50px)",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 1000,
        }}
      >
        <div>
          <Image
            src={"/images/logo.png"}
            alt={"jepri-logo"}
            width={100}
            height={60}
            style={{
              width: "auto",
              objectFit: "cover",
              display: "flex",
              margin: "16px auto",
            }}
          ></Image>
          {!sideMenuCollapsed && (
            <Typography.Title
              level={3}
              style={{ textAlign: "center", color: colorPrimary }}
            >
              {roleLabels[primaryUrlSegment]}
            </Typography.Title>
          )}
          <AutoMenu items={lateralMenuItems[router.pathname.split("/")[1]]} />
        </div>
        <ProfileButton
          width={
            sideMenuCollapsed
              ? SIDER_WIDTH["COLLAPSED"]
              : SIDER_WIDTH["EXPANDED"]
          }
          user={userSession || ({} as User)}
          dropdownProps={{
            menu: dropdownMenu,
          }}
        />
      </Sider>
      <Layout
        style={{
          padding: noStyle ? "0" : "16px",
          marginLeft: sideMenuCollapsed
            ? SIDER_WIDTH["COLLAPSED"]
            : SIDER_WIDTH["EXPANDED"],
          overflow: "initial",
        }}
      >
        {noStyle ? (
          children
        ) : (
          <>
            <Header
              style={{
                backgroundColor: "transparent",
                height: "auto",
                lineHeight: "36px",
                paddingLeft: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  width: "100%",
                  marginBottom: "16px",
                }}
              >
                {/* <AutoBreadcrumb breadcrumItemTree={breadcrumItemTree} /> */}
                {backButton && <GoBackButton />}
                <AutoTitle titles={titles} subtitles={subtitles} />
              </div>
            </Header>
            <Content>{children}</Content>
            {footer}
          </>
        )}
      </Layout>
    </Layout>
  );
  function toogleSideMenuCollapsed() {
    setSideMenuCollapsed((prev) => !prev);
  }
  const mobileLayout = (
    <Layout>
      <Drawer
        open={sideMenuCollapsed}
        onClose={toogleSideMenuCollapsed}
        placement="left"
        width={"auto"}
        styles={{
          body: { padding: 0 },
        }}
      >
        <Typography.Title
          level={3}
          style={{
            textAlign: "center",
            color: colorPrimary,
            lineBreak: "auto",
          }}
        >
          {roleLabels[primaryUrlSegment]}
        </Typography.Title>
        <AutoMenu
          items={lateralMenuItems[router.pathname.split("/")[1]]}
          style={{ width: "240px" }}
        />
      </Drawer>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: "0 0 0 15%",
          background: "linear-gradient(to bottom, #FFF5B0, #FFD100)",
        }}
      >
        <Button
          icon={<MenuOutlined />}
          type="text"
          onClick={toogleSideMenuCollapsed}
        />
        <Image
          src={"/images/logo.png"}
          alt={"jepri-logo"}
          width={100}
          height={100}
          style={{
            height: "4vh",
            width: "auto",
            objectFit: "cover",
          }}
        ></Image>
        <ProfileButton
          width={91}
          user={userSession || ({} as User)}
          buttonProps={{ style: {}, children: <></> }}
          dropdownProps={{
            menu: dropdownMenu,
          }}
        />
      </Header>
      <Content style={noStyle ? {} : { padding: "0 4px" }}>
        {noStyle ? (
          children
        ) : (
          <>
            {backButton && <GoBackButton />}
            {/* <AutoBreadcrumb breadcrumItemTree={breadcrumItemTree} /> */}
            <AutoTitle titles={titles} subtitles={subtitles} />
            {children}
          </>
        )}
      </Content>
      {footer}
    </Layout>
  );
  return (
    <AuthVerifier user={userSession || undefined} roles={['authenticated']}>      
      {isSmallScreen ? mobileLayout : desktopLayout}
    </AuthVerifier>
  );
}

export default DashboardLayout;
