import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useState, useEffect } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Card,
  Divider,
  App,
} from "antd";
import { useRouter } from "next/router";
import dayjs from "dayjs";
import { supabase } from "@/services/supabase.client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth.store";

interface CustomerOption {
  id: string;
  name: string;
  email?: string;
}

interface DistributionPlanOption {
  id: string;
  plan_date: string; // ISO date (YYYY-MM-DD)
  plan_code?: string;
}

interface ProductOption {
  id: string;
  name: string;
  unit: string;
  reference_price: number;
}

const CreateSaleOrderPage = () => {
  const router = useRouter();
  const planId = router.query.planId as string | undefined;
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuthStore();
  const { data: customers = [], isLoading: loadingCustomers } = useQuery<
    CustomerOption[]
  >({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer")
        .select(
          `
          id,
          name,
          auth:user_id ( email )
        `
        )
        .order("name", { ascending: true });
      if (error) throw error;
      const opts: CustomerOption[] = (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.auth?.email,
      }));
      return opts;
    },
    staleTime: 300_000,
    retry: 1,
  });

  // Query para obtener el plan específico cuando planId está presente
  const { data: specificPlan, isLoading: loadingSpecificPlan } =
    useQuery<DistributionPlanOption | null>({
      queryKey: ["distributionPlan", planId],
      queryFn: async () => {
        if (!planId) return null;
        const { data, error } = await supabase
          .from("distribution_plan")
          .select(`id, plan_date, plan_code, status`)
          .eq("id", planId)
          .single();
        if (error) throw error;
        return {
          id: data.id,
          plan_date: data.plan_date,
          plan_code: data.plan_code,
        };
      },
      enabled: !!planId,
      staleTime: 300_000,
      retry: 1,
    });
  useEffect(() => {
    if (specificPlan?.id) {
      form.setFieldsValue({ delivery_date: specificPlan.id });
    }
  }, [specificPlan?.id, form]);
  const { data: plans = [], isLoading: loadingPlans } = useQuery<
    DistributionPlanOption[]
  >({
    queryKey: ["distributionPlansNearest"],
    queryFn: async () => {
      const today = dayjs().format("YYYY-MM-DD");
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(`id, plan_date, plan_code, status`)
        .gte("plan_date", today)
        .order("plan_date", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        plan_date: p.plan_date,
        plan_code: p.plan_code,
      }));
    },
    staleTime: 300_000,
    retry: 1,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery<
    ProductOption[]
  >({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product")
        .select("id, name, unit, reference_price")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        reference_price: Number(p.reference_price || 0),
      }));
    },
    staleTime: 300_000,
    retry: 1,
  });

  const createOrderMutation = useMutation({
    mutationFn: async ({
      payload,
      items,
    }: {
      payload: any;
      items: Array<{ product_id: string; quantity: number }>;
    }) => {
      const { data, error } = await supabase
        .from("sale_order")
        .insert(payload)
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
  });

  const onFinish = async (values: any) => {
    try {
      setSubmitting(true);

      // Validar y determinar el plan de distribución (requerido por el esquema)
      const availablePlanIds = new Set((plans || []).map((p) => p.id));
      const deliveryDateSelection: string | undefined = values?.delivery_date;
      const distributionPlanId: string | undefined =
        planId ?? deliveryDateSelection;
      if (!distributionPlanId || !availablePlanIds.has(distributionPlanId)) {
        message.error("Debes seleccionar un plan de distribución válido");
        return;
      }

      // Verificar creador: admin en este flujo (página de administración)
      if (!user?.id) {
        message.error("Usuario no identificado");
        return;
      }
      const { data: adminRow, error: adminErr } = await supabase
        .from("admin")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminErr || !adminRow?.id) {
        console.error("No se encontró admin para el usuario actual", adminErr);
        message.error("No se encontró admin para el usuario actual");
        return;
      }

      const payload: any = {
        customer_id: values.customer_id,
        distribution_plan_id: distributionPlanId,
        status: "pending",
        service_fee: values.service_fee ?? 0,
        delivery_fee: values.delivery_charge ?? 0,
        notes: values.notes ?? null,
        created_by_admin_id: adminRow.id,
      };

      const items: Array<{ product_id: string; quantity: number }> =
        values.items || [];

      await createOrderMutation.mutateAsync({ payload, items });

      message.success(
        planId ? "Orden creada y agregada al plan" : "Orden creada exitosamente"
      );
      router.push(
        planId ? `/a/distribution-plans/${planId}` : "/a/sale-orders/pending"
      );
    } catch (err) {
      console.error("Error creando orden", err);
      message.error("No se pudo crear la orden");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="Crear orden de venta">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          service_fee: 0,
          delivery_charge: 0,
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
            showSearch
            optionFilterProp="label"
            options={customers.map((c) => ({
              value: c.id,
              label: `${c.name}${c.email ? ` (${c.email})` : ""}`,
            }))}
          />
        </Form.Item>

        <Form.Item label="Fecha de entrega (plan)" name="delivery_date">
          <Select
            placeholder="Selecciona fecha del plan"
            loading={loadingPlans || loadingSpecificPlan}
            showSearch
            optionFilterProp="label"
            options={[
              ...plans.map((p) => ({
                value: p.id,
                label: `${dayjs(p.plan_date).format("YYYY-MM-DD")}`,
              })),
              ...(specificPlan && !plans.some((p) => p.id === specificPlan.id)
                ? [
                    {
                      value: specificPlan.id,
                      label: `${dayjs(specificPlan.plan_date).format(
                        "YYYY-MM-DD"
                      )}`,
                    },
                  ]
                : []),
            ]}
          />
        </Form.Item>

        <Form.Item label="Tarifa de servicio" name="service_fee">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Cargo por entrega" name="delivery_charge">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item label="Notas" name="notes">
          <Input.TextArea rows={3} placeholder="Notas opcionales" />
        </Form.Item>
        <Divider>Productos de la orden</Divider>
        <Form.List
          name="items"
          rules={[
            {
              validator: async (_, items) => {
                if (!items || items.length === 0) {
                  return Promise.reject(
                    new Error("Añade al menos un producto")
                  );
                }
                const ids = (items || [])
                  .map((it: any) => it?.product_id)
                  .filter((id: any) => !!id);
                const unique = new Set(ids);
                if (ids.length !== unique.size) {
                  return Promise.reject(
                    new Error("Evita productos repetidos en la orden")
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
                      const items = form.getFieldValue("items") || [];
                      const selectedIds: string[] = items
                        .map((it: any) => it?.product_id)
                        .filter((id: any) => !!id);
                      const currentId = form.getFieldValue([
                        "items",
                        field.name,
                        "product_id",
                      ]);
                      const filteredOptions = products
                        .filter(
                          (p) =>
                            p.id === currentId || !selectedIds.includes(p.id)
                        )
                        .map((p) => ({
                          value: p.id,
                          label: `${p.name} (${
                            p.unit
                          }) · $${p.reference_price.toFixed(2)}`,
                        }));
                      return (
                        <Form.Item
                          style={{ flex: 1 }}
                          name={[field.name, "product_id"]}
                          fieldKey={[field.fieldKey!, "product_id"]}
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
                            showSearch
                            optionFilterProp="label"
                            options={filteredOptions}
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                  <Form.Item
                    style={{ width: 180 }}
                    name={[field.name, "quantity"]}
                    fieldKey={[field.fieldKey!, "quantity"]}
                    rules={[{ required: true, message: "Ingresa cantidad" }]}
                  >
                    <InputNumber
                      min={0}
                      placeholder="Cantidad"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                  <MinusCircleOutlined onClick={() => remove(field.name)} />
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
            <Button type="primary" htmlType="submit" loading={submitting}>
              Crear orden
            </Button>
            <Button onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default CreateSaleOrderPage;

CreateSaleOrderPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout>{page}</DashboardLayout>;
};
