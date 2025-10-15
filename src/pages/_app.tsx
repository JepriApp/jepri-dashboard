import type { AppProps } from "next/app";
import React, { ReactElement, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { App as AntdApp } from "antd";
function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const getLayout =
    (Component as any).getLayout || ((page: ReactElement) => page);

  return (
    <AntdApp>
      <QueryClientProvider client={queryClient}>
        {getLayout(<Component {...pageProps} />)}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AntdApp>
  );
}

export default App;
