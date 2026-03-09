"use client";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Card,
  Divider,
  message,
  Result,
  App,
} from "antd";
import dayjs from "dayjs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";
import { redirect, useSearchParams } from "next/navigation";
import { listCustomers } from "../../users/customers/services/listCustomers";

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  contact: string;
  identification_type?: string;
  identification_number?: string;
}
interface CreateSaleOrderForm {
  customer_id: string;
  distribution_plan_id: string;
  items: {
    product_id: string;
    quantity: number;
  }[];
  notes?: string;
}
const CreateSaleOrderPage = () => {
  const supabase = createClient();
  const userInfo = supabase.auth.getUser();
  const query = useSearchParams();
  const planId = query.get("planId");
  const { modal } = App.useApp();
  const [form] = Form.useForm<CreateSaleOrderForm>();
  const { data: customers = [], isLoading: loadingCustomers } = useQuery<
    CustomerOption[]
  >({
    queryKey: ["customers"],
    queryFn: async () => {
      const data = await listCustomers(supabase);
      return data as CustomerOption[];
    },
    staleTime: 300_000,
    retry: 1,
  });

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["distributionPlansNearest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(`id, plan_date, plan_code, status`)
        .not("status", "in", "(completed,cancelled)")
        .order("plan_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product")
        .select("id, name, unit, reference_price")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 300_000,
    retry: 1,
  });

  const createOrderMutation = useMutation({
    mutationFn: async ({
      payload,
      items,
    }: {
      payload: {
        customer_id: string;
        distribution_plan_id: string;
        notes: string | null;
        created_by_admin_id: string;
      };
      items: Array<{ product_id: string; quantity: number }>;
    }) => {
      const { data, error } = await supabase
        .from("sale_order")
        .insert({ ...payload, status: "pending" })
        .select()
        .single();
      if (error) throw error;
      const orderId = data.id;

      if (items.length > 0) {
        const saleItems = items.map((it) => ({
          sale_order_id: orderId,
          product_id: it.product_id,
          required_quantity: Number(it.quantity),
        }));
        const { error: itemsErr } = await supabase
          .from("sale_item")
          .insert(saleItems)
          .select();
        if (itemsErr) throw itemsErr;
      }

      return data;
    },
    onSuccess: (data) => {
      form.resetFields();
      const ref = modal.success({
        content: (
          <Result
            status="success"
            title={`Orden #${data?.order_code} creada exitosamente`}
            subTitle="¿Qué quieres hacer ahora?"
            extra={[
              planId ? (
                <Button
                  key="return"
                  type="primary"
                  href={`/protected/distribution-plans/${planId}`}
                >
                  Volver al editor de plan
                </Button>
              ) : (
                <Button
                  key="return"
                  type="primary"
                  href="/protected/sale-orders"
                >
                  Volver al listado de órdenes
                </Button>
              ),
              <Button
                key="sale_orders"
                onClick={() => {
                  ref.destroy();
                }}
              >
                Hacer otra órden nueva
              </Button>,
            ]}
          />
        ),
      });
    },
  });

  const onFinish = async (values: CreateSaleOrderForm) => {
    try {
      const userData = await userInfo;
      if (!userData.data?.user?.id) {
        console.error("No se encontró usuario autenticado");
        message.error("No se encontró usuario autenticado");
        return;
      }

      const { data, error } = await supabase
        .from("admin")
        .select("id")
        .eq("user_id", userData.data?.user?.id)
        .single();
      if (error) throw error;

      if (!data?.id) {
        console.error("No se encontró admin para el usuario actual");
        message.error("No se encontró admin para el usuario actual");
        return;
      }

      const payload = {
        customer_id: values.customer_id,
        distribution_plan_id: values.distribution_plan_id,
        notes: values.notes ?? null,
        created_by_admin_id: data.id,
      };

      const items: Array<{ product_id: string; quantity: number }> =
        values.items || [];

      await createOrderMutation.mutateAsync({ payload, items });
    } catch (err) {
      console.error("Error creando orden", err);
      message.error("No se pudo crear la orden");
    }
  };

  return (
    <Card title="Crear orden de venta">
      <Form<CreateSaleOrderForm>
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          distribution_plan_id: planId,
          items: [
            {
              product_id: undefined,
            },
          ],
        }}
      >
        <Form.Item
          label="Cliente"
          name="customer_id"
          rules={[{ required: true, message: "Selecciona un cliente" }]}
        >
          <Select
            placeholder="Selecciona cliente"
            loading={loadingCustomers}
            showSearch={{
              optionFilterProp: "label",
            }}
            options={customers.map((c) => ({
              value: c.id,
              label: `${c.name} ${c.identification_type} ${c.identification_number}`,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="Fecha de entrega (Plan)"
          name="distribution_plan_id"
          rules={[
            { required: true, message: "Selecciona un plan de distribución" },
          ]}
        >
          <Select
            placeholder="Selecciona fecha del plan"
            loading={loadingPlans}
            showSearch={{
              optionFilterProp: "label",
            }}
            options={[
              ...plans.map((p) => ({
                value: p.id,
                label: `Plan #${p.plan_code} - ${dayjs(p.plan_date).format(
                  "YYYY-MM-DD",
                )}`,
              })),
            ]}
          />
        </Form.Item>

        <Form.Item label="Notas" name="notes">
          <Input.TextArea rows={3} placeholder="Notas opcionales" />
        </Form.Item>
        <Divider>Productos de la orden</Divider>
        <Form.List
          name="items"
          rules={[
            {
              validator: async (_, items: CreateSaleOrderForm["items"]) => {
                if (!items || items.length === 0) {
                  return Promise.reject(
                    new Error("Añade al menos un producto"),
                  );
                }
                const ids = (items || [])
                  .map((it) => it?.product_id)
                  .filter((id) => !!id);
                const unique = new Set(ids);
                if (ids.length !== unique.size) {
                  return Promise.reject(
                    new Error("Evita productos repetidos en la orden"),
                  );
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.map((field) => (
                <div
                  key={field.key}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, curr) => prev.items !== curr.items}
                  >
                    {() => {
                      const filteredOptions = products?.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${
                          p.unit
                        }) · $${p.reference_price?.toFixed(2)}`,
                      }));
                      return (
                        <Form.Item
                          style={{ flex: 1 }}
                          name={[field.name, "product_id"]}
                          rules={[
                            {
                              required: true,
                              message: "Selecciona un producto",
                            },
                          ]}
                        >
                          <Select
                            placeholder="Producto"
                            loading={loadingProducts}
                            showSearch={{
                              optionFilterProp: "label",
                            }}
                            options={filteredOptions}
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                  <Form.Item
                    style={{ width: 180 }}
                    name={[field.name, "quantity"]}
                    rules={[{ required: true, message: "Ingresa cantidad" }]}
                  >
                    <InputNumber
                      min={0.1}
                      placeholder="Cantidad"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                  {fields.length !== 1 && (
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  )}
                </div>
              ))}
              <Form.ErrorList errors={errors} />
              <Form.Item>
                <Button
                  type="dashed"
                  onClick={() => add()}
                  icon={<PlusOutlined />}
                >
                  Añadir producto
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
        <Form.Item>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={createOrderMutation.isPending}
            >
              Crear orden
            </Button>
            <Button
              onClick={() =>
                redirect(
                  planId
                    ? `/protected/distribution-plans/${planId}`
                    : "/protected/sale-orders/",
                )
              }
            >
              Cancelar
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default CreateSaleOrderPage;
