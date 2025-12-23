import { getQueryClient } from "@/app/get-query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Suspense } from "react";

export function TanstackProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools />
      </QueryClientProvider>
    </Suspense>
  );
}
