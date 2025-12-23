"use client";
import { Tabs, TabsProps } from "antd";
import React from "react";
import SaleOrdersTable from "./components/SaleOrdersTable";
import { useParams } from "next/navigation";
import SuppliersResumeTable from "./components/SuppliersResumeTable";

const Page = () => {
  const params = useParams();
  const planId = params.id as string | undefined;
  const items: TabsProps["items"] = [
    {
      key: "1",
      label: "Clientes",
      children: <SaleOrdersTable id={planId || ""} />,
    },
    {
      key: "2",
      label: "Proveedores",
      children: <SuppliersResumeTable id={planId || ""} />,
    },
  ];
  return <Tabs defaultActiveKey="1" items={items} />;
};

export default Page;
