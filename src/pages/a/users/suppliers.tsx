import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useState } from "react";
import { 
  Table, 
  Typography, 
  Button, 
  Space, 
  Drawer, 
  Form, 
  Card, 
  Input, 
  Select, 
  InputNumber, 
  Switch, 
  Popconfirm, 
  Tag, 
  App 
} from "antd";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/services/supabase.client";
import { formatPriceAccounting } from "@/utils/formatPrice";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";

interface SupplierRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

type ProductMinimal = {
  id: string;
  name: string;
  unit: string;
  reference_price?: number | null;
};

type OfferWithProduct = {
  id: string;
  price: number;
  available: boolean;
  product: ProductMinimal;
};

type SupplierWithOffers = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  offers?: OfferWithProduct[];
};

const { Text } = Typography;

const Index = () => {
  const { message } = App.useApp();
  const [offersOpen, setOffersOpen] = useState(false);
  const [offersEditingSupplier, setOffersEditingSupplier] = useState<SupplierWithOffers | null>(null);
  const [offersForm] = Form.useForm();
  const [originalOfferIds, setOriginalOfferIds] = useState<string[]>([]);
  const [originalOffersMap, setOriginalOffersMap] = useState<Record<string, string>>({});
  const [removedOffersByProduct, setRemovedOffersByProduct] = useState<Record<string, string>>({});

  const { data = [], isLoading, refetch } = useQuery<SupplierRow[]>({
    queryKey: ["users", "suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier")
        .select(
          `
          id,
          name,
          phone,
          auth:user_id ( email )
        `
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.auth?.email,
        phone: s.phone,
      }));
    },
    staleTime: 300_000,
    retry: 1,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<ProductMinimal[]>({
    queryKey: ["products-minimal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product")
        .select("id, name, unit, reference_price")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  const openOffersDrawer = async (record: SupplierRow) => {
    // Fetch supplier offers
    const { data: supplierOffers, error } = await supabase
      .from("offer")
      .select(`
        id, price, available,
        product:product_id(id, name, unit, reference_price)
      `)
      .eq("supplier_id", record.id)
      .order("product(name)", { ascending: true });
    
    if (error) {
      message.error("Error al cargar las catálogos del proveedor");
      return;
    }

    const supplierWithOffers: SupplierWithOffers = {
      ...record,
      offers: (supplierOffers || []).map((o: any) => {
        const productObj = Array.isArray(o.product) ? o.product[0] : o.product;
        return {
          ...o,
          product: productObj || null,
        };
      }),
    };

    setOffersEditingSupplier(supplierWithOffers);
    const initialItems = (supplierWithOffers.offers || []).map((o) => ({
      id: o.id,
      product_id: o.product?.id || null,
      price: Number(o.price ?? 0),
      available: Boolean(o.available),
    }));
    
    setOriginalOfferIds(initialItems.map((i) => i.id).filter(Boolean) as string[]);
    const map: Record<string, string> = {};
    initialItems.forEach((i) => {
      if (i.id && i.product_id) map[i.id as string] = i.product_id as string;
    });
    setOriginalOffersMap(map);
    setRemovedOffersByProduct({});
    offersForm.setFieldsValue({ offers: initialItems });
    setOffersOpen(true);
  };

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    { title: "Email", dataIndex: "email", key: "email" },
    { title: "Teléfono", dataIndex: "phone", key: "phone" },
    {
      title: "Acciones",
      key: "actions",
      width: 150,
      render: (_: any, record: SupplierRow) => (
        <Button type="dashed" onClick={() => openOffersDrawer(record)}>
          Ver catálogos
        </Button>
      ),
    },
  ];

  const saveOffersMutation = useMutation({
    mutationFn: async (values: any) => {
      if (!offersEditingSupplier) throw new Error("No hay proveedor seleccionado");
      
      const formOffers = (values.offers || []).map((o: any) => {
        const revivedId = !o.id && o.product_id ? removedOffersByProduct[o.product_id] : undefined;
        const base: any = {
          product_id: o.product_id,
          price: Number(o.price ?? 0),
          available: Boolean(o.available),
          supplier_id: offersEditingSupplier.id,
        };
        if (o.id) base.id = o.id;
        else if (revivedId) base.id = revivedId;
        return base;
      });

      // Validar productos duplicados
      const productIds = formOffers.map((o: any) => o.product_id).filter(Boolean);
      const duplicates = productIds.filter((id: any, i: any) => productIds.indexOf(id) !== i);
      if (duplicates.length) {
        throw new Error("No se permiten productos duplicados en las catálogos");
      }

      // Validar inmutabilidad del producto en catálogos existentes
      for (const u of formOffers) {
        if (u.id) {
          const original = originalOffersMap[u.id as string];
          if (original && u.product_id !== original) {
            throw new Error(
              "El producto de una catálogo existente es inmutable. Si necesitas cambiar el producto, crea una nueva catálogo y elimina la anterior (si no tiene asociaciones)."
            );
          }
        }
      }

      const finalIds = formOffers.map((o: any) => o.id).filter(Boolean) as string[];
      let toDelete = originalOfferIds.filter((id) => !finalIds.includes(id));

      // Preverificación de dependencias antes de eliminar
      if (toDelete.length) {
        const { data: used, error: usedErr } = await supabase
          .from("purchase_item")
          .select("offer_id")
          .in("offer_id", toDelete);
        if (usedErr) throw usedErr;
        const blockedIds = Array.from(new Set((used || []).map((row: any) => row.offer_id)));
        if (blockedIds.length) {
          toDelete = toDelete.filter((id) => !blockedIds.includes(id));
          message.warning(
            `Se omitió la eliminación de ${blockedIds.length} catálogo(s) porque están asociadas a órdenes de compra.`
          );
        }
      }

      // Ejecutar operaciones
      // Borrados
      if (toDelete.length) {
        const { error } = await supabase.from("offer").delete().in("id", toDelete);
        if (error) throw error;
      }

      // Inserciones
      const inserts = formOffers.filter((o: any) => !o.id);
      if (inserts.length) {
        const { error } = await supabase.from("offer").insert(inserts);
        if (error) throw error;
      }

      // Actualizaciones (una por una) — sin cambiar product_id
      const updates = formOffers.filter((o: any) => !!o.id);
      for (const u of updates) {
        const { error } = await supabase
          .from("offer")
          .update({
            price: u.price,
            available: u.available,
          })
          .eq("id", u.id as string);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      message.success("Catálogos actualizadas");
      setOffersOpen(false);
      setOffersEditingSupplier(null);
      offersForm.resetFields();
      setRemovedOffersByProduct({});
      await refetch();
    },
    onError: (err: any) => {
      console.error(err);
      message.error(err?.message || "Error al actualizar las catálogos");
    },
  });

  return (
    <div>
      <Table rowKey="id" columns={columns} dataSource={data} loading={isLoading} />
      
      <Drawer
        title={`Catálogos del proveedor${offersEditingSupplier ? ` — ${offersEditingSupplier.name}` : ""}`}
        open={offersOpen}
        width={720}
        onClose={() => {
          setOffersOpen(false);
          setOffersEditingSupplier(null);
          offersForm.resetFields();
        }}
        extra={
          <Space>
            <Button
              onClick={() => {
                setOffersOpen(false);
                setOffersEditingSupplier(null);
                offersForm.resetFields();
              }}
            >
              Cancelar
            </Button>
            <Button
              type="primary"
              onClick={() => offersForm.submit()}
              loading={saveOffersMutation.isPending}
            >
              Guardar
            </Button>
          </Space>
        }
      >
        <Form
          form={offersForm}
          layout="inline"
          onFinish={(values) => saveOffersMutation.mutate(values)}
        >
          <Form.List name="offers">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: "100%" }}>
                {fields.length === 0 ? (
                  <Text type="secondary">Sin catálogos</Text>
                ) : null}

                {fields.map(({ key, name, ...restField }) => (
                  <Card
                    size="small"
                    key={key}
                    variant="outlined"
                    title={
                      offersForm.getFieldValue(["offers", name, "id"])
                        ? "Catálogo existente"
                        : "Nueva catálogo"
                    }
                  >
                    {/* Hidden id to keep track of existing offers */}
                    <Form.Item {...restField} name={[name, "id"]} hidden>
                      <Input />
                    </Form.Item>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                        alignItems: "end",
                      }}
                    >
                      {offersForm.getFieldValue(["offers", name, "id"]) ? (
                        <>
                          {/* Mantener product_id en el formulario para el submit */}
                          <Form.Item
                            {...restField}
                            name={[name, "product_id"]}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label="Producto"
                            style={{ gridColumn: "1 / 2" }}
                          >
                            <Text>
                              {(() => {
                                const pid = offersForm.getFieldValue([
                                  "offers",
                                  name,
                                  "product_id",
                                ]);
                                const product = products.find((p) => p.id === pid);
                                return product ? (
                                  <Space>
                                    <span>{product.name}</span>
                                    <Tag color="geekblue">{product.unit}</Tag>
                                    {product.reference_price && (
                                      <Text type="secondary">
                                        Ref: {formatPriceAccounting(product.reference_price)}
                                      </Text>
                                    )}
                                  </Space>
                                ) : "—";
                              })()}
                            </Text>
                          </Form.Item>
                        </>
                      ) : (
                        <Form.Item
                          {...restField}
                          name={[name, "product_id"]}
                          label="Producto"
                          rules={[
                            {
                              required: true,
                              message: "Selecciona el producto",
                            },
                          ]}
                          style={{ gridColumn: "1 / 2" }}
                        >
                          <Select
                            placeholder="Selecciona producto"
                            options={(() => {
                              const allOffers = offersForm.getFieldValue("offers") || [];
                              const currentProductId = offersForm.getFieldValue([
                                "offers",
                                name,
                                "product_id",
                              ]);
                              const usedProductIds = new Set(
                                allOffers
                                  .map((o: any, idx: any) =>
                                    idx !== name ? o?.product_id : undefined
                                  )
                                  .filter(Boolean)
                              );
                              return products
                                .filter(
                                  (p) =>
                                    !usedProductIds.has(p.id) ||
                                    p.id === currentProductId
                                )
                                .map((p) => ({ 
                                  value: p.id, 
                                  label: `${p.name} (${p.unit})${p.reference_price ? ` - Ref: ${formatPriceAccounting(p.reference_price)}` : ''}` 
                                }));
                            })()}
                            loading={productsLoading}
                            showSearch
                            optionFilterProp="label"
                            onSelect={(value) => {
                              // Auto-fill price with reference price if available
                              const selectedProduct = products.find(p => p.id === value);
                              if (selectedProduct?.reference_price) {
                                offersForm.setFieldValue(
                                  ["offers", name, "price"], 
                                  selectedProduct.reference_price
                                );
                              }
                              // Handle revival logic
                              const revivedId = removedOffersByProduct[value];
                              if (revivedId) {
                                offersForm.setFieldValue(["offers", name, "id"], revivedId);
                                setRemovedOffersByProduct(prev => {
                                  const updated = { ...prev };
                                  delete updated[value];
                                  return updated;
                                });
                              }
                            }}
                          />
                        </Form.Item>
                      )}

                      <Form.Item
                        {...restField}
                        name={[name, "price"]}
                        label="Precio"
                        rules={[
                          { required: true, message: "Ingresa el precio" },
                        ]}
                        style={{ gridColumn: "2 / 3", marginRight: 0 }}
                      >
                        <InputNumber
                          min={0}
                          style={{ width: "100%" }}
                          placeholder="0.00"
                        />
                      </Form.Item>

                      <Form.Item
                        {...restField}
                        name={[name, "available"]}
                        label="Disponible"
                        valuePropName="checked"
                        style={{ gridColumn: "1 / 2" }}
                      >
                        <Switch />
                      </Form.Item>
                      
                      <Form.Item style={{ gridColumn: "2 / 3", marginRight: 0 }}>
                        {offersForm.getFieldValue(["offers", name, "id"]) ? (
                          <Popconfirm
                            title="¿Eliminar catálogo?"
                            description="Esta acción eliminará catálogo existente."
                            onConfirm={() => {
                              const productId = offersForm.getFieldValue([
                                "offers",
                                name,
                                "product_id",
                              ]);
                              const offerId = offersForm.getFieldValue([
                                "offers",
                                name,
                                "id",
                              ]);
                              if (productId && offerId) {
                                setRemovedOffersByProduct(prev => ({
                                  ...prev,
                                  [productId]: offerId
                                }));
                              }
                              remove(name);
                            }}
                            okText="Sí"
                            cancelText="No"
                          >
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                            />
                          </Popconfirm>
                        ) : (
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => remove(name)}
                          />
                        )}
                      </Form.Item>
                    </div>
                  </Card>
                ))}

                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    add({ product_id: null, price: 0, available: true })
                  }
                  block
                >
                  Agregar catálogo
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Drawer>
    </div>
  );
};

export default Index;

Index.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};