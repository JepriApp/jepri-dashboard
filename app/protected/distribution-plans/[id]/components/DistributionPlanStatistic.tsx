"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Space, Card, Statistic } from "antd";

const DistributionPlanStatistic = ({ id }: { id: string }) => {
  const supabase = createClient();
  const { isPending, error, data } = useQuery({
    queryKey: ["distribution-plan", id, "components", "statistic"],
    queryFn: async () => {
      // Obtener comision del plan
      const { data: distributionPlan, error: distributionPlanError } =
        await supabase
          .from("distribution_plan")
          .select("id, service_fee_percentage")
          .eq("id", id)
          .single();
      if (distributionPlanError) throw distributionPlanError;

      // Obtener órdenes de venta con delivery_fee
      const { data: saleOrders, error: saleOrdersError } = await supabase
        .from("sale_order")
        .select(
          `id, 
                 delivery_fee,
                 sale_items: sale_item(
                  id,
                  required_quantity,
                  delivered_quantity,
                  product: product_id(
                    id,
                    reference_price
                    )
                 )
                `,
        )
        .eq("distribution_plan_id", id);

      if (saleOrdersError) throw saleOrdersError;

      const sale_order_count = saleOrders?.length || 0;

      // Obtener costo por transporte (suma de delivery_fee de sale_orders)
      const total_delivery_fee =
        saleOrders?.reduce(
          (sum, order) => sum + (order.delivery_fee ?? 0),
          0,
        ) || 0;

      // Obtener costo por compra (suma de actual_price de purchase_items)
      const { data: purchaseOrders, error: purchaseOrdersError } =
        await supabase
          .from("purchase_order")
          .select(
            `
          id,
          purchase_items: purchase_item(
            id,
            quantity,
            received_quantity,
            actual_price,
            offer: offer_id(
              id,
              price
            )
          )
        `,
          )
          .eq("distribution_plan_id", id);

      if (purchaseOrdersError) throw purchaseOrdersError;
      const purchase_order_count = purchaseOrders?.length || 0;
      const estimated_total_cost =
        saleOrders?.reduce((sum, so) => {
          const soCost =
            so.sale_items?.reduce((itemSum, si) => {
              const itemCost =
                (si.required_quantity ?? 0) * (si.product.reference_price ?? 0);
              return itemSum + itemCost;
            }, 0) || 0;
          return sum + soCost;
        }, 0) || 0;
      // Calcular el costo total de compra (cantidad * precio de la oferta)
      const real_total_cost =
        purchaseOrders?.reduce((sum, po) => {
          const poCost =
            po.purchase_items?.reduce((itemSum, pi) => {
              const itemCost = (pi.quantity ?? 0) * (pi.offer?.price ?? 0);
              return itemSum + itemCost;
            }, 0) || 0;
          return sum + poCost;
        }, 0) || 0;
      // Comisión total es el 24% de la venta (que es el costo de compra)
      const estimated_total_earning =
        estimated_total_cost * (distributionPlan.service_fee_percentage / 100);
      const real_total_earning =
        real_total_cost * (distributionPlan.service_fee_percentage / 100);
      return {
        sale_order_count,
        purchase_order_count,
        estimated_total_cost,
        real_total_cost,
        estimated_total_earning,
        total_delivery_fee,
        service_fee_percentage: distributionPlan.service_fee_percentage,
        real_total_earning,
      };
    },
  });
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  const {
    sale_order_count = 0,
    purchase_order_count = 0,
    real_total_cost = 0,
    estimated_total_cost = 0,
    estimated_total_earning = 0,
    real_total_earning = 0,
    total_delivery_fee = 0,
    service_fee_percentage = 0,
  } = data;
  return (
    <Space size="large" wrap>
      <Card variant="outlined">
        <Statistic title="# de pedidos" value={sale_order_count ?? 0} />
        <Statistic title="# de compras" value={purchase_order_count ?? 0} />
      </Card>
      <Card variant="outlined">
        <Statistic
          title="Costo por compras estimado"
          value={estimated_total_cost ?? 0}
          formatter={(val) => formatPriceAccounting(Number(val))}
        />
        <Statistic
          title="Costo por compras real"
          value={real_total_cost ?? 0}
          formatter={(val) => formatPriceAccounting(Number(val))}
        />
      </Card>
      <Card variant="outlined">
        <Statistic
          title={`Comision total estimada (${service_fee_percentage}%)`}
          value={estimated_total_earning ?? 0}
          formatter={(val) => formatPriceAccounting(Number(val))}
        />
        <Statistic
          title={`Comision total real (${service_fee_percentage}%)`}
          value={real_total_earning ?? 0}
          formatter={(val) => formatPriceAccounting(Number(val))}
        />
      </Card>
      <Card variant="outlined">
        <Statistic
          title="Costo por transporte"
          value={total_delivery_fee ?? 0}
          formatter={(val) => formatPriceAccounting(Number(val))}
        />
      </Card>
    </Space>
  );
};

export default DistributionPlanStatistic;
