// providers/AntdProvider.tsx
'use client'

import React, { Suspense } from 'react'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import esES from 'antd/locale/es_ES'

// Componente interno que usa Ant Design
function AntdContent({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={esES}
        theme={{
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 6,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </AntdRegistry>
  )
}

// Componente exportado con Suspense boundary
export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AntdContent>{children}</AntdContent>
    </Suspense>
  )
}