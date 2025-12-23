import { AuthButton } from "@/components/auth-button";
import { Suspense } from "react";
import Title from "antd/es/typography/Title";
import { Content, Footer, Header } from "antd/es/layout/layout";
import Text from "antd/es/typography/Text";
import React from "react";
import { AutoTitle } from "./components/AutoTitle";
import SiderComponent from "./components/Sider";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiderComponent
      authButton={
        <Suspense>
          <AuthButton />
        </Suspense>
      }
    >
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
            <AutoTitle />
          </div>
        </Header>
        <Content>{children}</Content>
        <Footer style={{ textAlign: "center" }}>
          <Title level={5}>Jepri</Title>
          <Text type="secondary">
            Simplificamos el abastecimiento de frutas y verduras de tu negocio.
          </Text>
        </Footer>
      </>
    </SiderComponent>
  );
}
