import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import { Layout } from "antd";
import { Content, Header } from "antd/es/layout/layout";
import Image from "next/image";
import { redirect } from "next/navigation";
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/protected");
  return (
    <Layout
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background:
          "linear-gradient(to bottom,rgb(219, 226, 201),rgb(32, 143, 74))",
      }}
    >
      <Header
        style={{
          background: "transparent",
          display: "grid",
          justifyItems: "center",
          height: "fit-contain",
        }}
      >
        <Image
          src={"/images/logo.png"}
          alt={"jepri-logo"}
          width={100}
          height={100}
          style={{
            height: "auto",
            width: "auto",
            objectFit: "cover",
            padding: "0.5rem",
          }}
        ></Image>
      </Header>
      <Content
        style={{
          placeItems: "center",
          alignContent: "center",
          padding: "2rem",
          gap: "0.5rem",
          position: "relative", // Para posicionar el botón de regresar
          maxWidth: "600px",
          margin: "auto",
        }}
      >
        <LoginForm />
      </Content>
    </Layout>
  );
}
