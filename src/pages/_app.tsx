import type { AppProps } from "next/app";
import NextApp, { AppContext } from "next/app";
import React, { ReactElement, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { App as AntdApp, ConfigProvider } from "antd";
import { useAuthStore, UserRole } from "@/store/auth.store";
import { createClient as createSupabaseComponent } from "@/utils/supabase/component";
import { User } from "@supabase/supabase-js";
import es_ES from "antd/locale/es_ES";
import { createClient } from "@/lib/supabase/server";

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const getLayout =
    (Component as any).getLayout || ((page: ReactElement) => page);

  // Hidratación inicial desde SSR/CSR: set mínimo y enriquece vía store
  useEffect(() => {
    const user = (pageProps as any)?.user as User | null;
    if (user?.id && user?.email && user?.role) {
      const { fetchUserDetails } = useAuthStore.getState();
      const role = user.role as UserRole;
      useAuthStore.setState({
        user: { id: user.id, email: user.email, role },
      });
      fetchUserDetails(user.email).catch(() => {});
    }
  }, [pageProps]);

  // Suscripción a cambios de autenticación: usa el store para enriquecer
  useEffect(() => {
    const supabase = createSupabaseComponent();
    const { fetchUserDetails } = useAuthStore.getState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          const u = session?.user;
          if (u?.id) {
            const current = useAuthStore.getState().user;
            const alreadySameUser = current?.id === u.id;
            if (!alreadySameUser) {
              const role = u.role as UserRole;
              useAuthStore.setState({
                user: { id: u.id, email: u.email || "", role },
              });
            }
            if (u.email) {
              await fetchUserDetails(u.email).catch(() => {});
            }
          }
        } else if (event === "SIGNED_OUT") {
          useAuthStore.setState({ user: null });
        }
      } catch (e) {
        console.error("onAuthStateChange handler error:", e);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  return (
    <ConfigProvider locale={es_ES}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          {getLayout(<Component {...pageProps} />)}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

// Obtener el usuario en SSR para cada request y pasarlo a pageProps
MyApp.getInitialProps = async (appCtx: AppContext) => {
  const appProps = await NextApp.getInitialProps(appCtx);

  const isServer = typeof window === "undefined" || !!(appCtx?.ctx as any)?.req;

  try {
    let user: User | null = null;

    if (isServer) {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      user = error ? null : data?.user ?? null;
    } else {
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
