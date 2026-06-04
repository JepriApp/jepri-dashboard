import ProductImage from "@/app/protected/components/ProductImage";
import PurchaseOrderStatusTag from "@/app/protected/components/PurchaseOrderStatusTag";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Space, Table, Tooltip, Typography } from "antd";
import { ColumnsType } from "antd/es/table";
interface PurchaseOrder {
  id: string;
  status:
    | "cancelled"
    | "created"
    | "published"
    | "accepted"
    | "received"
    | "rejected";
  created_at: string | null;
  purchase_code: string | null;
  supplier: {
    id: string;
    name: string | null;
  };
  purchase_item: {
    id: string;
    quantity: number;
    actual_price: number | null;
    offer: {
      id: string;
      price: number;
      product: {
        id: string;
        name: string;
        unit: "lb" | "kg" | "unidad" | "atado";
        main_photo: string | null;
      };
    };
    fulfillment: {
      id: string;
      sale_item: {
        id: string;
        required_quantity: number;
        sale_order: {
          id: string;
          order_code: string | null;
          customer: {
            id: string;
            name: string | null;
          };
        };
      };
    }[];
  }[];
}
const PurchaseOrdersTable = ({ id }: { id: string }) => {
  const supabase = createClient();
  const { isPending, error, data } = useQuery<PurchaseOrder[]>({
    queryKey: ["distribution-plan", "components", "purchase-order-table", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order")
        .select(
          `
          id,
          status,
          purchase_code,
          supplier:supplier_id ( id, name ),
          purchase_item:purchase_item (
            id,
            quantity,
            actual_price,
            offer:offer_id (
              id,
              price,
              product:product_id (
                id,
                name,
                unit,
                main_photo
              )
            ),
            fulfillment:fulfillment (
              id,
              sale_item: sale_item_id (
                id,
                required_quantity,
                sale_order: sale_order_id (
                  id,
                  order_code)
        )
        )

          )
        `,
        )
        .eq("distribution_plan_id", id)
        .order("created_at", { ascending: true });
      if (error) {
        throw error;
      }
      return data as unknown as PurchaseOrder[];
    },
  });
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  const columns: ColumnsType<PurchaseOrder> = [
    {
      title: "# Código",
      render: (name, record) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography.Text ellipsis>
            {record.purchase_code || "Sin código"}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Proveedor",
      dataIndex: ["supplier", "name"],
      key: "supplier_name",
      render: (name) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography.Text>{name || "—"}</Typography.Text>
        </div>
      ),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      render: (
        status:
          | "created"
          | "published"
          | "accepted"
          | "received"
          | "cancelled"
          | "rejected",
      ) => <PurchaseOrderStatusTag status={status} />,
    },
    {
      title: "Total estimado",
      key: "po_total",
      render: (_, record) => {
        const items = record.purchase_item || [];
        const total = items.reduce(
          (sum: number, it) =>
            sum +
            Number(it.quantity || 0) *
              Number(it.actual_price ?? it.offer?.price ?? 0),
          0,
        );
        return formatPriceAccounting(total);
      },
    },
    {
      title: "Items",
      key: "po_items_count",
      render: (_, record) => record.purchase_item?.length ?? 0,
    },
  ];
  return (
    <Table
      dataSource={data}
      columns={columns}
      rowKey="id"
      style={{ overflow: "auto" }}
      expandable={{
        expandedRowRender: (po) => (
          <Table
            dataSource={po.purchase_item || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              {
                title: "Producto",
                key: "product_name",
                render: (_, it) => {
                  const product = it.offer.product;
                  return (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <ProductImage
                        source={product.main_photo}
                        name={product.name}
                        size="small"
                      />
                      <div>
                        <Typography.Text>
                          {it?.offer?.product?.name}
                        </Typography.Text>
                        <br />
                        <Typography.Text
                          type="secondary"
                          style={{ marginLeft: 8 }}
                        >
                          {
                            it?.fulfillment.at(0)?.sale_item.sale_order
                              .order_code
                          }
                        </Typography.Text>
                      </div>
                    </div>
                  );
                },
              },
              {
                title: "Cant./Unidad",
                key: "quantity_unit",
                render: (_, it) =>
                  `${Number(it.quantity || 0)} ${it?.offer?.product?.unit}`,
              },
              {
                title: "Precio mas reciente",
                key: "price",
                render: (_, it) =>
                  formatPriceAccounting(Number(it.offer?.price ?? 0)),
              },
              {
                title: "Precio real",
                key: "price",
                render: (_, it) =>
                  it.actual_price ? (
                    formatPriceAccounting(Number(it.actual_price ?? 0))
                  ) : (
                    <Typography.Text type="secondary">No info</Typography.Text>
                  ),
              },
              {
                title: "Importe",
                key: "line_total",
                render: (_, it) => (
                  <Space>
                    {formatPriceAccounting(
                      Number(it.quantity || 0) *
                        Number(it.actual_price ?? it.offer?.price ?? 0),
                    )}
                    {!it.actual_price && (
                      <Tooltip title="Calculado en base a la oferta mas reciente">
                        <InfoCircleOutlined style={{color:"gray"}}/>
                      </Tooltip>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        ),
      }}
    />
  );
};

export default PurchaseOrdersTable;
