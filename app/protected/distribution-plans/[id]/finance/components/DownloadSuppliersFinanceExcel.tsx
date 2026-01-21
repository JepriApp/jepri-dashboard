"use client";
import { Button, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useState } from "react";
import dayjs from "dayjs";
import * as XLSX from "xlsx";

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

type Props = {
  data: PurchaseOrder[];
  planId: string;
};

const DownloadSuppliersFinanceExcel = ({ data, planId }: Props) => {
  const [loading, setLoading] = useState(false);

  const generateExcel = async () => {
    try {
      setLoading(true);

      // Crear libro de trabajo
      const workbook = XLSX.utils.book_new();

      // Preparar datos para una sola hoja
      const sheetData: any[] = [];

      // Agrupar por proveedor
      const supplierGroups = data.reduce(
        (acc, order) => {
          const supplierId = order.supplier.id;
          if (!acc[supplierId]) {
            acc[supplierId] = {
              supplier: order.supplier,
              orders: [],
            };
          }
          acc[supplierId].orders.push(order);
          return acc;
        },
        {} as Record<
          string,
          { supplier: PurchaseOrder["supplier"]; orders: PurchaseOrder[] }
        >,
      );

      // Iterar sobre cada proveedor y agregar a la misma hoja
      Object.values(supplierGroups).forEach((supplierData, index) => {
        const { supplier, orders } = supplierData;

        // Agregar separador entre proveedores (excepto el primero)
        if (index > 0) {
          sheetData.push([]);
          sheetData.push(["═".repeat(80)]);
          sheetData.push([]);
        }

        // Información del proveedor
        sheetData.push(["INFORMACIÓN DEL PROVEEDOR"]);
        sheetData.push(["Nombre:", supplier.name || "—"]);
        sheetData.push([
          "Órdenes de Compra:",
          orders.map((o) => o.purchase_code).join(", "),
        ]);
        sheetData.push(["Contacto:", supplier.contact || "—"]);
        sheetData.push(["Teléfono:", supplier.phone || "—"]);
        sheetData.push([]); // Fila vacía

        let totalGeneral = 0;

        // Calcular total
        orders.forEach((order) => {
          const orderTotal = (order.purchase_item || []).reduce(
            (sum, item) =>
              sum +
              Number(item.received_quantity || 0) *
                Number(item.actual_price ?? item.offer?.price ?? 0),
            0,
          );
          totalGeneral += orderTotal;
        });

        // Resumen
        sheetData.push(["RESUMEN"]);
        sheetData.push(["TOTAL:", "", totalGeneral]);
        sheetData.push([]); // Fila vacía

        // Encabezados de la tabla de productos
        sheetData.push([
          "Orden de Compra",
          "Siigo ID",
          "Producto",
          "Unidad",
          "Cantidad",
          "Precio",
          "Importe",
        ]);

        // Iterar sobre cada orden del proveedor
        orders
          .sort((a, b) =>
            (a.purchase_code || "").localeCompare(b.purchase_code || ""),
          )
          .forEach((order) => {
            const items = order.purchase_item || [];

            // Agregar items a la hoja
            items.forEach((item) => {
              const quantity = Number(item.received_quantity || 0);
              const price = Number(
                item.actual_price ?? item.offer?.price ?? 0,
              );
              const lineTotal = quantity * price;

              sheetData.push([
                order.purchase_code || "—",
                item.offer?.product?.siigo_id || "—",
                item.offer?.product?.name || "—",
                item.offer?.product?.unit || "—",
                quantity,
                price,
                lineTotal,
              ]);
            });
          });
      });

      // Crear hoja de trabajo
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

      // Ajustar anchos de columna
      const columnWidths = [
        { wch: 20 }, // Orden de Compra
        { wch: 12 }, // Siigo ID
        { wch: 30 }, // Producto
        { wch: 10 }, // Unidad
        { wch: 12 }, // Cantidad
        { wch: 15 }, // Precio
        { wch: 15 }, // Importe
      ];
      worksheet["!cols"] = columnWidths;

      // Agregar hoja al libro
      XLSX.utils.book_append_sheet(workbook, worksheet, "Proveedores");

      // Generar archivo Excel
      const fileName = `proveedores_plan_${planId}_${dayjs().format("YYYY-MM-DD_HH-mm")}.xlsx`;
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

export default DownloadSuppliersFinanceExcel;
