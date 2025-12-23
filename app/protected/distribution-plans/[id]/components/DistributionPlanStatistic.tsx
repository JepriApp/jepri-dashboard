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
      const { data, error } = await supabase
        .from("sale_order")
        .select(
          `
          id,
          sale_item: sale_item(
            id,
            products: product_id(
              id,
              reference_price
            )
          ),
          service_fee,
          delivery_fee,
          status
          `
        )
        .eq("distribution_plan_id", id);
      if (error) {
        throw error;
      }
      const sale_order_count = data?.length;
      const total_cost = data
        .flatMap((sale_order) => {
          return sale_order.sale_item.map(
            (sale_item) => sale_item.products.reference_price
          );
        })
        .reduce((ac, current) => {
          return (ac ?? 0) + (current ?? 0);
        }, 0);
      const total_earning = data
        .flatMap((sale_order) => {
          return sale_order.service_fee;
        })
        .reduce((ac, current) => {
          return (ac ?? 0) + (current ?? 0);
        }, 0);
      const total_delivery_fee = data
        .flatMap((sale_order) => {
          return sale_order.delivery_fee;
        })
        .reduce((ac, current) => {
          return (ac ?? 0) + (current ?? 0);
        }, 0);
      const pending_sale_order_count = data.filter(
        (sale_order) =>
          sale_order.status === "pending" || sale_order.status === "processing"
      ).length;
      const out_for_delivery_sale_order_count = data.filter(
        (sale_order) => sale_order.status === "out_for_delivery"
      ).length;
      const completed_sale_order_count = data.filter(
        (sale_order) => sale_order.status === "delivered"
      ).length;
      const cancelled_sale_order_count = data.filter(
        (sale_order) => sale_order.status === "cancelled"
      ).length;
      return {
        sale_order_count,
        total_cost,
        total_earning,
        total_delivery_fee,
        pending_sale_order_count,
        out_for_delivery_sale_order_count,
        completed_sale_order_count,
        cancelled_sale_order_count,
      };
    },
  });
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  const {
    sale_order_count = 0,
    total_cost,
    total_earning,
    total_delivery_fee,
    pending_sale_order_count,
    out_for_delivery_sale_order_count,
    completed_sale_order_count,
    cancelled_sale_order_count,
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
      <Card variant="outlined">
        <Statistic
          title="Entregas pendientes"
          value={pending_sale_order_count ?? 0}
        />
      </Card>
      <Card variant="outlined">
        <Statistic
          title="Entregas en ruta"
          value={out_for_delivery_sale_order_count ?? 0}
        />
      </Card>
      <Card variant="outlined">
        <Statistic
          title="Entregas completadas"
          value={completed_sale_order_count ?? 0}
        />
      </Card>
      <Card variant="outlined">
        <Statistic
          title="Entregas canceladas"
          value={cancelled_sale_order_count ?? 0}
        />
      </Card>
    </Space>
  );
};

export default DistributionPlanStatistic;
