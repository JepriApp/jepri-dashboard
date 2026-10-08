import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
// En `next dev` esto ya es true por NODE_ENV. En un build de producción (Vercel o el
// contenedor Docker de staging) NODE_ENV siempre es "production", así que el staging
// self-hosted necesita este flag explícito para seguir viendo las imágenes de su propio
// storage — nunca se setea en Vercel, solo en el .env del servidor de staging.
const allowSelfHostedImages =
  isDev || process.env.ALLOW_SELF_HOSTED_SUPABASE_IMAGES === "true";

const nextConfig: NextConfig = {
  // Imagen de Docker liviana para el staging (Tarea 3). Inocuo en Vercel: esa plataforma
  // no usa esta carpeta, solo genera algunos bytes de más en el build que no se despliegan.
  output: "standalone",
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'acuofxciywrktkckokqo.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      // Supabase self-hosted local (10.85.96.51) — desarrollo, o staging con el flag arriba
      ...(allowSelfHostedImages
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
