"use client"
import { createClient } from "@/lib/supabase/client";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import React from "react";

const CreateSaleOrderButton = ({ id }: { id: string }) => {
  const supabase = createClient();

  const { isPending, error, data } = useQuery({
    queryKey: [
      "distribution-plan",
      id,
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select(
          `
          id,
          status
        `,
        )
        .eq("id", id)
        .single();
      if (error) {
        throw error;
      }
      return data;
    },
  });
  const isComponentDisabled =
    data?.status === "completed" || data?.status === "cancelled";

  if (isPending) return "Loading...";
  if (error) return "An error has occurred: " + error.message;
  return (
    <Button
      href={`/protected/sale-orders/create?planId=${id}`}
      icon={<PlusOutlined />}
      disabled={isComponentDisabled}
    >
      Agregar pedido
    </Button>
  );
};

export default CreateSaleOrderButton;
