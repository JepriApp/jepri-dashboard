import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement } from "react";

const Index = () => {
  return <div>Index</div>;
};

export default Index;

Index.getLayout = function getLayout(page: ReactElement) {
  return <DashboardLayout> {page}</DashboardLayout>;
};
