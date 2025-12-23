"use client";
import React, { useState } from "react";
import Sider from "antd/es/layout/Sider";
import Image from "next/image";
import Title from "antd/es/typography/Title";
import { AutoMenu } from "./AutoMenu";
import { Layout } from "antd";

export const SIDER_WIDTH = {
  COLLAPSED: 80,
  EXPANDED: 200,
} as const;
const SiderComponent = ({
  children,
  authButton,
}: {
  children: React.ReactNode;
  authButton: React.ReactNode;
}) => {
  const [sideMenuCollapsed, setSideMenuCollapsed] = useState<boolean>(false);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        onCollapse={(collapsed) => setSideMenuCollapsed(collapsed)}
        theme="light"
        width={SIDER_WIDTH["EXPANDED"]}
        style={{
          overflow: "auto",
          height: "calc(100vh - 0px)",
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
            <Title level={3} style={{ textAlign: "center" }}>
              Administrador
            </Title>
          )}
          <AutoMenu />
        </div>
        <div style={{ marginTop: "2rem" }}>{authButton}</div>
      </Sider>
      <Layout
        style={{
          padding: "16px",
          marginLeft: sideMenuCollapsed
            ? SIDER_WIDTH["COLLAPSED"]
            : SIDER_WIDTH["EXPANDED"],
          overflow: "initial",
        }}
      >
        {children}
      </Layout>
    </Layout>
  );
};

export default SiderComponent;
