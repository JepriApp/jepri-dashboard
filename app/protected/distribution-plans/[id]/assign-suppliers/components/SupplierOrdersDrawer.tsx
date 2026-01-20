"use client";
import { createClient } from "@/lib/supabase/client";
import { CopyOutlined, FileTextOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Drawer,
  Card,
  Space,
  Typography,
  Divider,
  message,
  Spin,
} from "antd";
import { useState } from "react";
import { formatPriceAccounting } from "@/lib/formatPrice";
import DownloadSupplierOrdersPDF from "./DownloadSupplierOrdersPDF";

const { Title, Text } = Typography;

interface SupplierOrderData {
  supplier: {
    id: string;
    name: string;
    contact?: string;
    phone?: string;
  };
  purchaseCode: string;
  items: {
    saleOrderCode: string;
    products: {
      producto: string;
      cantidad: number;
      unidad: string;
      precioUnitario: number;
      subtotal: number;
    }[];
    subtotal: number;
  }[];
  totalGeneral: number;
}

const SupplierOrdersDrawer = ({ planId }: { planId: string }) => {
  const [open, setOpen] = useState(false);
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ["distribution-plan", "supplier-orders-drawer", planId],
    enabled: open,
    queryFn: async () => {
      const { data: planData, error } = await supabase
        .from("distribution_plan")
        .select(
          `
          plan_code,
          plan_date,
          purchase_orders: purchase_order(
            id,
            purchase_code,
            supplier: supplier_id(
              id,
              name,
              contact,
              phone
            ),
            purchase_items: purchase_item(
              id,
              quantity,
              offer: offer_id(
                id,
                price,
                product: product_id(
                  name,
                  unit
                )
              ),
              fulfillments: fulfillment(
                id,
                sale_item: sale_item_id(
                  id,
                  sale_order: sale_order_id(
                    order_code
                  )
                )
              )
            )
          )
        `
        )
        .eq("id", planId)
        .single();

      if (error) throw error;

      // Procesar datos por proveedor
      const suppliersData: SupplierOrderData[] = [];

      planData.purchase_orders?.forEach((purchaseOrder: any) => {
        const itemsBySaleOrder: { [key: string]: any[] } = {};

        purchaseOrder.purchase_items.forEach((purchaseItem: any) => {
          purchaseItem.fulfillments?.forEach((fulfillment: any) => {
            const saleOrderCode =
              fulfillment.sale_item?.sale_order?.order_code || "Sin pedido";

            if (!itemsBySaleOrder[saleOrderCode]) {
              itemsBySaleOrder[saleOrderCode] = [];
            }

            itemsBySaleOrder[saleOrderCode].push({
              producto:
                purchaseItem.offer?.product?.name ||
                "Producto no especificado",
              cantidad: purchaseItem.quantity || 0,
              unidad: purchaseItem.offer?.product?.unit || "",
              precioUnitario: purchaseItem.offer?.price || 0,
              subtotal:
                (purchaseItem.quantity || 0) *
                (purchaseItem.offer?.price || 0),
            });
          });
        });

        const items = Object.entries(itemsBySaleOrder).map(
          ([saleOrderCode, products]) => ({
            saleOrderCode,
            products,
            subtotal: products.reduce((sum, item) => sum + item.subtotal, 0),
          })
        );

        const totalGeneral = items.reduce((sum, item) => sum + item.subtotal, 0);

        suppliersData.push({
          supplier: purchaseOrder.supplier,
          purchaseCode: purchaseOrder.purchase_code,
          items,
          totalGeneral,
        });
      });

      return {
        planCode: planData.plan_code,
        planDate: planData.plan_date,
        suppliers: suppliersData,
      };
    },
  });

  const copySupplierToWhatsApp = async (supplierData: SupplierOrderData) => {
    try {
      let text = `🛒 *JEPRI - ORDEN DE COMPRA*\n\n`;
      text += `📋 Plan: ${data?.planCode} - ${data?.planDate}\n\n`;
      text += `👤 *PROVEEDOR*\n`;
      text += `• Nombre: ${supplierData.supplier.name}\n`;
      text += `• Orden: ${supplierData.purchaseCode}\n`;
      if (supplierData.supplier.contact)
        text += `• Contacto: ${supplierData.supplier.contact}\n`;
      if (supplierData.supplier.phone)
        text += `• Teléfono: ${supplierData.supplier.phone}\n`;
      text += `\n`;

      supplierData.items.forEach((order) => {
        text += `📦 *Pedido: ${order.saleOrderCode}*\n`;
        text += `─────────────────────────\n`;

        order.products.forEach((item) => {
          text += `• ${item.producto}\n`;
          text += `  ${item.cantidad} ${item.unidad} × ${formatPriceAccounting(item.precioUnitario)} = ${formatPriceAccounting(item.subtotal)}\n`;
        });

        text += `\n💵 Subtotal: *${formatPriceAccounting(order.subtotal)}*\n\n`;
      });

      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `💰 *TOTAL ORDEN: ${formatPriceAccounting(supplierData.totalGeneral)}*\n`;

      await navigator.clipboard.writeText(text);
      message.success(
        `Orden de ${supplierData.supplier.name} copiada al portapapeles`
      );
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      message.error("Error al copiar al portapapeles");
    }
  };

  return (
    <>
      <Button
        type="default"
        icon={<FileTextOutlined />}
        onClick={() => setOpen(true)}
      >
        Ver órdenes de proveedores
      </Button>

      <Drawer
        title="Órdenes de Proveedores"
        placement="right"
        width={720}
        onClose={() => setOpen(false)}
        open={open}
        extra={
          <Space>
            <DownloadSupplierOrdersPDF planId={planId} />
          </Space>
        }
      >
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "50px" }}>
            <Spin size="large" />
          </div>
        ) : data?.suppliers && data.suppliers.length > 0 ? (
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            {data.suppliers.map((supplierData, index) => (
              <Card
                key={index}
                size="small"
                title={
                  <Space orientation="vertical">
                    <Text strong>{supplierData.supplier.name}</Text>
                    <Text type="secondary">
                      Orden: {supplierData.purchaseCode}
                    </Text>
                  </Space>
                }
                extra={
                  <Button
                    type="primary"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copySupplierToWhatsApp(supplierData)}
                  >
                    Copiar WhatsApp
                  </Button>
                }
              >
                <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                  {supplierData.supplier.contact && (
                    <Text type="secondary">
                      Contacto: {supplierData.supplier.contact}
                    </Text>
                  )}
                  {supplierData.supplier.phone && (
                    <Text type="secondary">
                      Teléfono: {supplierData.supplier.phone}
                    </Text>
                  )}

                  <Divider style={{ margin: "8px 0" }} />

                  {supplierData.items.map((order, orderIndex) => (
                    <div key={orderIndex}>
                      <Title level={5} style={{ marginBottom: 8 }}>
                        Pedido: {order.saleOrderCode}
                      </Title>
                      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
                        {order.products.map((product, productIndex) => (
                          <div
                            key={productIndex}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "4px 0",
                            }}
                          >
                            <Text>
                              {product.producto} - {product.cantidad}{" "}
                              {product.unidad}
                            </Text>
                            <Text>
                              {formatPriceAccounting(product.precioUnitario)} ={" "}
                              <Text strong>
                                {formatPriceAccounting(product.subtotal)}
                              </Text>
                            </Text>
                          </div>
                        ))}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            borderTop: "1px solid #f0f0f0",
                          }}
                        >
                          <Text strong>Subtotal:</Text>
                          <Text strong>
                            {formatPriceAccounting(order.subtotal)}
                          </Text>
                        </div>
                      </Space>
                    </div>
                  ))}

                  <Divider style={{ margin: "8px 0" }} />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px",
                      backgroundColor: "#f0f0f0",
                      borderRadius: "4px",
                    }}
                  >
                    <Title level={4} style={{ margin: 0 }}>
                      TOTAL ORDEN:
                    </Title>
                    <Title level={4} style={{ margin: 0 }}>
                      {formatPriceAccounting(supplierData.totalGeneral)}
                    </Title>
                  </div>
                </Space>
              </Card>
            ))}
          </Space>
        ) : (
          <Text type="secondary">No hay órdenes de compra asignadas</Text>
        )}
      </Drawer>
    </>
  );
};

export default SupplierOrdersDrawer;
