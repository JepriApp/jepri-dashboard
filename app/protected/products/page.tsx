"use client";
import { useMemo, useState } from "react";
import {
  App,
  Input,
  Space,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Select,
  InputNumber,
} from "antd";
import Text from "antd/es/typography/Text";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SearchOutlined } from "@ant-design/icons";
import { createClient } from "@/lib/supabase/client";
import { listProducts } from "./services/listProducts";
import { formatPriceAccounting } from "@/lib/formatPrice";
import CreateProduct from "./components/createProduct";
import ProductImage from "../components/ProductImage";
import OfferByProductDrawer from "./components/offerByProductDrawer";

export type SupplierMinimal = {
  id: string;
  name: string | null;
  phone?: string | null;
};

export type OfferWithSupplier = {
  id: string;
  price: number;
  available: boolean;
  supplier: SupplierMinimal;
  created_at: string;
};

export type ProductWithOffers = {
  id: string;
  name: string | null;
  description?: string | null;
  unit: string;
  reference_price?: number | null;
  main_photo: string | null;
  offers?: OfferWithSupplier[];
  siigo_id: string;
};

type FormInterface = {
  name: string;
  unit: string;
  siigo_id: string;
  reference_price: number;
  description: string;
};

const ProductsIndexPage = () => {
  const supabase = createClient();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] =
    useState<ProductWithOffers | null>(null);
  const [editForm] = Form.useForm<FormInterface>();

  const {
    data: products = [],
    isLoading,
    refetch,
  } = useQuery<ProductWithOffers[]>({
    queryKey: ["products-with-offers"],
    queryFn: async () => {
      const data = await listProducts(supabase);
      return data;
    },
    staleTime: 30_000,
  }); //BUG: Aqui se usa offer. Replantear el uso

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) =>
      q
        ? p.name?.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q)
        : true,
    );
  }, [products, query]);

  const openEditModal = (record: ProductWithOffers) => {
    setEditingProduct(record);
    editForm.setFieldsValue({
      name: record.name || "",
      unit: record.unit,
      reference_price: record.reference_price ?? undefined,
      description: record.description ?? "",
      siigo_id: record.siigo_id ?? "",
    });
    setEditOpen(true);
  };

  const columns = [
    {
      title: "Producto",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: ProductWithOffers) => (
        <div
          style={{
            display: "grid",
            alignItems: "center",
            gap: 8,
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <ProductImage
            source={record.main_photo}
            name={record.name || ""}
            size="large"
          />
          <Space orientation="vertical" size={0}>
            <Text strong style={{ whiteSpace: "normal", wordBreak: "normal" }}>
              {record.name}
            </Text>
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
      title: "Proveedores",
      key: "offers",
      render: (_: unknown, record: ProductWithOffers) => {
        const offers = record.offers || [];
        if (offers.length === 0)
          return <Text type="secondary">Sin Catálogos</Text>;
        const offersSorted = [...offers].sort(
          (a, b) => Number(a.price) - Number(b.price),
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
      render: (_: unknown, record: ProductWithOffers) => (
        <Space>
          <Button onClick={() => openEditModal(record)}>Modificar</Button>
          <OfferByProductDrawer
            record={record}
            onChange={async () => {
              await queryClient.invalidateQueries({
                queryKey: ["products-with-offers"],
              });
            }}
          />
        </Space>
      ),
    },
  ];

  const updateProductMutation = useMutation({
    mutationFn: async (values: FormInterface) => {
      if (!editingProduct) throw new Error("No hay producto seleccionado");
      const payload = {
        description: values.description || null,
        reference_price:
          values.reference_price !== undefined &&
          values.reference_price !== null
            ? Number(values.reference_price)
            : null,
        siigo_id: (values.siigo_id || "").trim(),
      };
      const { data, error } = await supabase
        .from("product")
        .update(payload)
        .eq("id", editingProduct.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      message.success("Producto actualizado");
      setEditOpen(false);
      setEditingProduct(null);
      editForm.resetFields();
      await refetch();
    },
    onError: (err) => {
      console.error(err);
      message.error(err?.message || "Error al actualizar el producto");
    },
  });

  return (
    <Space orientation="vertical" style={{ width: "100%" }} size="large">
      <Space style={{ display: "flex", justifyContent: "space-between" }}>
        <Input
          placeholder="Buscar por nombre"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          prefix={<SearchOutlined />}
        />
        <CreateProduct onSubmit={refetch} />
      </Space>
      <Table
        rowKey={(r) => r.id}
        loading={isLoading}
        dataSource={filteredProducts}
        columns={columns}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title="Modificar producto"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditingProduct(null);
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateProductMutation.isPending}
        destroyOnHidden
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
          <Form.Item name="siigo_id" label="Id en Siigo">
            <Input />
          </Form.Item>
          <Form.Item name="reference_price" label="Precio de referencia">
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="0.00"
              step={50}
            />
          </Form.Item>
          <Form.Item name="description" label="Descripción">
            <Input.TextArea rows={3} placeholder="Descripción del producto" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default ProductsIndexPage;
