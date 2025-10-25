import type { AppProps } from "next/app";
import NextApp, { AppContext } from "next/app";
import React, { ReactElement, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { App as AntdApp } from "antd";
import { createClient as createSupabaseSSR } from "@/utils/supabase/server-props";
import { useAuthStore } from "@/store/auth.store";
import { createClient as createSupabaseComponent } from "@/utils/supabase/component";

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const getLayout = (Component as any).getLayout || ((page: ReactElement) => page);

  // Hidratar el store con el usuario proveniente del SSR
  useEffect(() => {
    const user = (pageProps as any)?.user;
    if (user?.id && user?.email) {
      // setUser requiere un objeto User tipado; inicialmente colocamos un rol por defecto
      // y luego enriquecemos con detalles desde la BD (fetchUserDetails)
      const { setUser, fetchUserDetails } = useAuthStore.getState();
      setUser({ id: user.id, email: user.email, role: "admin" });
      fetchUserDetails(user.email).catch(() => {});
    }
  }, [pageProps]);

  return (
    <AntdApp>
      <QueryClientProvider client={queryClient}>
        {getLayout(<Component {...pageProps} />)}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AntdApp>
  );
}

// Obtener el usuario en SSR para cada request y pasarlo a pageProps
MyApp.getInitialProps = async (appCtx: AppContext) => {
  const appProps = await NextApp.getInitialProps(appCtx);

  // Detectar si se ejecuta en servidor o en cliente (navegación entre rutas)
  const isServer = typeof window === "undefined" || !!(appCtx?.ctx as any)?.req;

  try {
    let user = null as any;

    if (isServer) {
      // En servidor, usa el cliente SSR que lee/escribe cookies desde req/res
      const supabase = createSupabaseSSR(appCtx.ctx as any);
      const { data, error } = await supabase.auth.getUser();
      user = error ? null : data?.user ?? null;
    } else {
      // En cliente (transiciones), usa el cliente de navegador; no hay req/res
      const supabase = createSupabaseComponent();
      const { data, error } = await supabase.auth.getUser();
      user = error ? null : data?.user ?? null;
    }

    return {
      ...appProps,
      pageProps: {
        ...appProps.pageProps,
        user,
      },
    };
  } catch (e) {
    return {
      ...appProps,
      pageProps: { ...appProps.pageProps, user: null },
    };
  }
};

export default MyApp;
