import LandingPageLayout from '@/components/layout/LandingPageLayout';
import { Empty } from 'antd';
import React, { ReactElement } from 'react'

const Index = () => {
  return (
    <Empty></Empty>
  )
}

export default Index

Index.getLayout = function getLayout(page: ReactElement) {
    return <LandingPageLayout backButton> {page}</LandingPageLayout>;
  };