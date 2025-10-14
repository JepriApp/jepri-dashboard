import useAuthAction from "@/actions/auth.action";
import LandingPageLayout from "@/components/layout/LandingPageLayout";
import { SendOutlined } from "@ant-design/icons";
import { Form, Input, Button } from "antd";
import { useRouter } from "next/router";
import React, { ReactElement } from "react";
interface FormValues {
  email: string;
}
const Index = () => {
  const [formInstance] = Form.useForm();
  const actions = useAuthAction();
  const recoverPassword = actions.recoverPassword();
  const router = useRouter();
  const handleSubmit = async (values: FormValues) => {
    try {
      await recoverPassword.mutateAsync({ body: values }).then(
        () => {
          router.push("/");
        },
        () => {}
      );
    } catch (error) {
      console.error(error);
    }
  };
  return (
    <div>
      <Form<FormValues>
        form={formInstance}
        onFinish={handleSubmit}
        style={{ minWidth: 300 }}
        requiredMark={false}
      >
        <Form.Item name="email" rules={[{ required: true }]}>
          <Input placeholder="Escribe tu correo electrónico" />
        </Form.Item>
        <Button htmlType="submit" type="primary" icon={<SendOutlined />}>
          Enviar enlace de recuperación
        </Button>
      </Form>
    </div>
  );
};

export default Index;

Index.getLayout = function getLayout(page: ReactElement) {
  return <LandingPageLayout backButton={true}> {page}</LandingPageLayout>;
};
