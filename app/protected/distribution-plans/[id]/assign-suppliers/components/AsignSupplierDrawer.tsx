"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Drawer,
  Form,
  InputNumber,
  message,
  Tag,
  Typography,
} from "antd";
import Image from "next/image";
import { useState } from "react";
import CreateNewOfferButton from "./CreateNewOfferButton";

interface SaleItem {
  id: string;
  required_quantity: number;
  sale_order: {
    id: string;
    distribution_plan_id: string;
  };
  product: {
    id: string;
    name: string;
    unit: "lb" | "kg" | "unidad" | "atado";
    main_photo: string | null;
  };
  fulfillments: {
    id: string;
    purchase_items: {
      id: string;
      quantity: number;
      offer_id: string;
      purchase_order_id: string;
    };
  }[];
}
interface Offer {
  id: string;
  price: number;
  supplier: {
    id: string;
    name: string | null;
  };
}
const AsignSupplierDrawer = ({
  planId,
  saleItemId,
  onSuccess,
}: {
  planId: string;
  saleItemId: string;
  onSuccess?: () => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const supabase = createClient();
  const { isPending, error, data, refetch } = useQuery<{
    saleItem: SaleItem;
    offers: Offer[];
  }>({
    queryKey: [
      "distribution-plan",
      "components",
      "asign-supplier-drawer",
      {
        planId,
        saleItemId,
      },
    ],
    queryFn: async () => {
      const { data: saleItemData, error: saleItemError } = await supabase
        .from("sale_item")
        .select(
          `
          id,
          required_quantity,
          sale_order: sale_order_id(
            id,
            distribution_plan_id
          ),
          product: product_id(
            id,
            name,
            unit,
            main_photo
          ),
          fulfillments: fulfillment(
            id,
            purchase_items: purchase_item_id(
              id,
              quantity,
              offer_id,
              purchase_order_id
            )
          )
        `
        )
        .eq("id", saleItemId)
        .single();
      if (saleItemError) {
        throw saleItemError;
      }
      const { data: offerData, error: offerError } = await supabase
        .from("offer")
        .select(
          `
            id,
            price,
            supplier: supplier_id(
              id,
              name
            )
            `
        )
        .eq("product_id", saleItemData?.product.id);
      if (offerError) {
        throw offerError;
      }
      return {
        saleItem: saleItemData as SaleItem,
        offers: offerData as Offer[],
      };
    },
  });
  const [form] = Form.useForm<{
    assignments: { quantity: number; offerId: string }[];
  }>();
  const currentAssignments = Form.useWatch("assignments", form);
  const getInitialValues = (data: { saleItem: SaleItem; offers: Offer[] }) => {
    return {
      assignments: data?.offers.map((o) => ({
        quantity:
          data.saleItem.fulfillments.find(
            (f) => f.purchase_items.offer_id === o.id
          )?.purchase_items.quantity || 0,
        offerId: o.id,
      })),
    };
  };
  // Helper: localizar PI/PO existentes para este sale item y proveedor
  const findExistingForSupplier = (supplierId: string) => {
    let found: {
      purchaseItemId?: string;
      purchaseOrderId?: string;
      fulfillmentId?: string;
    } = {};

    // Encontrar la oferta que corresponde a este proveedor
    const offer = data?.offers.find((o) => o.supplier.id === supplierId);
    if (!offer) return found;

    // Buscar en los fulfillments si existe un purchase_item con este offer_id
    const fulfillment = data?.saleItem.fulfillments.find(
      (f) => f.purchase_items.offer_id === offer.id
    );

    if (fulfillment) {
      found = {
        purchaseItemId: fulfillment.purchase_items.id,
        purchaseOrderId: fulfillment.purchase_items.purchase_order_id,
        fulfillmentId: fulfillment.id,
      };
    }

    return found;
  };
  const saveAssignmentsMutation = useMutation({
    mutationKey: [
      "saveAssignments",
      {
        planId,
        saleItemId,
      },
    ],
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id)
        throw new Error(
          "Usuario no autenticado: no se puede crear/actualizar órdenes de compra"
        );
      const { data: adminData, error: adminError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user?.id)
        .single();
      if (adminError) throw adminError;
      const values = await form.validateFields();
      const initialValues = getInitialValues(data!);
      // Iterar las ofertas del producto actual y aplicar cambios donde difiera de lo ya asignado
      for (const [index, assignment] of values.assignments.entries()) {
        const offerId = assignment.offerId;
        const offer = data!.offers.find((o) => o.id === offerId);
        if (!offer) continue;

        const supplierId = offer.supplier.id;
        const actualQty = assignment.quantity;
        const initialQty = initialValues.assignments[index].quantity;
        if (actualQty === initialQty) continue;
        const {
          purchaseItemId: existingPI,
          purchaseOrderId: existingPO,
          fulfillmentId,
        } = findExistingForSupplier(supplierId);

        if (actualQty <= 0) {
          // Eliminar asignación: borrar fulfillment, purchase_item y quizá la PO si queda vacía
          if (existingPI) {
            // Borrar el fulfillment específico (por id si está disponible)
            if (fulfillmentId) {
              const { error: delFulErr } = await supabase
                .from("fulfillment")
                .delete()
                .eq("id", fulfillmentId);
              if (delFulErr) throw delFulErr;
            } else {
              const { error: delFulErr } = await supabase
                .from("fulfillment")
                .delete()
                .eq("sale_item_id", saleItemId)
                .eq("purchase_item_id", existingPI);
              if (delFulErr) throw delFulErr;
            }

            // Eliminar el purchase_item (si ya no tiene más vínculos)
            const { data: refs, error: refErr } = await supabase
              .from("fulfillment")
              .select("id")
              .eq("purchase_item_id", existingPI)
              .limit(1);
            if (refErr) throw refErr;
            if (!refs || refs.length === 0) {
              const { error: delPIErr } = await supabase
                .from("purchase_item")
                .delete()
                .eq("id", existingPI);
              if (delPIErr) throw delPIErr;
            }

            if (existingPO) {
              const { data: remaining, error: remErr } = await supabase
                .from("purchase_item")
                .select("id")
                .eq("purchase_order_id", existingPO)
                .limit(1);
              if (remErr) throw remErr;
              if (!remaining || remaining.length === 0) {
                const { error: delPOErr } = await supabase
                  .from("purchase_order")
                  .delete()
                  .eq("id", existingPO);
                if (delPOErr) throw delPOErr;
              }
            }
          }
          continue;
        }

        // Asegurar purchase order para el proveedor en el plan
        let poId = existingPO;
        if (!poId) {
          // Buscar si ya existe una PO para este proveedor en este plan
          const { data: existingPOData, error: poQueryErr } = await supabase
            .from("purchase_order")
            .select("id")
            .eq("distribution_plan_id", planId)
            .eq("supplier_id", supplierId)
            .limit(1)
            .single();

          if (poQueryErr && poQueryErr.code !== "PGRST116") throw poQueryErr;

          if (existingPOData) {
            poId = existingPOData.id;
          } else {
            // Crear nueva PO
            const { data: newPO, error: createPOErr } = await supabase
              .from("purchase_order")
              .insert({
                distribution_plan_id: planId,
                supplier_id: supplierId,
                notes: null,
                created_by: adminData.id,
              })
              .select("id")
              .single();
            if (createPOErr) throw createPOErr;
            poId = newPO?.id;
          }
        }

        // Asegurar/actualizar purchase item para la oferta
        let piId = existingPI;
        if (piId) {
          // Actualizar cantidad del purchase item existente
          const { error: updErr } = await supabase
            .from("purchase_item")
            .update({
              quantity: actualQty,
            })
            .eq("id", piId);
          if (updErr) throw updErr;
        } else {
          // Crear nuevo purchase item
          const { data: createdPI, error: createPIErr } = await supabase
            .from("purchase_item")
            .insert({
              purchase_order_id: poId,
              offer_id: offerId,
              quantity: actualQty,
            })
            .select("id")
            .single();
          if (createPIErr) throw createPIErr;
          piId = createdPI?.id;
        }

        // Asegurar fulfillment entre sale item y purchase item
        if (piId && !fulfillmentId) {
          const { error: fulfillErr } = await supabase
            .from("fulfillment")
            .insert({
              sale_item_id: saleItemId,
              purchase_item_id: piId,
            });
          if (fulfillErr) throw fulfillErr;
        }
      }
    },
    onMutate: async () => {
      message.loading({
        content: "Guardando asignaciones...",
      });
    },
    onSuccess: async () => {
      await onSuccess?.();
      message.success({
        content: "Asignaciones guardadas y órdenes de compra actualizadas.",
        duration: 2,
      });
      setOpen(false);
    },
    onError: (err) => {
      console.error("Error guardando asignaciones", err);
      message.error({
        content: "Error al guardar asignaciones. " + err.message,
      });
    },
  });

  const handleSaveAssignments = async () => {
    await saveAssignmentsMutation.mutateAsync();
  };

  if (isPending) return "Loading...";
  if (
    error ||
    planId !== data?.saleItem.sale_order.distribution_plan_id ||
    !saleItemId
  )
    return "An error has occurred: " + error?.message;

  const assignedQty = currentAssignments?.reduce(
    (acc, cur) => acc + Number(cur.quantity || 0),
    0
  );
  const required_quantity = data ? data.saleItem.required_quantity : 0;
  const remainingQty = required_quantity - assignedQty;
  const currentSuppliers = currentAssignments
    ?.map((a) => data?.offers.find((o) => o.id === a.offerId)?.supplier.id)
    .filter((id): id is string => !!id);

  return (
    <>
      <Button onClick={() => setOpen(true)} color="primary" variant="outlined">
        Asignar
      </Button>
      <Drawer
        placement="right"
        size={440}
        title={"Asignar proveedores"}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        styles={{ body: { padding: 12 } }}
        extra={
          <CreateNewOfferButton
            productId={data.saleItem.product.id}
            existingSuppliers={currentSuppliers}
            onSuccess={async () => {
              const { data: newData } = await refetch();
              if (newData) {
                const newInitialValues = getInitialValues(newData);
                form.setFieldsValue(newInitialValues);
              }
            }}
          />
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Image
            src={data.saleItem.product.main_photo || "/images/logo.png"}
            alt={data.saleItem.product.name || "Producto sin nombre"}
            width={100}
            height={100}
          />
          <div>
            <Typography.Title level={4}>
              {data.saleItem.product.name || "Producto sin nombre"}
            </Typography.Title>
            <Tag>{data.saleItem.product.unit || "Unidad no especificada"}</Tag>
          </div>
        </div>

        <>
          {assignedQty > required_quantity && (
            <Alert
              title="Advertencia: la cantidad por asignar excede la disponible del ítem."
              type="warning"
              banner
            />
          )}
          <div>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text>
                Cantidad requerida:{" "}
                <strong>
                  {data.saleItem?.required_quantity ?? 0}{" "}
                  {data.saleItem?.product.unit || ""}
                </strong>
              </Typography.Text>
              <br />
              <Typography.Text type="secondary">
                Cantidad asignada: {assignedQty}
              </Typography.Text>
              <br />
              {remainingQty >= 0 && (
                <Typography.Text type="secondary">
                  Restante por asignar: {remainingQty}
                </Typography.Text>
              )}
            </div>
            <Form
              form={form}
              layout="horizontal"
              style={{ maxWidth: "none" }}
              requiredMark={false}
              initialValues={getInitialValues(data)}
            >
              <Form.List name="assignments">
                {(fields) => (
                  <>
                    {fields.length === 0 && (
                      <Alert
                        title="No hay proveedores para este producto."
                        type="info"
                        banner
                      />
                    )}
                    {fields.map((field) => {
                      return (
                        <div
                          key={field.key}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                          }}
                        >
                          <Form.Item
                            key={field.key}
                            colon={false}
                            label={
                              <div>
                                <Typography.Text strong>
                                  {data.offers[field.name]?.supplier.name ||
                                    "Proveedor sin nombre"}
                                </Typography.Text>
                                <br />
                                <Typography.Text type="secondary">
                                  Precio:{" "}
                                  {formatPriceAccounting(
                                    Number(data.offers[field.name]?.price || 0)
                                  )}
                                </Typography.Text>
                              </div>
                            }
                            name={[field.name, "quantity"]}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <InputNumber min={0} />
                          </Form.Item>
                          <Button
                            onClick={() => {
                              const currentValues = form.getFieldsValue();
                              const newValues = currentValues.assignments.map(
                                (a) => {
                                  if (
                                    a.offerId === data.offers[field.name]?.id
                                  ) {
                                    return {
                                      ...a,
                                      quantity: required_quantity,
                                    };
                                  }
                                  return { ...a, quantity: 0 };
                                }
                              );
                              form.setFieldsValue({ assignments: newValues });
                            }}
                          >
                            Completar
                          </Button>
                          <Form.Item name={[field.name, "offerId"]} hidden />
                        </div>
                      );
                    })}
                  </>
                )}
              </Form.List>
            </Form>
            <Button
              type="primary"
              onClick={handleSaveAssignments}
              loading={saveAssignmentsMutation.isPending}
              block
            >
              Guardar
            </Button>
            {data.offers.length === 0 && (
              <CreateNewOfferButton
                productId={data.saleItem.product.id}
                existingSuppliers={currentSuppliers}
                onSuccess={async () => {
                  const { data: newData } = await refetch();
                  if (newData) {
                    const newInitialValues = getInitialValues(newData);
                    form.setFieldsValue(newInitialValues);
                  }
                }}
              />
            )}
          </div>
        </>
      </Drawer>
    </>
  );
};

export default AsignSupplierDrawer;
