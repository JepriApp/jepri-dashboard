"use client";
import {
  Alert,
  App,
  Modal,
  Space,
  Switch,
  Table,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listSuppliers } from "../../services/listSuppliers";
import OfferBySupplierDrawer from "./components/offerBySupplierDrawer";
import CreateSupplierModal from "./components/createSupplierModal";

export interface SupplierRow {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  contact?: string;
  is_active?: boolean;
}

export type ProductMinimal = {
  id: string;
  name: string;
  unit: string;
  reference_price?: number | null;
  main_photo: string | null;
};

export type OfferWithProduct = {
  id: string;
  price: number;
  available: boolean;
  product_id?:string;
  product: ProductMinimal;
  created_at: string;
};

export type SupplierWithOffers = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  offers?: OfferWithProduct[];
};

interface AffectedProduct {
  id: string;
  name: string;
}

const Index = () => {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [checkingSupplierId, setCheckingSupplierId] = useState<string | null>(
    null,
  );
  const [pendingDeactivation, setPendingDeactivation] = useState<{
    supplier: SupplierRow;
    affectedProducts: AffectedProduct[];
  } | null>(null);

  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery<SupplierRow[]>({
    queryKey: ["users", "suppliers"],
    queryFn: async () => {
      const data = await listSuppliers(supabase);
      return data;
    },
    staleTime: 300_000,
    retry: 1,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({
      supplierId,
      isActive,
    }: {
      supplierId: string;
      isActive: boolean;
    }) => {
      const { error } = await supabase
        .from("supplier")
        .update({ is_active: isActive })
        .eq("id", supplierId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", "suppliers"] });
    },
    onError: () => {
      message.error("No se pudo actualizar el estado del proveedor");
    },
  });

  // Antes de desactivar, revisa si algún producto de este proveedor se
  // quedaría sin ningún otro proveedor activo disponible.
  const findProductsLeftWithoutActiveSupplier = async (
    supplierId: string,
  ): Promise<AffectedProduct[]> => {
    const { data: supplierOffers, error } = await supabase
      .from("offer")
      .select("product_id, product:product_id(id, name)")
      .eq("supplier_id", supplierId)
      .eq("available", true);
    if (error) throw error;

    const productIds = Array.from(
      new Set((supplierOffers ?? []).map((o) => o.product_id)),
    );
    if (productIds.length === 0) return [];

    const { data: otherOffers, error: otherError } = await supabase
      .from("offer")
      .select("product_id, supplier:supplier_id(is_active)")
      .in("product_id", productIds)
      .eq("available", true)
      .neq("supplier_id", supplierId);
    if (otherError) throw otherError;

    const productsWithActiveAlternative = new Set(
      (otherOffers ?? [])
        .filter((o) => o.supplier?.is_active)
        .map((o) => o.product_id),
    );

    const seen = new Set<string>();
    const affected: AffectedProduct[] = [];
    for (const offer of supplierOffers ?? []) {
      if (productsWithActiveAlternative.has(offer.product_id)) continue;
      if (seen.has(offer.product_id)) continue;
      seen.add(offer.product_id);
      affected.push({
        id: offer.product_id,
        name: offer.product?.name || "Producto sin nombre",
      });
    }
    return affected;
  };

  const handleToggleActive = async (
    record: SupplierRow,
    checked: boolean,
  ) => {
    if (checked) {
      toggleActiveMutation.mutate({ supplierId: record.id, isActive: true });
      return;
    }
    setCheckingSupplierId(record.id);
    try {
      const affectedProducts = await findProductsLeftWithoutActiveSupplier(
        record.id,
      );
      if (affectedProducts.length > 0) {
        setPendingDeactivation({ supplier: record, affectedProducts });
      } else {
        toggleActiveMutation.mutate({
          supplierId: record.id,
          isActive: false,
        });
      }
    } catch (err) {
      console.error("Error revisando el impacto de desactivar", err);
      message.error(
        "No se pudo revisar el impacto de desactivar este proveedor",
      );
    } finally {
      setCheckingSupplierId(null);
    }
  };

  const confirmDeactivation = () => {
    if (pendingDeactivation) {
      toggleActiveMutation.mutate({
        supplierId: pendingDeactivation.supplier.id,
        isActive: false,
      });
    }
    setPendingDeactivation(null);
  };

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    { title: "Contacto", dataIndex: "contact", key: "contact" },
    { title: "Teléfono", dataIndex: "phone", key: "phone" },
    {
      title: "Activo",
      key: "is_active",
      render: (_: unknown, record: SupplierRow) => (
        <Switch
          checked={record.is_active ?? true}
          loading={
            checkingSupplierId === record.id ||
            (toggleActiveMutation.isPending &&
              toggleActiveMutation.variables?.supplierId === record.id)
          }
          onChange={(checked) => handleToggleActive(record, checked)}
        />
      ),
    },
    {
      title: "Acciones",
      key: "actions",
      render: (_: unknown, record: SupplierRow) => (
        <Space>
          <OfferBySupplierDrawer record={record} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Nuevo: botón para crear proveedor */}
      <Space style={{ marginBottom: 16 }}>
        <CreateSupplierModal onSuccess={async () => {
          await refetch();
        }} />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading}
      />
      <Modal
        title="Desactivar proveedor"
        open={!!pendingDeactivation}
        onCancel={() => setPendingDeactivation(null)}
        onOk={confirmDeactivation}
        okText="Desactivar de todas formas"
        okButtonProps={{ danger: true }}
        cancelText="Cancelar"
      >
        <Alert
          type="warning"
          showIcon
          title={`Al desactivar a "${pendingDeactivation?.supplier.name}", estos productos quedarán sin ningún proveedor activo disponible`}
          description={
            <ul style={{ marginBottom: 0 }}>
              {pendingDeactivation?.affectedProducts.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          }
        />
      </Modal>
    </div>
  );
};

export default Index;
