"use client";
import { Button, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useState } from "react";
import { formatPriceAccounting } from "@/lib/formatPrice";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

interface SaleOrder {
  id: string;
  order_code: string | null;
  customer: {
    id: string;
    name: string;
    identification_type: string | null;
    identification_number: string | null;
    contact: string | null;
    phone: string | null;
  };
  status:
    | "cancelled"
    | "pending"
    | "processing"
    | "out_for_delivery"
    | "delivered";
  sale_items: {
    id: string;
    required_quantity: number;
    products: {
      id: string;
      name: string;
      unit: "lb" | "kg" | "unidad" | "atado";
    };
    fulfillment: {
      id: string;
      purchase_item: {
        id: string;
        received_quantity: number;
        actual_price: number;
        purchase_order: {
          purchase_code: string | null;
        };
        offer: {
          id: string;
          supplier: {
            id: string;
            name: string | null;
          };
        };
      };
    }[];
  }[];
  service_fee: number | null;
  delivery_fee: number | null;
}

type Props = {
  data: SaleOrder[];
  serviceFeePercentage: number;
  planId: string;
};

const DownloadFinanceExcel = ({
  data,
  serviceFeePercentage,
  planId,
}: Props) => {
  const [loading, setLoading] = useState(false);

  const calculateServiceFee = (order: SaleOrder) => {
    const serviceFee = order.sale_items.reduce((acc, saleItem) => {
      const itemServiceFee = saleItem.fulfillment.reduce(
        (fAcc, fulfillment) => {
          const quantity = Number(
            fulfillment.purchase_item.received_quantity || 0,
          );
          const unitCost = Number(fulfillment.purchase_item.actual_price || 0);
          const serviceFeeAmount =
            quantity * unitCost * (serviceFeePercentage / 100);
          return fAcc + serviceFeeAmount;
        },
        0,
      );
      return acc + itemServiceFee;
    }, 0);

    return serviceFee;
  };

  const getTotal = (order: SaleOrder) => {
    const itemsTotal = order.sale_items.reduce((acc, saleItem) => {
      const itemTotal = saleItem.fulfillment.reduce((fAcc, fulfillment) => {
        const quantity = Number(
          fulfillment.purchase_item.received_quantity || 0,
        );
        const unitPrice =
          Number(fulfillment.purchase_item.actual_price || 0) *
          (1 + serviceFeePercentage / 100);
        return fAcc + quantity * unitPrice;
      }, 0);
      return acc + itemTotal;
    }, 0);
    const total = itemsTotal + (order.delivery_fee || 0);
    return total;
  };

  const generateExcel = async () => {
    try {
      setLoading(true);

      // Agrupar órdenes por cliente
      const ordersByCustomer = data.reduce(
        (acc, order) => {
          const customerId = order.customer.id;
          if (!acc[customerId]) {
            acc[customerId] = {
              customer: order.customer,
              orders: [],
            };
          }
          acc[customerId].orders.push(order);
          return acc;
        },
        {} as Record<
          string,
          { customer: SaleOrder["customer"]; orders: SaleOrder[] }
        >,
      );

      // Crear libro de trabajo
      const workbook = XLSX.utils.book_new();

      // Crear una hoja por cliente
      Object.values(ordersByCustomer).forEach((customerData) => {
        const { customer, orders } = customerData;

        // Preparar datos para la hoja
        const sheetData: any[] = [];

        // Información del cliente
        sheetData.push(["INFORMACIÓN DEL CLIENTE"]);
        sheetData.push(["Nombre:", customer.name]);
        sheetData.push([
          "Órdenes de Venta:",
          orders.map((o) => o.order_code).join(", "),
        ]);
        sheetData.push([
          "Identificación:",
          customer.identification_type && customer.identification_number
            ? `${customer.identification_type} ${customer.identification_number}`
            : "—",
        ]);
        sheetData.push(["Contacto:", customer.contact || "—"]);
        sheetData.push(["Teléfono:", customer.phone || "—"]);
        sheetData.push([]); // Fila vacía

        let totalGeneral = 0;
        let totalServicio = 0;
        let totalDomicilio = 0;
        let sumaSubtotales = 0;

        // Calcular totales primero
        orders.forEach((order) => {
          totalServicio += calculateServiceFee(order);
          totalDomicilio += order.delivery_fee || 0;
          totalGeneral += getTotal(order);
          
          // Calcular suma de subtotales (productos con comisión incluida)
          const orderSubtotals = order.sale_items.reduce((acc, saleItem) => {
            const itemTotal = saleItem.fulfillment.reduce((fAcc, fulfillment) => {
              const quantity = Number(
                fulfillment.purchase_item.received_quantity || 0,
              );
              const unitPrice =
                Number(fulfillment.purchase_item.actual_price || 0) *
                (1 + serviceFeePercentage / 100);
              return fAcc + quantity * unitPrice;
            }, 0);
            return acc + itemTotal;
          }, 0);
          sumaSubtotales += orderSubtotals;
        });

        // Agregar resumen antes de la tabla
        sheetData.push(["RESUMEN FINANCIERO"]);
        sheetData.push(["Suma de subtotales:", "", sumaSubtotales]);
        sheetData.push([
          "Comisión por venta:",
          `${serviceFeePercentage}%`,
          totalServicio,
        ]);
        sheetData.push(["Cargo por domicilio:", "", totalDomicilio]);
        sheetData.push(["TOTAL:", "", totalGeneral]);
        sheetData.push([]); // Fila vacía

        // Encabezados de la tabla de productos
        sheetData.push([
          "Producto",
          "Unidad",
          "Cantidad Entregada",
          "Costo Unitario",
          "Precio Venta Unitario",
          "Subtotal",
        ]);

        // Iterar sobre cada orden del cliente
        orders
          .sort((a, b) =>
            (a.order_code || "").localeCompare(b.order_code || ""),
          )
          .forEach((order) => {
            // Expandir items de la orden
            const items = order.sale_items.flatMap((saleItem) =>
              saleItem.fulfillment.map((fulfillment) => ({
                productName: saleItem.products.name,
                unit: saleItem.products.unit,
                quantityDelivered: fulfillment.purchase_item.received_quantity,
                actualPrice: fulfillment.purchase_item.actual_price,
              })),
            );

            // Agregar items a la hoja
            items.forEach((item) => {
              const unitSalePrice =
                Number(item.actualPrice || 0) *
                (1 + serviceFeePercentage / 100);
              const subtotal =
                Number(item.quantityDelivered || 0) * unitSalePrice;

              sheetData.push([
                item.productName,
                item.unit,
                item.quantityDelivered || 0,
                item.actualPrice || 0,
                unitSalePrice,
                subtotal,
              ]);
            });
          });

        // Crear hoja de trabajo
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

        // Ajustar anchos de columna
        const columnWidths = [
          { wch: 30 }, // Producto / Etiquetas
          { wch: 15 }, // Unidad / Valores
          { wch: 18 }, // Cantidad Entregada
          { wch: 18 }, // Costo Unitario
          { wch: 22 }, // Precio Venta Unitario
          { wch: 15 }, // Subtotal
        ];
        worksheet["!cols"] = columnWidths;

        // Nombre de la hoja (limitado a 31 caracteres)
        let sheetName = customer.name.substring(0, 31);
        // Limpiar caracteres no permitidos en nombres de hojas
        sheetName = sheetName.replace(/[:\\/?*\[\]]/g, "");

        // Agregar hoja al libro
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });

      // Generar archivo Excel
      const fileName = `finanzas_plan_${planId}_${dayjs().format("YYYY-MM-DD_HH-mm")}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      message.success("Excel descargado exitosamente");
    } catch (error) {
      console.error("Error generando Excel:", error);
      message.error("Error al generar el archivo Excel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      icon={<DownloadOutlined />}
      onClick={generateExcel}
      loading={loading}
    >
      Descargar Excel
    </Button>
  );
};

export default DownloadFinanceExcel;
