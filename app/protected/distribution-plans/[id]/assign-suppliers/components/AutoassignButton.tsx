"use client";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, message, Modal, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { formatPriceAccounting } from "@/lib/formatPrice";

interface AutoAssignment {
  saleItemId: string;
  productName: string;
  productUnit: string;
  requiredQuantity: number;
  currentAssignedQuantity: number;
  supplierName: string;
  supplierId: string;
  offerId: string;
  offerPrice: number;
}

const AutoassignButton = ({
  planId,
  onSuccess,
}: {
  planId: string;
  onSuccess?: () => Promise<void>;
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const distributionPlanQuery = useQuery({
    queryKey: ["distribution-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
          id,
          status
        `,
        )
        .eq("id", planId)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
  const {
    data: autoAssignments,
    isFetching,
    refetch,
    error,
  } = useQuery<AutoAssignment[]>({
    queryKey: ["auto-assignments", planId],
    queryFn: async () => {
      // Obtener todos los sale_items del plan
      const { data: saleOrders, error: saleOrdersError } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          sale_items:sale_item(
            id,
            required_quantity,
            product:product_id(
              id,
              name,
              unit
            ),
            fulfillments:fulfillment(
              id,
              purchase_items:purchase_item_id(
                id,
                quantity,
                offer_id
              )
            )
          )
        `,
        )
        .eq("distribution_plan_id", planId);

      if (saleOrdersError) throw saleOrdersError;

      const assignments: AutoAssignment[] = [];

      // Para cada sale_item, verificar si tiene solo un proveedor
      for (const order of saleOrders || []) {
        for (const saleItem of (order as any).sale_items || []) {
          // Obtener ofertas disponibles para este producto
          const { data: offers, error: offersError } = await supabase
            .from("offer")
            .select(
              `
              id,
              price,
              supplier:supplier_id(
                id,
                name
              )
            `,
            )
            .eq("product_id", saleItem.product.id);

          if (offersError) throw offersError;

          // Si hay exactamente una oferta
          if (offers && offers.length === 1) {
            const offer = offers[0];

            // Calcular cantidad ya asignada
            const currentAssignedQuantity = saleItem.fulfillments.reduce(
              (sum: number, f: any) => sum + (f.purchase_items?.quantity || 0),
              0,
            );

            // Solo incluir si la cantidad requerida no está completamente asignada
            if (currentAssignedQuantity < saleItem.required_quantity) {
              assignments.push({
                saleItemId: saleItem.id,
                productName: saleItem.product.name,
                productUnit: saleItem.product.unit,
                requiredQuantity: saleItem.required_quantity,
                currentAssignedQuantity,
                supplierName: (offer.supplier as any).name || "Sin nombre",
                supplierId: (offer.supplier as any).id,
                offerId: offer.id,
                offerPrice: offer.price,
              });
            }
          }
        }
      }

      return assignments;
    },
    enabled: false, // Solo ejecutar cuando se abra el modal
    staleTime: 0, // Los datos siempre son considerados obsoletos
    gcTime: 0, // No mantener en caché
  });

  const executeAutoAssignMutation = useMutation({
    mutationKey: ["execute-auto-assign", planId],
    mutationFn: async (assignments: AutoAssignment[]) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error(
          "Usuario no autenticado: no se puede crear/actualizar órdenes de compra",
        );
      }

      const { data: adminData, error: adminError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (adminError) throw adminError;

      // Procesar cada asignación
      for (const assignment of assignments) {
        const quantityToAssign =
          assignment.requiredQuantity - assignment.currentAssignedQuantity;

        if (quantityToAssign <= 0) continue;

        // Buscar o crear purchase order para el proveedor
        let { data: existingPO, error: poQueryErr } = await supabase
          .from("purchase_order")
          .select("id")
          .eq("distribution_plan_id", planId)
          .eq("supplier_id", assignment.supplierId)
          .limit(1)
          .single();

        if (poQueryErr && poQueryErr.code !== "PGRST116") throw poQueryErr;

        let poId = existingPO?.id;

        if (!poId) {
          // Crear nueva purchase order
          const { data: newPO, error: createPOErr } = await supabase
            .from("purchase_order")
            .insert({
              distribution_plan_id: planId,
              supplier_id: assignment.supplierId,
              notes: "Creada por autoasignación",
              created_by: adminData.id,
            })
            .select("id")
            .single();

          if (createPOErr) throw createPOErr;
          poId = newPO.id;
        }

        // Crear purchase item
        const { data: newPI, error: createPIErr } = await supabase
          .from("purchase_item")
          .insert({
            purchase_order_id: poId,
            offer_id: assignment.offerId,
            quantity: quantityToAssign,
          })
          .select("id")
          .single();

        if (createPIErr) throw createPIErr;

        // Crear fulfillment
        const { error: fulfillErr } = await supabase
          .from("fulfillment")
          .insert({
            sale_item_id: assignment.saleItemId,
            purchase_item_id: newPI.id,
          });

        if (fulfillErr) throw fulfillErr;
      }
    },
    onMutate: () => {
      message.loading({
        content: "Ejecutando autoasignación...",
        key: "auto-assign",
      });
    },
    onSuccess: async () => {
      message.success({
        content: "Autoasignación completada exitosamente",
        key: "auto-assign",
        duration: 2,
      });
      setIsModalOpen(false);

      // Invalidar las queries relevantes
      await queryClient.invalidateQueries({
        queryKey: [
          "distribution-plan",
          "components",
          "sale-order-table",
          planId,
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["distribution-plan"],
      });

      await onSuccess?.();
    },
    onError: (err: Error) => {
      console.error("Error en autoasignación", err);
      message.error({
        content: "Error al ejecutar autoasignación: " + err.message,
        key: "auto-assign",
      });
    },
  });

  const handleOpenModal = async () => {
    setIsModalOpen(true);
    // Invalidar la caché para asegurar datos frescos
    await queryClient.invalidateQueries({
      queryKey: ["auto-assignments", planId],
    });
    await refetch();
  };

  const handleConfirm = async () => {
    if (autoAssignments && autoAssignments.length > 0) {
      await executeAutoAssignMutation.mutateAsync(autoAssignments);
    }
  };

  const columns = [
    {
      title: "Producto",
      dataIndex: "productName",
      key: "productName",
      render: (text: string, record: AutoAssignment) => (
        <div>
          <Typography.Text strong>{text}</Typography.Text>
          <br />
          <Tag>{record.productUnit}</Tag>
        </div>
      ),
    },
    {
      title: "Cantidad",
      key: "quantity",
      render: (_: any, record: AutoAssignment) => (
        <div>
          <Typography.Text>
            Requerida: <strong>{record.requiredQuantity}</strong>
          </Typography.Text>
          <br />
          <Typography.Text type="secondary">
            Asignada: {record.currentAssignedQuantity}
          </Typography.Text>
          <br />
          <Typography.Text type="success">
            Por asignar:{" "}
            <strong>
              {record.requiredQuantity - record.currentAssignedQuantity}
            </strong>
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Proveedor",
      dataIndex: "supplierName",
      key: "supplierName",
      render: (text: string, record: AutoAssignment) => (
        <div>
          <Typography.Text>{text}</Typography.Text>
          <br />
          <Typography.Text type="secondary">
            Precio: {formatPriceAccounting(record.offerPrice)}
          </Typography.Text>
        </div>
      ),
    },
  ];
  const isComponentDisabled =
    distributionPlanQuery.data?.status === "completed" ||
    distributionPlanQuery.data?.status === "cancelled";
  if (distributionPlanQuery.isPending) return "Loading...";
  if (error || distributionPlanQuery.error)
    return "An error has occurred: " + error?.message;
  return (
    <>
      <Button
        type="primary"
        onClick={handleOpenModal}
        loading={isFetching}
        disabled={isComponentDisabled}
      >
        Autoasignar
      </Button>

      <Modal
        title="Autoasignación de proveedores"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleConfirm}
        okText="Confirmar asignación"
        cancelText="Cancelar"
        width={800}
        confirmLoading={executeAutoAssignMutation.isPending}
        okButtonProps={{
          disabled: !autoAssignments || autoAssignments.length === 0,
        }}
      >
        {isFetching ? (
          <Typography.Text>Analizando asignaciones...</Typography.Text>
        ) : autoAssignments && autoAssignments.length > 0 ? (
          <>
            <Typography.Paragraph>
              Se encontraron <strong>{autoAssignments.length}</strong>{" "}
              producto(s) con un único proveedor disponible que se asignarán
              automáticamente:
            </Typography.Paragraph>
            <Table
              dataSource={autoAssignments}
              columns={columns}
              rowKey="saleItemId"
              pagination={false}
              size="small"
            />
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              Al confirmar, se crearán o actualizarán las órdenes de compra
              necesarias.
            </Typography.Paragraph>
          </>
        ) : (
          <Typography.Paragraph>
            No se encontraron productos con un único proveedor disponible para
            autoasignar.
          </Typography.Paragraph>
        )}
      </Modal>
    </>
  );
};

export default AutoassignButton;
