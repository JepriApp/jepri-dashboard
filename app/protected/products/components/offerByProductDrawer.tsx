"use client";

import { Button, Card, Drawer, message, Space, Statistic, Tag } from "antd";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProductImage from "@/app/protected/components/ProductImage";
import dayjs from "dayjs";
import { ProductWithOffers } from "../page";
import { PhoneFilled } from "@ant-design/icons";
import UpdateOfferForSupplierButton from "../../components/UpdateOfferForSupplierButton";
import CreateNewOfferForProductButton from "./CreateNewOfferForProductButton";

const OfferByProductDrawer = ({
  record,
  onChange,
}: {
  record: ProductWithOffers;
  onChange?: () => Promise<void>;
}) => {
  const supabase = createClient();
  const [offersOpen, setOffersOpen] = useState(false);
  const [data, setData] = useState<ProductWithOffers | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const openOffersDrawer = async (record: ProductWithOffers) => {
    // Fetch supplier offers
    //BUG: Aqui se usa offer. Replantear el uso
    setIsLoading(true);
    try {
      const { data: supplierOffers, error } = await supabase
        .from("offer")
        .select(
          `
        id, price, available, created_at,
        supplier:supplier_id(id, name, phone)
      `,
        )
        .eq("product_id", record.id)
        .eq("available", true)
        .order("supplier(name)", { ascending: true });

      if (error) {
        message.error("Error al cargar las catálogos del proveedor");
        return;
      }

      const productWithOffers: ProductWithOffers = {
        ...record,
        offers: (supplierOffers || []).map((o) => {
          return {
            ...o,
            available: Boolean(o.available),
          };
        }),
      };

      setData(productWithOffers);
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
        Ver proveedores
      </Button>
      <Drawer
        title={`Proveedores del producto ${data ? ` — ${data.name}` : ""}`}
        open={offersOpen}
        size={400}
        onClose={() => {
          setOffersOpen(false);
          setData(null);
        }}
      >
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex flex-row gap-3 mb-3">
            <ProductImage source={data?.main_photo || null} />
            <Statistic
              title="Precio de referencia"
              value={data?.reference_price || "desconocido"}
              precision={0}
              prefix={"$"}
            />
          </div>
          {data &&
            data.offers?.map((offer) => {
              const supplier = offer.supplier;
              return (
                <div key={offer.id}>
                  <Card
                    size="small"
                    key={offer.id}
                    variant="outlined"
                    title={
                      <>
                        <Space>
                          <span>{supplier?.name}</span>
                          <Tag color="geekblue">
                            <PhoneFilled /> {supplier?.phone}
                          </Tag>
                        </Space>
                      </>
                    }
                    extra={
                      <UpdateOfferForSupplierButton
                        supplierId={offer.supplier.id}
                        supplierName={offer.supplier.name || ""}
                        productId={record.id}
                        productName={record.name || ""}
                        offerId={offer.id}
                        offerPrice={offer.price}
                        onSuccess={async () => {
                          await openOffersDrawer(record);
                        }}
                      />
                    }
                  >
                    <div className="flex flex-row flex-wrap gap-3">
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
                    </div>
                  </Card>
                </div>
              );
            })}
          <CreateNewOfferForProductButton
            productId={record.id}
            productName={record.name || ""}
            supplierIdsOfExistingOffers={
              record.offers?.map((o) => o.supplier.id) || []
            }
            onSuccess={async () => {
              await openOffersDrawer(record);
              await onChange?.();
            }}
          />
        </div>
      </Drawer>
    </>
  );
};

export default OfferByProductDrawer;
