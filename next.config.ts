import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'acuofxciywrktkckokqo.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      // Supabase self-hosted local (10.85.96.51) — solo en desarrollo
      ...(isDev
        ? [
            {
              protocol: "http" as const,
              hostname: "10.85.96.51",
              port: "8000",
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  }
};

export default nextConfig;
