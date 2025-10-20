import DashboardLayout from '@/components/layout/DashboardLayout';
import DistributionPlanLayout from '@/components/layout/DistributionPlanLayout';
import React, { ReactElement } from 'react'

const SuppliersRecepction = () => {
  return (
    <div>SuppliersRecepction</div>
  )
}

export default SuppliersRecepction

SuppliersRecepction.getLayout = function getLayout(page: ReactElement) {
  return (
    <DashboardLayout noStyle>
      <DistributionPlanLayout> {page}</DistributionPlanLayout>
    </DashboardLayout>
  );
};