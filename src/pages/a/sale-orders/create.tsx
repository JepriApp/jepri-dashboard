import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Card,
  Divider,
} from "antd";
import { useRouter } from "next/router";
import dayjs from "dayjs";
import { supabase } from "@/services/supabase.client";
import { useQuery } from "@tanstack/react-query";
import { PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";

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
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
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
          app_user:user_id ( email )
        `
        )
        .order("name", { ascending: true });
      if (error) throw error;
      const opts: CustomerOption[] = (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.app_user?.email,
      }));
      return opts;
    },
    staleTime: 300_000,
    retry: 1,
    onError: () => message.error("No se pudieron cargar los clientes"),
  });

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
    onError: () =>
      message.error("No se pudieron cargar los planes de distribución"),
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
    onError: () => message.error("No se pudieron cargar los productos"),
  });

  const onFinish = async (values: any) => {
    try {
      setSubmitting(true);
      const payload: any = {
        customer_id: values.customer_id,
        status: "pending",
        service_fee: values.service_fee ?? 0,
        delivery_charge: values.delivery_charge ?? 0,
        notes: values.notes ?? null,
      };
      if (values.delivery_date) {
        let chosenDate: string | null = null;
        if (values.delivery_date === "nearest") {
          chosenDate = plans.length > 0 ? plans[0].plan_date : null;
          if (!chosenDate) {
            message.warning(
              "No hay planes próximos; la orden se creará sin fecha de entrega"
            );
          }
        } else {
          const selected = plans.find((p) => p.id === values.delivery_date);
          chosenDate = selected?.plan_date ?? null;
        }
        if (chosenDate) {
          payload.delivery_date = dayjs(chosenDate)
            .startOf("day")
            .toISOString();
        }
      }
      const { data, error } = await supabase
        .from("sale_order")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      const orderId = data.id;

      // Si se abrió desde un plan, vincular la nueva orden al plan con secuencia siguiente
      if (planId) {
        const { data: seqRows, error: seqErr } = await supabase
          .from("distribution_plan_order")
          .select("sequence")
          .eq("distribution_plan_id", planId)
          .order("sequence", { ascending: false })
          .limit(1);
        if (seqErr) throw seqErr;
        const nextSeq = (Array.isArray(seqRows) && seqRows.length > 0
          ? Number(seqRows[0]?.sequence || 0)
          : 0) + 1;
        const { error: linkErr } = await supabase
          .from("distribution_plan_order")
          .insert({
            distribution_plan_id: planId,
            sale_order_id: orderId,
            sequence: nextSeq,
            status: "pending",
          })
          .select();
        if (linkErr) throw linkErr;
      }

      const items: Array<{ product_id: string; quantity: number }> =
        values.items || [];
      if (items.length > 0) {
        const saleItems = items.map((it) => {
          const p = products.find((pr) => pr.id === it.product_id);
          const unit_price = p?.reference_price ?? 0;
          return {
            sale_order_id: orderId,
            product_id: it.product_id,
            quantity: Number(it.quantity),
            unit_price,
          };
        });
        const { error: itemsErr } = await supabase
          .from("sale_item")
          .insert(saleItems)
          .select();
        if (itemsErr) throw itemsErr;
      }
      message.success(planId ? "Orden creada y agregada al plan" : "Orden creada exitosamente");
      router.push(planId ? `/a/distribution-plans/${planId}` : "/a/sale-orders/pending");
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
          delivery_date: "nearest",
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
            loading={loadingPlans}
            showSearch
            optionFilterProp="label"
            options={[
              { value: "nearest", label: "La más próxima" },
              ...plans.map((p) => ({
                value: p.id,
                label: `${dayjs(p.plan_date).format("YYYY-MM-DD")}`,
              })),
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
                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.items !== curr.items}>
                    {() => {
                      const items = form.getFieldValue("items") || [];
                      const selectedIds: string[] = items
                        .map((it: any) => it?.product_id)
                        .filter((id: any) => !!id);
                      const currentId = form.getFieldValue(["items", field.name, "product_id"]);
                      const filteredOptions = products
                        .filter((p) => p.id === currentId || !selectedIds.includes(p.id))
                        .map((p) => ({
                          value: p.id,
                          label: `${p.name} (${p.unit}) · $${p.reference_price.toFixed(2)}`,
                        }));
                      return (
                        <Form.Item
                          style={{ flex: 1 }}
                          name={[field.name, "product_id"]}
                          fieldKey={[field.fieldKey!, "product_id"]}
                          rules={[
                            { required: true, message: "Selecciona un producto" },
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
            <Button onClick={() => router.push("/a/sale-orders/pending")}>
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
