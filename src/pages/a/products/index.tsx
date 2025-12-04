import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  App,
  Card,
  Input,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Button,
  Modal,
  Form,
  Select,
  InputNumber,
  Image,
  Drawer,
  Popconfirm,
} from "antd";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  createNewProduct,
  getProductsWithOffers,
  getSuppliersMinimal,
  ProductWithOffers,
  SupplierMinimal,
  updateProduct,
} from "@/services/productsPage";
import { createClient } from "../../../lib/supabase/client";
import placeholder from "../../../../public/images/logo.png";
import { formatPriceAccounting } from "@utils/formatPrice";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

const ProductsIndexPage = () => {
  const { message } = App.useApp();
  const [supabase] = useState(() => createClient());
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [offersOpen, setOffersOpen] = useState(false);
  const [offersEditingProduct, setOffersEditingProduct] =
    useState<ProductWithOffers | null>(null);
  const [offersForm] = Form.useForm();
  const [originalOfferIds, setOriginalOfferIds] = useState<string[]>([]);
  const [originalOffersMap, setOriginalOffersMap] = useState<
    Record<string, string>
  >({});
  const [removedOffersBySupplier, setRemovedOffersBySupplier] = useState<
    Record<string, string>
  >({});
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] =
    useState<ProductWithOffers | null>(null);
  const [editForm] = Form.useForm();

  const {
    data: products = [],
    isLoading,
    error,
    refetch,
  } = useQuery<ProductWithOffers[]>({
    queryKey: ["products-with-offers"],
    queryFn: () => getProductsWithOffers(supabase),
    staleTime: 60000,
    enabled: !!supabase,
  });

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<
    SupplierMinimal[]
  >({
    queryKey: ["suppliers-minimal"],
    queryFn: () => getSuppliersMinimal(supabase),
    staleTime: 60000,
  });

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      q
        ? p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
        : true
    );
  }, [products, query]);

  const openEditModal = (record: ProductWithOffers) => {
    setEditingProduct(record);
    editForm.setFieldsValue({
      name: record.name,
      unit: record.unit,
      reference_price: record.reference_price ?? undefined,
      description: record.description ?? "",
      main_photo: record.main_photo ?? "",
    });
    setEditOpen(true);
  };

  const openOffersDrawer = (record: ProductWithOffers) => {
    setOffersEditingProduct(record);
    const initialItems = (record.offers || []).map((o) => ({
      id: o.id,
      supplier_id: o.supplier?.id || null,
      price: Number(o.price ?? 0),
      available: Boolean(o.available),
    }));
    setOriginalOfferIds(
      initialItems.map((i) => i.id).filter(Boolean) as string[]
    );
    const map: Record<string, string> = {};
    initialItems.forEach((i) => {
      if (i.id && i.supplier_id) map[i.id as string] = i.supplier_id as string;
    });
    setOriginalOffersMap(map);
    setRemovedOffersBySupplier({});
    offersForm.setFieldsValue({ offers: initialItems });
    setOffersOpen(true);
  };

  const columns = [
    {
      title: "Producto",
      dataIndex: "name",
      key: "name",
      render: (_: any, record: ProductWithOffers) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Image
            src={record.main_photo || ""}
            fallback={placeholder.src}
            alt={record.name}
            width={64}
            height={64}
            style={{ objectFit: "cover" }}
          />
          <Space direction="vertical" size={0}>
            <Text strong>{record.name}</Text>
            {record.description ? (
              <Text type="secondary" style={{ maxWidth: 520 }}>
                {record.description}
              </Text>
            ) : null}
          </Space>
        </div>
      ),
    },
    {
      title: "Unidad",
      dataIndex: "unit",
      key: "unit",
      width: 100,
      render: (unit: string) => <Tag color="geekblue">{unit}</Tag>,
    },
    {
      title: "Precio ref.",
      dataIndex: "reference_price",
      key: "reference_price",
      width: 120,
      render: (price: number | null) => (
        <Text>
          {price != null ? formatPriceAccounting(Number(price)) : "—"}
        </Text>
      ),
    },
    {
      title: "Catálogos de proveedores",
      key: "offers",
      render: (_: any, record: ProductWithOffers) => {
        const offers = (record.offers || []).filter((o) =>
          availableOnly ? o.available : true
        );
        if (offers.length === 0)
          return <Text type="secondary">Sin Catálogos</Text>;
        const offersSorted = [...offers].sort(
          (a, b) => Number(a.price) - Number(b.price)
        );
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {offersSorted.map((o) => (
              <Tag
                key={o.id}
                color={o.available ? "green" : "default"}
                style={{ cursor: "default" }}
              >
                {o.supplier?.name || "Proveedor"} —{" "}
                {formatPriceAccounting(Number(o.price))}
              </Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: "Acciones",
      key: "actions",
      width: 220,
      render: (_: any, record: ProductWithOffers) => (
        <Space>
          <Button onClick={() => openEditModal(record)}>Modificar</Button>
          <Button type="dashed" onClick={() => openOffersDrawer(record)}>
            Editar catálogos
          </Button>
        </Space>
      ),
    },
  ];

  const createProductMutation = useMutation({
    mutationFn: async (values: any) => {
      const payload = {
        name: (values.name || "").trim(),
        unit: values.unit,
        description: values.description || null,
        reference_price:
          values.reference_price !== undefined &&
          values.reference_price !== null
            ? Number(values.reference_price)
            : null,
        main_photo: values.main_photo || null,
      };
      return createNewProduct(supabase, payload);
    },
    onSuccess: async () => {
      message.success("Producto creado exitosamente");
      setCreateOpen(false);
      form.resetFields();
      await refetch();
    },
    onError: (err: any) => {
      console.error(err);
      message.error(err?.message || "Error al crear el producto");
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (values: any) => {
      if (!editingProduct) throw new Error("No hay producto seleccionado");
      const payload = {
        description: values.description || null,
        reference_price:
          values.reference_price !== undefined &&
          values.reference_price !== null
            ? Number(values.reference_price)
            : null,
        main_photo: values.main_photo || null,
      };
      return updateProduct(supabase, editingProduct.id, payload);
    },
    onSuccess: async () => {
      message.success("Producto actualizado");
      setEditOpen(false);
      setEditingProduct(null);
      editForm.resetFields();
      await refetch();
    },
    onError: (err: any) => {
      console.error(err);
      message.error(err?.message || "Error al actualizar el producto");
    },
  });

  const saveOffersMutation = useMutation({
    mutationFn: async (values: any) => {
      if (!offersEditingProduct)
        throw new Error("No hay producto seleccionado");
      const formOffers = (values.offers || []).map((o: any) => {
        const revivedId =
          !o.id && o.supplier_id
            ? removedOffersBySupplier[o.supplier_id]
            : undefined;
        const base: any = {
          supplier_id: o.supplier_id,
          price: Number(o.price ?? 0),
          available: Boolean(o.available),
          product_id: offersEditingProduct.id,
        };
        if (o.id) base.id = o.id;
        else if (revivedId) base.id = revivedId;
        return base;
      });

      // Validar proveedores duplicados
      const supplierIds = formOffers
        .map((o: any) => o.supplier_id)
        .filter(Boolean);
      const duplicates = supplierIds.filter(
        (id: string, i: number) => supplierIds.indexOf(id) !== i
      );
      if (duplicates.length) {
        throw new Error(
          "No se permiten proveedores duplicados en las catálogos"
        );
      }

      // Validar inmutabilidad del proveedor en catálogos existentes
      for (const u of formOffers) {
        if (u.id) {
          const original = originalOffersMap[u.id as string];
          if (original && u.supplier_id !== original) {
            throw new Error(
              "El proveedor de una catálogo existente es inmutable. Si necesitas cambiar el proveedor, crea una nueva catálogo y elimina la anterior (si no tiene asociaciones)."
            );
          }
        }
      }

      const finalIds = formOffers
        .map((o: any) => o.id)
        .filter(Boolean) as string[];
      let toDelete = originalOfferIds.filter((id) => !finalIds.includes(id));

      // Preverificación de dependencias antes de eliminar
      if (toDelete.length) {
        const { data: used, error: usedErr } = await supabase
          .from("purchase_item")
          .select("offer_id")
          .in("offer_id", toDelete);
        if (usedErr) throw usedErr;
        const blockedIds = Array.from(
          new Set((used || []).map((row: any) => row.offer_id))
        );
        if (blockedIds.length) {
          // No eliminar catálogos asociadas
          toDelete = toDelete.filter((id) => !blockedIds.includes(id));
          message.warning(
            `Se omitió la eliminación de ${blockedIds.length} catálogo(s) porque están asociadas a órdenes de compra.`
          );
        }
      }

      // Ejecutar operaciones
      // Borrados
      if (toDelete.length) {
        const { error } = await supabase
          .from("offer")
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      // Inserciones
      const inserts = formOffers.filter((o: any) => !o.id);
      if (inserts.length) {
        const { error } = await supabase.from("offer").insert(inserts);
        if (error) throw error;
      }

      // Actualizaciones (una por una) — sin cambiar supplier_id
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
      setOffersEditingProduct(null);
      offersForm.resetFields();
      setRemovedOffersBySupplier({});
      await refetch();
    },
    onError: (err: any) => {
      console.error(err);
      message.error(err?.message || "Error al actualizar las catálogos");
    },
  });

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Space style={{ display: "flex", justifyContent: "space-between" }}>
        <Space>
          <Text>Solo disponibles</Text>
          <Switch checked={availableOnly} onChange={setAvailableOnly} />
        </Space>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          Nuevo producto
        </Button>
      </Space>
      <Table
        rowKey={(r) => r.id}
        loading={isLoading}
        dataSource={filteredProducts}
        columns={columns as any}
        pagination={{ pageSize: 10 }}
      />
      <Modal
        title="Nuevo producto"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createProductMutation.isPending}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createProductMutation.mutate(values)}
        >
          <Form.Item
            name="name"
            label="Nombre"
            rules={[{ required: true, message: "Ingresa el nombre" }]}
          >
            <Input placeholder="Nombre del producto" />
          </Form.Item>
          <Form.Item
            name="unit"
            label="Unidad"
            rules={[{ required: true, message: "Selecciona la unidad" }]}
          >
            <Select
              placeholder="Unidad"
              options={[
                { value: "lb", label: "lb" },
                { value: "kg", label: "kg" },
                { value: "atado", label: "atado" },
              ]}
            />
          </Form.Item>
          <Form.Item name="reference_price" label="Precio de referencia">
            <InputNumber min={0} style={{ width: "100%" }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input.TextArea rows={3} placeholder="Descripción del producto" />
          </Form.Item>
          <Form.Item name="main_photo" label="Foto principal (URL)">
            <Input placeholder="https://..." />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Modificar producto"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingProduct(null);
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateProductMutation.isPending}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => updateProductMutation.mutate(values)}
        >
          <Form.Item name="name" label="Nombre">
            <Input disabled />
          </Form.Item>
          <Form.Item name="unit" label="Unidad">
            <Select
              disabled
              options={[
                { value: "lb", label: "lb" },
                { value: "kg", label: "kg" },
                { value: "atado", label: "atado" },
              ]}
            />
          </Form.Item>
          <Form.Item name="reference_price" label="Precio de referencia">
            <InputNumber min={0} style={{ width: "100%" }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input.TextArea rows={3} placeholder="Descripción del producto" />
          </Form.Item>
          <Form.Item name="main_photo" label="Foto principal (URL)">
            <Input placeholder="https://..." />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`Editar catálogos${
          offersEditingProduct ? ` — ${offersEditingProduct.name}` : ""
        }`}
        open={offersOpen}
        width={720}
        onClose={() => {
          setOffersOpen(false);
          setOffersEditingProduct(null);
          offersForm.resetFields();
        }}
        extra={
          <Space>
            <Button
              onClick={() => {
                setOffersOpen(false);
                setOffersEditingProduct(null);
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
                          {/* Mantener supplier_id en el formulario para el submit */}
                          <Form.Item
                            {...restField}
                            name={[name, "supplier_id"]}
                            hidden
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label="Proveedor"
                            style={{ gridColumn: "1 / 2" }}
                          >
                            <Text>
                              {(() => {
                                const sid = offersForm.getFieldValue([
                                  "offers",
                                  name,
                                  "supplier_id",
                                ]);
                                return (
                                  suppliers.find((s) => s.id === sid)?.name ||
                                  "—"
                                );
                              })()}
                            </Text>
                          </Form.Item>
                        </>
                      ) : (
                        <Form.Item
                          {...restField}
                          name={[name, "supplier_id"]}
                          label="Proveedor"
                          rules={[
                            {
                              required: true,
                              message: "Selecciona el proveedor",
                            },
                          ]}
                          style={{ gridColumn: "1 / 2" }}
                        >
                          <Select
                            placeholder="Selecciona proveedor"
                            options={(() => {
                              const allOffers =
                                offersForm.getFieldValue("offers") || [];
                              const currentSupplierId =
                                offersForm.getFieldValue([
                                  "offers",
                                  name,
                                  "supplier_id",
                                ]);
                              const usedSupplierIds = new Set(
                                allOffers
                                  .map((o: any, idx: number) =>
                                    idx !== name ? o?.supplier_id : undefined
                                  )
                                  .filter(Boolean)
                              );
                              return suppliers
                                .filter(
                                  (s) =>
                                    !usedSupplierIds.has(s.id) ||
                                    s.id === currentSupplierId
                                )
                                .map((s) => ({ value: s.id, label: s.name }));
                            })()}
                            loading={suppliersLoading}
                            showSearch
                            optionFilterProp="label"
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
                      <Form.Item
                        style={{ gridColumn: "2 / 3", marginRight: 0 }}
                      >
                        {offersForm.getFieldValue(["offers", name, "id"]) ? (
                          <Popconfirm
                            title="Eliminar catálogo"
                            description="Esta catálogo ya existe. ¿Confirmas eliminarla? Se eliminará al guardar."
                            okText="Eliminar"
                            cancelText="Cancelar"
                            onConfirm={() => {
                              const existingId = offersForm.getFieldValue([
                                "offers",
                                name,
                                "id",
                              ]);
                              const existingSupplierId =
                                offersForm.getFieldValue([
                                  "offers",
                                  name,
                                  "supplier_id",
                                ]);
                              if (existingId && existingSupplierId) {
                                setRemovedOffersBySupplier((prev) => ({
                                  ...prev,
                                  [existingSupplierId]: existingId,
                                }));
                              }
                              remove(name);
                            }}
                          >
                            <Button danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        ) : (
                          <Button
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
                    add({ supplier_id: null, price: 0, available: true })
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
    </Space>
  );
};

export default ProductsIndexPage;

ProductsIndexPage.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout backButton>{page}</DashboardLayout>;
};
