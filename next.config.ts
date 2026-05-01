import type { NextConfig } from "next";

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
    ],
  }
};

export default nextConfig;
