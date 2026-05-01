"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Table, Tag, Space, Typography } from "antd";
import React from "react";
import DownloadSuppliersFinanceExcel from "./DownloadSuppliersFinanceExcel";

type PurchaseItem = {
  id: string;
  received_quantity: number | null;
  actual_price: number | null;
  offer: {
    id: string;
    price: number;
    product: {
      id: string;
      name: string;
      unit: string;
      siigo_id: string | null;
    };
  };
  fullfillments: {
    id: string;
    sale_item: {
      id: string;
      sale_order: {
        order_code: string;
      };
    };
  }[];
};

type PurchaseOrder = {
  id: string;
  status: string;
  created_at: string;
  purchase_code: string | null;
  supplier: {
    id: string;
    name: string | null;
    contact: string | null;
    phone: string | null;
  };
  purchase_item: PurchaseItem[];
};

const SuppliersResumeTable = ({ id }: { id: string }) => {
  const supabase = createClient();
  const { isPending, error, data, refetch } = useQuery<PurchaseOrder[]>({
    queryKey: ["poForPlan", id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order")
        .select(
          `
          id,
          status,
          created_at,
          purchase_code,
          supplier:supplier_id ( id, name, contact, phone ),
          purchase_item:purchase_item (
            id,
            received_quantity,
            actual_price,
            offer:offer_id (
              id,
              price,
              product:product_id (
                id,
                name,
                unit,
                siigo_id
              )
            ),
            fullfillments: fulfillment (
              id,
              sale_item: sale_item_id (
                id,
                sale_order: sale_order_id (
                  order_code
                )
              )
            )
          )
        `,
        )
        .eq("distribution_plan_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as PurchaseOrder[];
    },
  });
  const poColumns = [
    {
      title: "# Órden de compra",
      dataIndex: "purchase_code",
      key: "purchase_code",
    },
    {
      title: "Proveedor",
      dataIndex: ["supplier", "name"],
      key: "supplier_name",
    },
    {
      title: "Contacto",
      dataIndex: ["supplier", "contact"],
      key: "supplier_contact",
    },
    {
      title: "Teléfono",
      dataIndex: ["supplier", "phone"],
      key: "supplier_phone",
    },
    {
      title: "Total",
      key: "po_total",
      render: (_: unknown, record: PurchaseOrder) => {
        const items = record.purchase_item || [];
        const total = items.reduce(
          (sum: number, it: PurchaseItem) =>
            sum +
            Number(it.received_quantity || 0) *
              Number(it.actual_price ?? it.offer?.price ?? 0),
          0,
        );
        return formatPriceAccounting(total);
      },
    },
    {
      title: "Items",
      key: "po_items_count",
      render: (_: unknown, record: PurchaseOrder) =>
        record.purchase_item?.length ?? 0,
    },
  ];
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Space style={{ display: "flex", flexDirection: "row-reverse" }}>
        <DownloadSuppliersFinanceExcel data={data} planId={id} />
      </Space>
      <Table
        dataSource={data}
        columns={poColumns}
        rowKey="id"
        style={{ overflow: "auto" }}
        expandable={{
          expandedRowRender: (po: PurchaseOrder) => (
            <Table
              dataSource={po.purchase_item || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: "Siigo ID",
                  dataIndex: ["offer", "product", "siigo_id"],
                  key: "siigo_id",
                },
                {
                  title: "Producto/Unidad",
                  key: "product_name",
                  render: (_: unknown, it: PurchaseItem) => (
                    <>
                      {it?.offer?.product?.name}{" "}
                      <Tag>{it?.offer?.product?.unit ?? ""}</Tag>
                      <Typography.Text type="secondary">
                        {it.fullfillments
                          ?.map((f) => f.sale_item.sale_order.order_code)
                          .join(", ")}
                      </Typography.Text>
                    </>
                  ),
                },
                {
                  title: "Cantidad",
                  key: "quantity_unit",
                  render: (_: unknown, it: PurchaseItem) =>
                    Number(it.received_quantity || 0),
                },
                {
                  title: "Precio",
                  key: "price",
                  render: (_: unknown, it: PurchaseItem) =>
                    formatPriceAccounting(
                      Number(it.actual_price ?? it.offer?.price ?? 0),
                    ),
                },
                {
                  title: "Importe",
                  key: "line_total",
                  render: (_: unknown, it: PurchaseItem) =>
                    formatPriceAccounting(
                      Number(it.received_quantity || 0) *
                        Number(it.actual_price ?? it.offer?.price ?? 0),
                    ),
                },
              ]}
            />
          ),
        }}
      />
    </Space>
  );
};

export default SuppliersResumeTable;
