import { App, Button, Form, Input } from "antd";
import { ReactElement, useEffect, useState } from "react";
import LandingPageLayout from "@/components/layout/LandingPageLayout";
import Link from "next/link";
import { LoginOutlined } from "@ant-design/icons";
import { useRouter } from "next/router";
import { useAuthStore } from "@/store/auth.store";
import { User } from "@supabase/supabase-js";
import { useForm } from "antd/es/form/Form";

export type LogInForm = {
  email: string;
  password: string;
};

export default function Index() {
  const router = useRouter();
  const { message } = App.useApp();
  const { user, login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form] = useForm();
  useEffect(() => {
    if (user?.id) {
      router.replace("/a/home");
    }
  }, [user]);

  return (
    <>
      <Form
        form={form}
        name="basic"
        autoComplete="off"
        layout="vertical"
        requiredMark={false}
        initialValues={{}}
        onFinish={async (values) => {
          try {
            const { email, password } = values;
            setLoading(true);
            await login(email, password);
            setLoading(false);
          } catch (error: any) {
            setLoading(false);
            message.error(error?.message || "Error al iniciar sesión");
            console.error("Error al iniciar sesión:", error);
          }
        }}
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
        {/* <Form.Item style={{ width: 320, textAlign: "center", marginBottom: 0 }}>
          <Link href={"/(auth)/forgotPassword"} style={{ fontSize: 14 }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </Form.Item> */}
        <Form.Item style={{ width: 320, marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            icon={<LoginOutlined />}
            loading={loading}
            style={{
              width: "100%",
              height: 44,
              fontSize: 16,
              borderRadius: 22,
            }}
          >
            Iniciar sesión
          </Button>
        </Form.Item>
      </Form>
    </>
  );
}

Index.getLayout = function getLayout(page: ReactElement) {
  return <LandingPageLayout>{page}</LandingPageLayout>;
};
