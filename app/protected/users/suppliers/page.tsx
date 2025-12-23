"use client";
import {
  Table,
  Space,
} from "antd";
import { useQuery } from "@tanstack/react-query";
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
};

export type OfferWithProduct = {
  id: string;
  price: number;
  available: boolean;
  product_id?:string;
  product: ProductMinimal;
};

export type SupplierWithOffers = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  offers?: OfferWithProduct[];
};



const Index = () => {
  const supabase = createClient();
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

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    { title: "Contacto", dataIndex: "contact", key: "contact" },
    { title: "Teléfono", dataIndex: "phone", key: "phone" },
    {
      title: "Acciones",
      key: "actions",
      render: (_: unknown, record: SupplierRow) => (
        <Space>
          <OfferBySupplierDrawer record={record} onSuccess={async () => {
            await refetch();
          }}/>
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
    </div>
  );
};

export default Index;
