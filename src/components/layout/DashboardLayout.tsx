import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Layout, theme, Typography, Button, Drawer } from "antd";
import {
  AppleOutlined,
  AppstoreOutlined,
  DollarOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  PullRequestOutlined,
  ReconciliationOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TeamOutlined,
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
      key: `sale-orders`,
      icon: React.createElement(ShoppingOutlined),
      label: "Pedidos",
      children: [
        {
          key: `/a/sale-orders/pending`,
          icon: React.createElement(ShoppingOutlined),
          label: <Link href="/a/sale-orders/pending">Pendientes</Link>,
          children: undefined,
        },
        {
          key: `/a/sale-orders/history`,
          icon: React.createElement(ShoppingOutlined),
          label: <Link href="/a/sale-orders/history">Historial</Link>,
          children: undefined,
        },
      ],
    },
    {
      key: `/a/distribution-plans`,
      icon: React.createElement(ShoppingOutlined),
      label: <Link href="/a/distribution-plans">Planificador</Link>,
      children: undefined,
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
}

const { Header, Content, Sider, Footer } = Layout;
const { Text, Title } = Typography;

function DashboardLayout({
  children,
  backButton = false,
}: DashboardLayoutProps) {
  const router = useRouter();
  const {
    token: { colorPrimary },
  } = theme.useToken();
  const [sideMenuCollapsed, setSideMenuCollapsed] = useState<boolean>(false);
  const primaryUrlSegment = router.pathname.split("/")[1];
  const { width } = useWindowSize();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isSmallScreen = mounted && width < SCREEN_BREAKPOINTS["MOBILE"];
  const { user: userSession } = useAuthStore();

  const dropdownMenu = {
    items: [
      {
        key: "profile",
        label: "Perfil de usuario",
        icon: <SettingOutlined />,
        onClick: () => {
          router.push(`/${router.pathname.split("/")[1]}/profile`);
        },
      },
      {
        key: "logout",
        label: "Cerrar sesión",
        icon: <LogoutOutlined />,
        onClick: async () => {
          router.push("/");
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
          padding: "16px",
          marginLeft: sideMenuCollapsed
            ? SIDER_WIDTH["COLLAPSED"]
            : SIDER_WIDTH["EXPANDED"],
          width: "100%",
        }}
      >
        <Header
          style={{
            backgroundColor: "transparent",
            height: "auto",
            lineHeight: "36px",
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
            }}
          >
            {/* <AutoBreadcrumb breadcrumItemTree={breadcrumItemTree} /> */}
            {backButton && <GoBackButton />}
            <AutoTitle titles={titles} subtitles={subtitles} />
          </div>
        </Header>
        <Content style={{ margin: "24px 16px 0" }}>{children}</Content>
        {footer}
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
      <Content style={{ padding: "0 4px" }}>
        {/* <AutoBreadcrumb breadcrumItemTree={breadcrumItemTree} /> */}
        {backButton && <GoBackButton />}
        <AutoTitle titles={titles} subtitles={subtitles} />
        {children}
      </Content>
      {footer}
    </Layout>
  );
  return (
    <AuthVerifier
      requireAuth={true}
      roles={["admin"]}
      user={userSession || undefined}
    >
      {isSmallScreen ? mobileLayout : desktopLayout}
    </AuthVerifier>
  );
}

export default DashboardLayout;
