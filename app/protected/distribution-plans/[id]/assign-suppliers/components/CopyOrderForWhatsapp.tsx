import { CopyOutlined } from "@ant-design/icons";
import { Button, message } from "antd";
import React from "react";

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

interface CopyOrderForWhatsappProps {
  supplierData: SupplierOrderData;
  planCode: string;
  planDate: string;
}

const CopyOrderForWhatsapp = ({
  supplierData,
  planCode,
  planDate,
}: CopyOrderForWhatsappProps) => {
  const copySupplierToWhatsApp = async () => {
    try {
      let text = `🛒 *JEPRI - ORDEN DE COMPRA*\n\n`;
      text += `📋 Plan: ${planCode} - ${planDate}\n\n`;
      text += `👤 *PROVEEDOR*\n`;
      text += `• Nombre: ${supplierData.supplier.name}\n`;
      text += `• Orden: ${supplierData.purchaseCode}\n`;
      if (supplierData.supplier.contact)
        text += `• Contacto: ${supplierData.supplier.contact}\n`;
      if (supplierData.supplier.phone)
        text += `• Teléfono: ${supplierData.supplier.phone}\n`;
      text += `\n`;

      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

      supplierData.items.forEach((order) => {
        text += `📦 *Pedido: ${order.saleOrderCode}*\n`;

        order.products.forEach((item) => {
          text += `• ${item.producto}: `;
          text += `  ${item.cantidad} ${item.unidad} \n`;
        });
      });

      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

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
    <Button size="small" icon={<CopyOutlined />} onClick={copySupplierToWhatsApp}>
      Copiar para WhatsApp
    </Button>
  );
};

export default CopyOrderForWhatsapp;
