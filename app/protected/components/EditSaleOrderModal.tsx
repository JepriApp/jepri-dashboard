"use client";

import { useEffect, useState } from "react";
import {
  Table,
  Button,
  Typography,
  Space,
  Modal,
  InputNumber,
  Select,
  Popconfirm,
  Alert,
  Form,
  App,
} from "antd";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { Product, SaleItem } from "../sale-orders/page";
import ProductImage from "./ProductImage";
import { useWatch } from "antd/es/form/Form";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import AsyncButton from "./AsyncButton";

const { Text } = Typography;

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Representa una fila dentro del Form.List. */
type FormItem = {
  /** ID real en BD. Undefined si es fila nueva. */
  id?: string;
  /** Clave temporal para Form.List (siempre presente). */
  tempId: string;
  product_id?: string;
  quantity: number;
  unit_price: number;
  /** Snapshot del producto para mostrar nombre/unidad sin llamar a BD. */
  product?: Product;
};

type FormValues = {
  items: FormItem[];
};

interface EditSaleOrderModalProps {
  /** Orden a editar. Pasar `null` cierra el modal. */
  order: {
    id: string;
    status:
      | "pending"
      | "processing"
      | "out_for_delivery"
      | "delivered"
      | "cancelled";
    order_code: string | null;
    items?: SaleItem[];
    service_fee: number | null;
    delivery_fee: number | null;
  } | null;
  /** Llamado después de guardar exitosamente. Útil para refrescar listas externas. */
  onSaved?: () => void;
}

// ─── Función de mutación (fuera del componente para mantenerla pura) ──────────

async function saveOrderItems(
  supabase: ReturnType<typeof createClient>,
  order: {
    id: string;
    status:
      | "pending"
      | "processing"
      | "out_for_delivery"
      | "delivered"
      | "cancelled";
    order_code: string | null;
    items?: SaleItem[];
    service_fee: number | null;
    delivery_fee: number | null;
  },
  values: FormValues,
) {
  const originalIds = new Set(
    (order.items ?? []).map((it: any) => String(it.id)),
  );
  const currentItems = values.items;

  // IDs que ya existían antes y siguen en el form
  const survivingIds = new Set(
    currentItems.filter((it) => it.id).map((it) => String(it.id)),
  );

  // ── 1. Eliminar los que ya no están ────────────────────────────────────────
  const toDelete = [...originalIds].filter((id) => !survivingIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("sale_item")
      .delete()
      .in("id", toDelete);
    if (error) throw error;
  }

  // ── 2. Actualizar cantidades de los existentes que cambiaron ───────────────
  const originalQtyMap = new Map(
    (order.items ?? []).map((it: any) => [String(it.id), it.quantity]),
  );
  const toUpdate = currentItems.filter(
    (it) => it.id && originalQtyMap.get(String(it.id)) !== it.quantity,
  );
  for (const it of toUpdate) {
    const { error } = await supabase
      .from("sale_item")
      .update({ required_quantity: it.quantity })
      .eq("id", String(it.id));
    if (error) throw error;
  }

  // ── 3. Insertar nuevos ─────────────────────────────────────────────────────
  const toInsert = currentItems.filter((it) => !it.id && it.product_id);
  for (const it of toInsert) {
    const { error } = await supabase.from("sale_item").insert([
      {
        sale_order_id: order.id,
        product_id: String(it.product_id),
        required_quantity: it.quantity,
      },
    ]);
    if (error) throw error;
  }
}
async function deleteSaleOrder(
  supabase: ReturnType<typeof createClient>,
  sale_order_id: string,
) {
  const { error } = await supabase
    .from("sale_order")
    .delete()
    .eq("id", sale_order_id);
  if (error) throw error;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const EditSaleOrderModal = ({ order, onSaved }: EditSaleOrderModalProps) => {
  const supabase = createClient();
  const {message} = App.useApp()
  const [form] = Form.useForm<FormValues>();
  const [isOpen, setIsOpen] = useState(false);
  const currentItems = useWatch("items", form);
  // Productos disponibles para agregar nuevas filas
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products", "forEditSaleOrderModal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product")
        .select("id, name, unit, reference_price, main_photo")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Reinicia el formulario cada vez que se abre con una orden distinta
  useEffect(() => {
    if (
      !order ||
      order?.status === "cancelled" ||
      order?.status === "delivered"
    ) {
      return;
    }
    const initialValues = {
      items: (order.items ?? []).map((it: any) => ({
        id: String(it.id),
        tempId: String(it.id),
        product_id: String(it.product_id),
        quantity: it.quantity,
        unit_price: it.unit_price ?? 0,
        product: it.product,
      })),
    };
    form.setFieldsValue(initialValues);
  }, [order?.id, isOpen]);

  // useMutation que orquesta los tres pasos (delete / update / insert)
  const updateOrderMutation = useMutation({
    mutationFn: (values: FormValues) =>
      saveOrderItems(supabase, order!, values),
    onSuccess: async () => {
      message.success("Pedido actualizado correctamente");
      onSaved?.();
      setIsOpen(false);
    },
    onError: (err) => {
      console.error("Error actualizando pedido", err);
      message.error("Error al actualizar el pedido");
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: () => deleteSaleOrder(supabase, order?.id || ""),
    onSuccess: async () => {
      message.success("Pedido eliminado correctamente");
      onSaved?.();
      setIsOpen(false);
    },
    onError: (err) => {
      console.error("Error eliminado pedido", err);
      message.error("Error al eliminado el pedido");
    },
  });

  const handleOk = () => form.submit();

  const handleFinish = (values: FormValues) =>
    updateOrderMutation.mutate(values);
  if (order?.status === "cancelled" || order?.status === "delivered") {
    return null;
  }
  return (
    <>
      <Button icon={<EditOutlined />} onClick={() => setIsOpen(true)}>
        Modificar pedido
      </Button>
      <Modal
        open={isOpen}
        onCancel={() => {
          setIsOpen(false);
        }}
        maskClosable={false}
        title={`Modificar pedido ${order?.order_code ?? ""}`}
        onOk={handleOk}
        okText="Guardar cambios"
        cancelText="Cancelar"
        confirmLoading={updateOrderMutation.isPending}
        width={900}
        destroyOnHidden
      >
        <Form form={form} onFinish={handleFinish} component={false}>
          <Form.List name="items">
            {(fields, { add, remove }) => {
              const handleAddItem = () =>
                add({
                  tempId: Math.random().toString(36).slice(2),
                  product_id: undefined,
                  quantity: 1,
                  unit_price: 0,
                  product: undefined,
                });

              const handleProductChange = (
                fieldKey: number,
                productId: string,
              ) => {
                const p = products.find((x) => x.id === productId);
                form.setFieldValue(
                  ["items", fieldKey, "product_id"],
                  productId,
                );
                form.setFieldValue(
                  ["items", fieldKey, "unit_price"],
                  p?.reference_price ?? 0,
                );
                form.setFieldValue(["items", fieldKey, "product"], p);
                // Forzar re-render del Form.List
                form.setFieldsValue({ items: form.getFieldValue("items") });
              };

              // Columnas de la tabla
              const columns = [
                {
                  title: "Producto",
                  key: "product",
                  render: (_: any, row: any, index: number) => {
                    const item: FormItem = form.getFieldValue(["items", index]);
                    // Fila existente: solo mostrar nombre
                    if (item?.id) {
                      return (
                        <Form.Item name={[index, "product_id"]} noStyle>
                          <Space>
                            <ProductImage
                              source={item.product?.main_photo ?? null}
                              name={item.product?.name}
                              size="small"
                            />
                            <Text>{item.product?.name ?? "—"}</Text>
                            <Text type="secondary">
                              {item.product?.unit ?? ""}
                            </Text>
                          </Space>
                        </Form.Item>
                      );
                    }
                    // Fila nueva: selector
                    return (
                      <Form.Item
                        name={[index, "product_id"]}
                        rules={[
                          { required: true, message: "Selecciona un producto" },
                          ({}) => ({
                            validator(_, value) {
                              const productCount = currentItems.filter(
                                (e) => e.product_id === value,
                              );
                              if (productCount.length === 1) {
                                return Promise.resolve();
                              }
                              return Promise.reject(
                                new Error(
                                  "Este producto ya existe en esta órden",
                                ),
                              );
                            },
                          }),
                        ]}
                        style={{ margin: 0 }}
                      >
                        <Select
                          style={{ minWidth: 260 }}
                          placeholder="Seleccione producto"
                          showSearch={{ optionFilterProp: "searchValue" }}
                          loading={productsLoading}
                          onChange={(val) => handleProductChange(index, val)}
                          options={(() => {
                            return products.map((p) => ({
                              value: p.id,
                              searchValue: `${p.name}${p.unit ? ` (${p.unit})` : ""}`,
                              label: (
                                <Space>
                                  <ProductImage
                                    source={p.main_photo ?? null}
                                    name={p.name}
                                    size="small"
                                  />
                                  <Text>{p.name ?? "—"}</Text>
                                  <Text type="secondary">{p.unit ?? ""}</Text>
                                </Space>
                              ),
                            }));
                          })()}
                        />
                      </Form.Item>
                    );
                  },
                },
                {
                  title: "Cant./Unidad",
                  key: "quantity",
                  render: (_: any, _row: any, index: number) => (
                    <Form.Item
                      name={[index, "quantity"]}
                      rules={[{ required: true, message: "Ingresa cantidad" }]}
                      style={{ margin: 0 }}
                    >
                      <InputNumber min={0} style={{ width: 100 }} />
                    </Form.Item>
                  ),
                },
                {
                  title: "Unitario",
                  key: "unit_price",
                  render: (_: any, _row: any, index: number) => {
                    //return JSON.stringify(currentItems);
                    const item = products.find(
                      (p) => p.id === currentItems?.at(index)?.product_id,
                    );
                    return formatPriceAccounting(item?.reference_price ?? 0);
                  },
                },
                {
                  title: "Subtotal",
                  key: "subtotal",
                  render: (_: any, _row: any, index: number) => {
                    const item: FormItem = form.getFieldValue(["items", index]);
                    return formatPriceAccounting(
                      (item?.unit_price ?? 0) * (item?.quantity ?? 0),
                    );
                  },
                },
                {
                  title: "Acción",
                  key: "row_actions",
                  render: (_: any, _row: any, index: number) => (
                    <Popconfirm
                      title="Quitar producto"
                      description="¿Seguro que deseas quitar este producto del pedido?"
                      okText="Sí"
                      cancelText="No"
                      onConfirm={() => remove(index)}
                    >
                      <Button size="small">Quitar</Button>
                    </Popconfirm>
                  ),
                },
              ];

              // Total estimado reactivo
              const items: FormItem[] = form.getFieldValue("items") ?? [];
              const estimatedTotal =
                items.reduce(
                  (s, it) => s + (it?.unit_price ?? 0) * (it?.quantity ?? 0),
                  0,
                ) +
                (order?.service_fee ?? 0) +
                (order?.delivery_fee ?? 0);

              return (
                <>
                  <div
                    style={{
                      marginBottom: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text type="secondary">
                      Puede ajustar cantidades, agregar nuevos productos o
                      quitar existentes.
                    </Text>
                    <Button onClick={handleAddItem} icon={<PlusOutlined />}>
                      Agregar producto
                    </Button>
                    <AsyncButton
                      danger
                      icon={<DeleteOutlined />}
                      popConfirm={{
                        title: "Cancelar órden",
                        description: "¿Seguro que deseas eliminar este pedido?",
                        okText: "Sí",
                        cancelText: "No",
                      }}
                      onClick={() => {
                        return deleteOrderMutation.mutateAsync();
                      }}
                      loading={deleteOrderMutation.isPending}
                    >
                      Cancelar órden
                    </AsyncButton>
                  </div>

                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(_, index) => String(index)}
                    dataSource={fields}
                    columns={columns}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: 12,
                    }}
                  >
                    <Text type="secondary">
                      Total estimado: {formatPriceAccounting(estimatedTotal)}
                    </Text>
                  </div>
                  <Alert
                    title="Recuerda revisar la asignación de proveedores de este pedido después de modificarla."
                    type="info"
                    banner
                    style={{ marginTop: 12 }}
                  />
                </>
              );
            }}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
};

export default EditSaleOrderModal;
