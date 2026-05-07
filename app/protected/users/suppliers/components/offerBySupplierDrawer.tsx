"use client";

import { Button, Card, Drawer, message, Space, Statistic, Tag } from "antd";
import { useState } from "react";
import { SupplierRow, SupplierWithOffers } from "../page";
import { createClient } from "@/lib/supabase/client";
import ProductImage from "@/app/protected/components/ProductImage";
import dayjs from "dayjs";
import CreateNewOfferForSupplierButton from "./CreateNewOfferForSupplierButton";
import UpdateOfferForSupplierButton from "./UpdateOfferForSupplierButton";

const OfferBySupplierDrawer = ({ record }: { record: SupplierRow }) => {
  const supabase = createClient();
  const [offersOpen, setOffersOpen] = useState(false);
  const [offersEditingSupplier, setOffersEditingSupplier] =
    useState<SupplierWithOffers | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const openOffersDrawer = async (record: SupplierRow) => {
    // Fetch supplier offers
    //BUG: Aqui se usa offer. Replantear el uso
    setIsLoading(true);
    try {
      const { data: supplierOffers, error } = await supabase
        .from("offer")
        .select(
          `
        id, price, available, created_at,
        product:product_id(id, name, unit, reference_price)
      `,
        )
        .eq("supplier_id", record.id)
        .eq("available", true)
        .order("product(name)", { ascending: true });

      if (error) {
        message.error("Error al cargar las catálogos del proveedor");
        return;
      }

      const supplierWithOffers: SupplierWithOffers = {
        ...record,
        offers: (supplierOffers || []).map((o) => {
          const productObj = Array.isArray(o.product)
            ? o.product[0]
            : o.product;
          return {
            ...o,
            available: Boolean(o.available),
            product: productObj || null,
          };
        }),
      };

      setOffersEditingSupplier(supplierWithOffers);
      const initialItems = (supplierWithOffers.offers || []).map((o) => ({
        id: o.id,
        product_id: o.product?.id || null,
        price: Number(o.price ?? 0),
        available: Boolean(o.available),
      }));

      const map: Record<string, string> = {};
      initialItems.forEach((i) => {
        if (i.id && i.product_id) map[i.id as string] = i.product_id as string;
      });
      setOffersOpen(true);
    } catch (error) {
      message.error(JSON.stringify(error));
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <>
      <Button
        onClick={() => openOffersDrawer(record)}
        disabled={isLoading}
        loading={isLoading}
      >
        Ver catálogo
      </Button>
      <Drawer
        title={`Productos del proveedor${
          offersEditingSupplier ? ` — ${offersEditingSupplier.name}` : ""
        }`}
        open={offersOpen}
        size={720}
        onClose={() => {
          setOffersOpen(false);
          setOffersEditingSupplier(null);
        }}
      >
        <div className="flex flex-col gap-3 mb-3">
          {offersEditingSupplier &&
            offersEditingSupplier.offers?.map((offer) => {
              const product = offer.product;
              return (
                <div key={product.id}>
                  <Card
                    size="small"
                    key={offer.product_id}
                    variant="outlined"
                    title={
                      <>
                        <Space>
                          <span>{product?.name}</span>
                          <Tag color="geekblue">{product?.unit}</Tag>
                        </Space>
                      </>
                    }
                    extra={
                      <UpdateOfferForSupplierButton
                        supplierId={record.id}
                        supplierName={record.name}
                        productId={product.id}
                        productName={product.name}
                        offerId={offer.id}
                        offerPrice={offer.price}
                        onSuccess={async () => {
                          await openOffersDrawer(record);
                        }}
                      />
                    }
                  >
                    <div className="flex flex-row flex-wrap gap-3">
                      <ProductImage source={product?.main_photo || null} />
                      <Statistic
                        title={
                          <div>
                            <p>
                              Precio mas reciente -{" "}
                              {dayjs(offer.created_at).format("YYYY-MM-DD")}
                            </p>
                          </div>
                        }
                        prefix={"$"}
                        value={offer.price}
                      />
                      <Statistic
                        title="Precio de referencia"
                        value={product?.reference_price || "desconocido"}
                        precision={0}
                        prefix={"$"}
                      />
                    </div>
                  </Card>
                </div>
              );
            })}
        </div>
        <CreateNewOfferForSupplierButton
          supplierId={offersEditingSupplier?.id || ""}
          supplierName={offersEditingSupplier?.name || "Proveedor desconocido"}
          productIdsOfExistingOffers={
            offersEditingSupplier?.offers
              ?.map((p) => p.product_id || "")
              .filter((p) => !!p) || []
          }
          onSuccess={async () => {
            await openOffersDrawer(record);
          }}
        />
      </Drawer>
    </>
  );
};

export default OfferBySupplierDrawer;
