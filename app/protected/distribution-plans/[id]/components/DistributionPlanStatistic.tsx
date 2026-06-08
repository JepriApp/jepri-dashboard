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
      const { service_fee_percentage } = distributionPlan;
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
              reference_price
            ),
            fulfillment: fulfillment (
              id,
              purchase_item: purchase_item_id (
                id,
                received_quantity,
                actual_price
              )
            )
          ),
          service_fee,
          delivery_fee
          `,
        )
        .eq("distribution_plan_id", id);

      if (saleOrdersError) throw saleOrdersError;
      const estimated_total_cost = saleOrders.reduce(
        (saleOrderAccumulator, saleOrder) => {
          const saleItemsSum: number = saleOrder.sale_items.reduce(
            (acumulador, actual) =>
              acumulador +
              actual.required_quantity * (actual.product.reference_price || 0),
            0,
          );

          return saleOrderAccumulator + saleItemsSum;
        },
        0,
      );
      const estimated_total_earning = saleOrders.reduce(
        (saleOrderAccumulator, saleOrder) => {
          const saleItemsSum: number = saleOrder.sale_items.reduce(
            (acumulador, actual) =>
              acumulador +
              actual.required_quantity *
                (actual.product.reference_price || 0) *
                (service_fee_percentage / 100),
            0,
          );

          return saleOrderAccumulator + saleItemsSum;
        },
        0,
      );
      const real_total_cost = saleOrders.reduce(
        (saleOrderAccumulator, saleOrder) => {
          const saleItemsSum: number = saleOrder.sale_items.reduce(
            (saleItemAccumulator, saleItem) => {
              const fullfilmentsSum = saleItem.fulfillment.reduce(
                (acumulador, actual) => {
                  return (
                    acumulador +
                    (actual.purchase_item.actual_price || 0) *
                      (actual.purchase_item.received_quantity || 0)
                  );
                },
                0,
              );
              return saleItemAccumulator + fullfilmentsSum;
            },
            0,
          );

          return saleOrderAccumulator + saleItemsSum;
        },
        0,
      );

      const real_total_earning = saleOrders.reduce(
        (saleOrderAccumulator, saleOrder) => {
          const saleItemsSum: number = saleOrder.sale_items.reduce(
            (saleItemAccumulator, saleItem) => {
              const fullfilmentsSum = saleItem.fulfillment.reduce(
                (acumulador, actual) => {
                  return (
                    acumulador +
                    (actual.purchase_item.actual_price || 0) *
                      (actual.purchase_item.received_quantity || 0) *
                      (service_fee_percentage / 100)
                  );
                },
                0,
              );
              return saleItemAccumulator + fullfilmentsSum;
            },
            0,
          );

          return saleOrderAccumulator + saleItemsSum;
        },
        0,
      );
      const total_delivery_fee = saleOrders.reduce(
        (acumulador, actual) => acumulador + (actual.delivery_fee || 0),
        0,
      );
      return {
        estimated_total_cost,
        estimated_total_earning,
        real_total_cost,
        real_total_earning,
        total_delivery_fee,
        service_fee_percentage,
      };
    },
  });
  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  const {
    estimated_total_cost = 0,
    real_total_cost = 0,
    estimated_total_earning = 0,
    real_total_earning = 0,
    total_delivery_fee = 0,
    service_fee_percentage = 0,
  } = data;
  return (
    <Space size="large" wrap>
      <Card variant="outlined">
        <Statistic
          title="Costo por compras pronosticado"
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
          title={`Comision total pronosticada (${service_fee_percentage}%)`}
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
