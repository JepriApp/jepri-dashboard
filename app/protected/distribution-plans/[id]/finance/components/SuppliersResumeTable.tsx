"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Table, Tag } from "antd";
import React from "react";

const SuppliersResumeTable = ({ id }: { id: string }) => {
  const supabase = createClient();
  const { isPending, error, data, refetch } = useQuery({
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
            )
          )
        `
        )
        .eq("distribution_plan_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
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
      render: (_: unknown, record: any) => {
        const items = record.purchase_item || [];
        const total = items.reduce(
          (sum: number, it: any) =>
            sum +
            Number(it.received_quantity || 0) *
              Number(it.actual_price ?? it.offer?.price ?? 0),
          0
        );
        return formatPriceAccounting(total);
      },
    },
    {
      title: "Items",
      key: "po_items_count",
      render: (_: unknown, record: any) => record.purchase_item?.length ?? 0,
    },
  ];
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  return (
    <Table
      dataSource={data}
      columns={poColumns as any}
      rowKey="id"
      style={{ overflow: "auto" }}
      expandable={{
        expandedRowRender: (po) => (
          <Table
            dataSource={po.purchase_item || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={
              [
                {
                  title: "Siigo ID",
                  dataIndex: ["offer", "product", "siigo_id"],
                  key: "siigo_id",
                },
                {
                  title: "Producto/Unidad",
                  key: "product_name",
                  render: (_: unknown, it: any) => (
                    <>
                      {it?.offer?.product?.name}{" "}
                      <Tag>
                        {it?.offer?.product?.unit ?? it?.product?.unit ?? ""}
                      </Tag>
                    </>
                  ),
                },
                {
                  title: "Cantidad",
                  key: "quantity_unit",
                  render: (_: unknown, it: any) => Number(it.received_quantity || 0),
                },
                {
                  title: "Precio",
                  key: "price",
                  render: (_: unknown, it: any) =>
                    formatPriceAccounting(
                      Number(it.actual_price ?? it.offer?.price ?? 0)
                    ),
                },
                {
                  title: "Importe",
                  key: "line_total",
                  render: (_: unknown, it: any) =>
                    formatPriceAccounting(
                      Number(it.received_quantity || 0) *
                        Number(it.actual_price ?? it.offer?.price ?? 0)
                    ),
                },
              ] as any
            }
          />
        ),
      }}
    />
  );
};

export default SuppliersResumeTable;
