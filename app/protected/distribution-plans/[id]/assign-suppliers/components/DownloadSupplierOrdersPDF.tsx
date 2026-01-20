"use client";
import { createClient } from "@/lib/supabase/client";
import { DownloadOutlined } from "@ant-design/icons";
import { Button, message } from "antd";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatPriceAccounting } from "@/lib/formatPrice";
import dayjs from "dayjs";

const DownloadSupplierOrdersPDF = ({ planId }: { planId: string }) => {
  const supabase = createClient();

  const generatePDF = async () => {
    try {
      message.loading({ content: "Generando PDF...", key: "pdf-generation" });

      // Obtener datos del plan con purchase orders agrupadas por proveedor
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
        `,
        )
        .eq("id", planId)
        .single();

      if (error) throw error;

      if (!planData.purchase_orders || planData.purchase_orders.length === 0) {
        message.warning({
          content: "No hay órdenes de compra asignadas en este plan",
          key: "pdf-generation",
        });
        return;
      }

      const doc = new jsPDF();
      let isFirstPage = true;

      // Generar una página por cada proveedor
      planData.purchase_orders.forEach((purchaseOrder: any) => {
        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;

        const supplier = purchaseOrder.supplier;
        let yPosition = 20;

        // Header del documento
        doc.setFontSize(18);
        doc.text("JEPRI - Orden de Compra", 105, yPosition, {
          align: "center",
        });
        yPosition += 10;

        doc.setFontSize(10);
        doc.text(
          `Plan: ${planData.plan_code} - ${planData.plan_date}`,
          105,
          yPosition,
          { align: "center" },
        );
        yPosition += 15;

        // Información del proveedor
        doc.setFontSize(14);
        doc.text("Proveedor:", 20, yPosition);
        yPosition += 7;

        doc.setFontSize(11);
        doc.text(`Nombre: ${supplier.name}`, 20, yPosition);
        yPosition += 6;
        doc.text(
          `Orden de Compra: ${purchaseOrder.purchase_code}`,
          20,
          yPosition,
        );
        yPosition += 6;
        if (supplier.contact) {
          doc.text(`Contacto: ${supplier.contact}`, 20, yPosition);
          yPosition += 6;
        }
        if (supplier.phone) {
          doc.text(`Teléfono: ${supplier.phone}`, 20, yPosition);
          yPosition += 6;
        }
        yPosition += 5;

        // Agrupar items por orden de venta (solo código)
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
                purchaseItem.offer?.product?.name || "Producto no especificado",
              cantidad: purchaseItem.quantity || 0,
              unidad: purchaseItem.offer?.product?.unit || "",
              precioUnitario: purchaseItem.offer?.price || 0,
              subtotal:
                (purchaseItem.quantity || 0) * (purchaseItem.offer?.price || 0),
            });
          });
        });

        // Si no hay items
        if (Object.keys(itemsBySaleOrder).length === 0) {
          doc.setFontSize(11);
          doc.text("No hay productos asignados en esta orden.", 20, yPosition);
        } else {
          // Generar tabla por cada pedido (orden de venta)
          Object.entries(itemsBySaleOrder).forEach(([saleOrderCode, items]) => {
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(`Pedido: ${saleOrderCode}`, 20, yPosition);
            yPosition += 5;
            doc.setFont("helvetica", "normal");

            const tableData = items.map((item) => [
              item.producto,
              `${item.cantidad} ${item.unidad}`,
              formatPriceAccounting(item.precioUnitario),
              formatPriceAccounting(item.subtotal),
            ]);

            const subtotal = items.reduce(
              (sum, item) => sum + item.subtotal,
              0,
            );

            autoTable(doc, {
              startY: yPosition,
              head: [["Producto", "Cantidad", "Precio Unit.", "Subtotal"]],
              body: tableData,
              foot: [["", "", "SUBTOTAL:", formatPriceAccounting(subtotal)]],
              theme: "grid",
              headStyles: {
                fillColor: [52, 152, 219],
                textColor: 255,
                fontStyle: "bold",
              },
              footStyles: {
                fillColor: [240, 240, 240],
                textColor: 0,
                fontStyle: "bold",
              },
              styles: {
                fontSize: 9,
              },
              margin: { left: 20, right: 20 },
            });

            yPosition = (doc as any).lastAutoTable.finalY + 10;
          });

          // Total general del proveedor
          const totalGeneral = Object.values(itemsBySaleOrder)
            .flat()
            .reduce((sum: number, item: any) => sum + item.subtotal, 0);

          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text(
            `TOTAL ORDEN: ${formatPriceAccounting(totalGeneral)}`,
            20,
            yPosition,
          );
          doc.setFont("helvetica", "normal");
        }
      });

      // Descargar PDF
      doc.save(
        `ordenes-proveedores-${planData.plan_code}-${dayjs().format("YYYYMMDD")}.pdf`,
      );
      message.success({
        content: "PDF generado exitosamente",
        key: "pdf-generation",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      message.error({
        content: "Error al generar el PDF",
        key: "pdf-generation",
      });
    }
  };

  return (
    <Button type="primary" icon={<DownloadOutlined />} onClick={generatePDF}>
      Descargar pedidos PDF
    </Button>
  );
};

export default DownloadSupplierOrdersPDF;
