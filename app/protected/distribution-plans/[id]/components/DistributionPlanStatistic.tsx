"use client";
import { formatPriceAccounting } from "@/lib/formatPrice";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Space, Card, Statistic } from "antd";

const DistributionPlanStatistic = ({ id }: { id: string }) => {
  const supabase = createClient();
  const { isPending, error, data } = useQuery({
    queryKey: ["distribution-plan", "components", "statistic", id],
    queryFn: async () => {
      // Obtener órdenes de venta con delivery_fee
      const { data: saleOrders, error: saleOrdersError } = await supabase
        .from("sale_order")
        .select("id, delivery_fee")
        .eq("distribution_plan_id", id);
      
      if (saleOrdersError) throw saleOrdersError;

      const sale_order_count = saleOrders?.length || 0;

      // Obtener costo por transporte (suma de delivery_fee de sale_orders)
      const total_delivery_fee = saleOrders?.reduce(
        (sum, order) => sum + (order.delivery_fee ?? 0),
        0
      ) || 0;

      // Obtener costo por compra (suma de actual_price de purchase_items)
      const { data: purchaseOrders, error: purchaseOrdersError } = await supabase
        .from("purchase_order")
        .select(`
          id,
          purchase_items: purchase_item(
            id,
            quantity,
            offer: offer_id(
              id,
              price
            )
          )
        `)
        .eq("distribution_plan_id", id);
      
      if (purchaseOrdersError) throw purchaseOrdersError;

      // Calcular el costo total de compra (cantidad * precio de la oferta)
      const total_cost = purchaseOrders?.reduce((sum, po) => {
        const poCost = po.purchase_items?.reduce((itemSum, pi) => {
          const itemCost = (pi.quantity ?? 0) * (pi.offer?.price ?? 0);
          return itemSum + itemCost;
        }, 0) || 0;
        return sum + poCost;
      }, 0) || 0;

      // Comisión total es el 24% de la venta (que es el costo de compra)
      const total_earning = total_cost * 0.24;

      return {
        sale_order_count,
        total_cost,
        total_earning,
        total_delivery_fee,
      };
    },
  });
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  const {
    sale_order_count = 0,
    total_cost = 0,
    total_earning = 0,
    total_delivery_fee = 0,
  } = data;
  return (
    <Space size="large" wrap>
      <Card variant="outlined">
        <Statistic title="Cantidad de órdenes" value={sale_order_count ?? 0} />
      </Card>
      <Card variant="outlined">
        <Statistic
          title="Costo por compra"
          value={total_cost ?? 0}
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
      <Card variant="outlined">
        <Statistic
          title="Comision total"
          value={total_earning ?? 0}
          formatter={(val) => formatPriceAccounting(Number(val))}
        />
      </Card>
    </Space>
  );
};

export default DistributionPlanStatistic;
