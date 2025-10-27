import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  Table,
  Tag,
  Button,
  Typography,
  Space,
  Modal,
  InputNumber,
  Select,
  Popconfirm,
  message,
  Alert,
} from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { type SaleOrder } from "@/services/supabase.service";
import Link from "next/link";
import { createClient as createSupabaseComponent } from "@/utils/supabase/component";
const supabase = createSupabaseComponent();
import { formatPriceAccounting } from "@/utils/formatPrice";

// Página enfocada en: seleccionar órdenes y crear el distribution plan
const { Text } = Typography;

// Tipo local para edición en el modal
type EditableItem = {
  id?: number;
  tempId?: string;
  sale_order_id: number;
  product_id?: number;
  quantity: number;
  unit_price?: number;
  product?: any;
  isNew?: boolean;
};

const Index = () => {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useQuery<SaleOrder[]>({
    queryKey: ["saleOrders"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("sale_order")
          .select(
            `
        id,
        customer_id,
        created_at,
        status,
        order_code,
        order_seq,
        service_fee,
        delivery_fee,
        notes,
        customer:customer_id (
          id,
          user_id,
          name
        ),
        distribution_plan:distribution_plan_id (
          id,
          plan_date,
          plan_code
        ),
        sale_item:sale_item (
          id,
          product_id,
          required_quantity,
          product:product_id (
            id,
            name,
            description,
            unit,
            main_photo,
            reference_price
          )
        )
      `
          )
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error al obtener órdenes pendientes:", error);
          throw error;
        }

        const adaptedData: SaleOrder[] =
          (data || []).map((order: any) => {
            const items = (order.sale_item || []).map((item: any) => ({
              id: item.id,
              sale_order_id: order.id,
              product_id: item.product_id,
              quantity: item.required_quantity,
              unit_price: item.product?.reference_price ?? 0,
              product: item.product,
            }));
            const itemsTotal = items.reduce(
              (sum: number, it: any) =>
                sum + (it.unit_price || 0) * (it.quantity || 0),
              0
            );
            const total =
              itemsTotal + (order.service_fee ?? 0) + (order.delivery_fee ?? 0);

            return {
              id: order.id,
              customer_id: order.customer_id,
              order_date: order.created_at,
              delivery_date: order?.distribution_plan?.plan_date ?? null,
              distribution_plan_code:
                order?.distribution_plan?.plan_code ?? null,
              status: order.status,
              order_code: order.order_code,
              order_seq: order.order_seq,
              total,
              service_fee: order.service_fee,
              delivery_charge: order.delivery_fee,
              notes: order.notes,
              user: {
                name: order.customer?.name ?? "Sin nombre",
                email: "Sin email",
              },
              items,
            };
          }) || [];

        return adaptedData;
      } catch (error) {
        console.error("Error en getPendingOrdersForAdmin:", error);
        throw error;
      }
    },
  });

  // Productos para poder agregar/quitar en el modal
  const { data: products = [], isLoading: productsLoading } = useQuery<any[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product")
        .select("id, name, unit, reference_price")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Estado modal de edición
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SaleOrder | null>(null);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [toDeleteIds, setToDeleteIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [removedByProductId, setRemovedByProductId] = useState<
    Record<number, number>
  >({});

  const openEditModal = (order: SaleOrder) => {
    setSelectedOrder(order);
    setEditableItems(
      (order.items || []).map((it: any) => ({
        id: it.id,
        sale_order_id: Number(order.id),
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        product: it.product,
        isNew: false,
      }))
    );
    setToDeleteIds([]);
    setEditModalOpen(true);
  };

  const addNewItem = () => {
    if (!selectedOrder) return;
    setEditableItems((prev) => [
      ...prev,
      {
        tempId: Math.random().toString(36).slice(2),
        sale_order_id: Number(selectedOrder.id),
        product_id: undefined,
        quantity: 1,
        unit_price: 0,
        product: undefined,
        isNew: true,
      },
    ]);
  };

  const removeItem = (row: EditableItem) => {
    if (row.id) {
      setToDeleteIds((prev) => [...prev, row.id!]);
      if (row.product_id) {
        setRemovedByProductId((prev) => ({
          ...prev,
          [row.product_id!]: row.id!,
        }));
      }
    }
    setEditableItems((prev) =>
      prev.filter((it) =>
        row.id ? it.id !== row.id : it.tempId !== row.tempId
      )
    );
  };

  const isSameRow = (a: EditableItem, b: EditableItem) =>
    a.id ? a.id === b.id : a.tempId === b.tempId;

  const updateItemQuantity = (row: EditableItem, value: number) => {
    const v = Number(value || 0);
    setEditableItems((prev) =>
      prev.map((it) => (isSameRow(it, row) ? { ...it, quantity: v } : it))
    );
  };

  const updateItemProduct = (row: EditableItem, productId: number) => {
    const p: any = (products || []).find((x: any) => x.id === productId);
    const resurrectId = removedByProductId[productId];
    if (resurrectId) {
      // Revive previously removed item to avoid uniqueness conflicts
      setEditableItems((prev) =>
        prev.map((it) =>
          isSameRow(it, row)
            ? {
                ...it,
                id: resurrectId,
                isNew: false,
                product_id: productId,
                product: p,
                unit_price: p?.reference_price ?? 0,
              }
            : it
        )
      );
      setToDeleteIds((prev) => prev.filter((id) => id !== resurrectId));
      setRemovedByProductId((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    } else {
      setEditableItems((prev) =>
        prev.map((it) =>
          isSameRow(it, row)
            ? {
                ...it,
                product_id: productId,
                product: p,
                unit_price: p?.reference_price ?? 0,
              }
            : it
        )
      );
    }
  };

  const originalQuantitiesMap = useMemo(() => {
    const map = new Map<number, number>();
    if (selectedOrder?.items) {
      selectedOrder.items.forEach((it: any) => {
        if (it.id) map.set(it.id, it.quantity);
      });
    }
    return map;
  }, [selectedOrder]);

  const saveChanges = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    try {
      const updates = editableItems.filter(
        (it) => it.id && originalQuantitiesMap.get(it.id!) !== it.quantity
      );
      const inserts = editableItems.filter((it) => !it.id && it.product_id);
      const deletes = toDeleteIds;

      // Limpieza de Purchase Items trasladada a triggers en BD (ver scripts/supabase_sql.sql)

      // Eliminar primero los sale_item para evitar conflictos de unicidad
      if (deletes.length > 0) {
        const { error } = await supabase
          .from("sale_item")
          .delete()
          .in("id", deletes);
        if (error) throw error;
      }

      // Limpieza de purchase_item huérfanos y purchase_order vacíos ahora manejada por triggers en BD (ver scripts/supabase_sql.sql)

      // Actualizar cantidades
      for (const it of updates) {
        const { error } = await supabase
          .from("sale_item")
          .update({ required_quantity: it.quantity })
          .eq("id", it.id!);
        if (error) throw error;
      }

      // Insertar nuevos productos
      for (const it of inserts) {
        const { error } = await supabase.from("sale_item").insert([
          {
            sale_order_id: selectedOrder.id,
            product_id: it.product_id!,
            required_quantity: it.quantity,
          },
        ]);
        if (error) throw error;
      }

      message.success("Pedido actualizado correctamente");
      setEditModalOpen(false);
      setSelectedOrder(null);
      setEditableItems([]);
      setToDeleteIds([]);
      setRemovedByProductId({});
      await queryClient.invalidateQueries({ queryKey: ["saleOrders"] });
    } catch (err) {
      console.error("Error actualizando pedido", err);
      message.error("Error al actualizar el pedido");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "Código del pedido",
      dataIndex: "order_code",
      key: "order_code",
    },

    {
      title: "Cliente",
      dataIndex: ["user", "name"],
      key: "user_name",
      render: (name: string, record: SaleOrder) => (
        <Space wrap>
          <Text>{name}</Text>
          <Text type="secondary">{record.user?.email}</Text>
        </Space>
      ),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (status: SaleOrder["status"]) => <Tag>{status}</Tag>,
    },
    {
      title: "Items",
      key: "items_count",
      render: (_: unknown, record: SaleOrder) => record.items?.length ?? 0,
    },
    {
      title: "Plan de distribución",
      dataIndex: "delivery_date",
      key: "delivery_date",
      render: (val: string | null | undefined, record: SaleOrder) =>
        val ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
            }}
          >
            <Typography.Text>
              {record.distribution_plan_code || "—"}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis>
              {dayjs(val).format("YYYY-MM-DD")}
            </Typography.Text>
          </div>
        ) : (
          <Text type="secondary">Pendiente de asignación</Text>
        ),
    },
    {
      title: "Acciones",
      key: "actions",
      render: (_: any, record: SaleOrder) => (
        <Button size="small" onClick={() => openEditModal(record)}>
          Modificar pedido
        </Button>
      ),
    },
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        <Link href="/a/sale-orders/create">
          <Button type="primary">Crear orden</Button>
        </Link>
      </div>
      <Table
        loading={isLoading}
        dataSource={orders}
        columns={columns as any}
        rowKey="id"
        expandable={{
          expandedRowRender: (record: SaleOrder) => (
            <Table
              dataSource={record.items || []}
              rowKey="id"
              pagination={false}
              size="small"
              footer={() => (
                <Space
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginRight: "32px",
                  }}
                >
                  <Typography.Text>
                    Total: {formatPriceAccounting(record.total || 0)}
                  </Typography.Text>
                </Space>
              )}
              columns={
                [
                  {
                    title: "Producto",
                    dataIndex: ["product", "name"],
                    key: "product_name",
                  },
                  {
                    title: "Cant./Unidad",
                    dataIndex: "quantity",
                    key: "quantity",
                    render: (v: number, record: any) =>
                      `${v.toFixed(2)} ${record.product?.unit || ""}`,
                  },
                  {
                    title: "Unitario",
                    dataIndex: "unit_price",
                    key: "unit_price",
                    render: (v: number) => formatPriceAccounting(v),
                  },
                  {
                    title: "Subtotal",
                    dataIndex: "subtotal",
                    key: "subtotal",
                    render: (t: number | undefined, record: any) =>
                      formatPriceAccounting(
                        (record.unit_price || 0) *
                          (record.quantity || 0).toFixed(2)
                      ),
                  },
                ] as any
              }
            />
          ),
        }}
      />

      {/* Modal de edición de pedido */}
      <Modal
        open={editModalOpen}
        title={`Modificar pedido ${selectedOrder?.order_code || ""}`}
        onCancel={() => setEditModalOpen(false)}
        onOk={saveChanges}
        okText="Guardar cambios"
        cancelText="Cancelar"
        confirmLoading={saving}
        width={900}
      >
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Text type="secondary">
            Puede ajustar cantidades, agregar nuevos productos o quitar
            existentes.
          </Text>
          <Button type="dashed" onClick={addNewItem}>
            Agregar producto
          </Button>
        </div>
        <Table
          size="small"
          pagination={false}
          rowKey={(row: EditableItem) =>
            row.id ? String(row.id) : row.tempId!
          }
          dataSource={editableItems}
          columns={[
            {
              title: "Producto",
              key: "product",
              render: (_: any, row: EditableItem) =>
                row.id ? (
                  <Space>
                    <Text>{row.product?.name || "—"}</Text>
                    <Text type="secondary">{row.product?.unit || ""}</Text>
                  </Space>
                ) : (
                  <Select
                    showSearch
                    value={row.product_id}
                    style={{ minWidth: 260 }}
                    placeholder="Seleccione producto"
                    optionFilterProp="label"
                    loading={productsLoading}
                    onChange={(val) => updateItemProduct(row, val)}
                    options={(() => {
                      const usedIds = new Set(
                        (editableItems || [])
                          .filter(
                            (it) =>
                              it.product_id != null &&
                              (row.id
                                ? it.id !== row.id
                                : it.tempId !== row.tempId)
                          )
                          .map((it) => it.product_id as number)
                      );
                      return (products || [])
                        .filter((p: any) => !usedIds.has(p.id))
                        .map((p: any) => ({
                          value: p.id,
                          label: `${p.name} ${p.unit ? `(${p.unit})` : ""}`,
                        }));
                    })()}
                  />
                ),
            },
            {
              title: "Cant./Unidad",
              dataIndex: "quantity",
              key: "quantity",
              render: (val: number, row: EditableItem) => (
                <InputNumber
                  min={0}
                  value={val}
                  onChange={(v) => updateItemQuantity(row, Number(v || 0))}
                />
              ),
            },
            {
              title: "Unitario",
              key: "unit_price",
              render: (_: any, row: EditableItem) =>
                formatPriceAccounting(row.unit_price || 0),
            },
            {
              title: "Subtotal",
              key: "subtotal",
              render: (_: any, row: EditableItem) =>
                formatPriceAccounting(
                  (row.unit_price || 0) * (row.quantity || 0)
                ),
            },
            {
              title: "Acción",
              key: "row_actions",
              render: (_: any, row: EditableItem) => (
                <Popconfirm
                  title="Quitar producto"
                  description="¿Seguro que deseas quitar este producto del pedido?"
                  okText="Sí"
                  cancelText="No"
                  onConfirm={() => removeItem(row)}
                >
                  <Button danger size="small">
                    Quitar
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
        <Alert
          message="Recuerda revisar la asignación de proveedores de este pedido despues de modificarlas."
          type="info"
          banner
        />
        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}
        >
          <Text type="secondary">
            Total estimado:{" "}
            {formatPriceAccounting(
              (editableItems || []).reduce(
                (s, it) => s + (it.unit_price || 0) * (it.quantity || 0),
                0
              ) +
                (selectedOrder?.service_fee || 0) +
                (selectedOrder?.delivery_charge || 0)
            )}
          </Text>
        </div>
      </Modal>
    </>
  );
};

export default Index;

Index.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};
