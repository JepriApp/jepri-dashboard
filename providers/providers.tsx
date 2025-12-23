"use client";
import type * as React from "react";
import { ThemeProvider } from "next-themes";
import { AntdProvider } from "./AntdProvider";
import { TanstackProvider } from "./tanstackProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AntdProvider>
        <TanstackProvider>{children}</TanstackProvider>
      </AntdProvider>
    </ThemeProvider>
  );
}
