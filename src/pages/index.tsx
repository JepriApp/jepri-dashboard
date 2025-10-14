import { Button, Form, Input } from "antd";
import { ReactElement } from "react";
import LandingPageLayout from "@/components/layout/LandingPageLayout";
import Link from "next/link";
import { LoginOutlined } from "@ant-design/icons";
import { useRouter } from "next/router";
import { useAuthStore } from "@/store/auth.store";

export type LogInForm = {
  email: string;
  password: string;
};
const styles = {
  formItem: {
    flex: "1 1 600px",
    width: "100%",
    maxWidth: "600px",
  },
};

export default function Index() {
  const router = useRouter();
  const { setUser, availableUsers, fetchUserDetails } = useAuthStore();

  const handleAdminLogin = async () => {
    try {
      const admins = availableUsers.filter((u) => u.role === "admin");
      if (admins.length === 0) return;

      const selectedAdmin = admins[0];
      setUser(selectedAdmin);
      await fetchUserDetails(selectedAdmin.email);
      router.push("/a/home");
    } catch (error) {
      console.error("Error al iniciar sesión como admin:", error);
    }
  };
  return (
    <>
      <Form
        name="basic"
        autoComplete="off"
        layout="vertical"
        requiredMark={false}
        initialValues={{}}
      >
        <Form.Item<LogInForm>
          name="email"
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input
            placeholder="Ejemplo@email.com"
            style={{ width: 320, height: 44, fontSize: 16, textAlign: "left" }}
          />
        </Form.Item>

        <Form.Item<LogInForm>
          name="password"
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input.Password
            placeholder="Contraseña"
            style={{ width: 320, height: 44, fontSize: 16, textAlign: "left" }}
          />
        </Form.Item>
        <Form.Item style={{ width: 320, textAlign: "center", marginBottom: 0 }}>
          <Link href={"/(auth)/forgotPassword"} style={{ fontSize: 14 }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </Form.Item>
        <Form.Item style={{ width: 320, marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            icon={<LoginOutlined />}
            style={{
              width: "100%",
              height: 44,
              fontSize: 16,
              borderRadius: 22,
            }}
          >
            Entrar al panel
          </Button>
        </Form.Item>
        <Form.Item style={{ width: 320, marginBottom: 0, marginTop: 20 }}>
          <Button
            onClick={handleAdminLogin}
            style={{
              width: "100%",
              height: 44,
              fontSize: 16,
              borderRadius: 22,
            }}
          >
            {" "}
            Entrar como admin{" "}
          </Button>
        </Form.Item>
      </Form>
    </>
  );
}

Index.getLayout = function getLayout(page: ReactElement) {
  return <LandingPageLayout>{page}</LandingPageLayout>;
};
