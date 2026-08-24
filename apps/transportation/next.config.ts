import type { NextConfig } from "next";

const transportationBackendUrl = (
  process.env.TRANSPORTATION_BACKEND_URL?.trim() || "https://admin.eshapp.com"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@esh-platform/config",
    "@esh-platform/maps",
    "@esh-platform/supabase",
  ],
  rewrites() {
    return Promise.resolve([
      {
        source: "/api/tenant-admin/:path*",
        destination: `${transportationBackendUrl}/api/tenant-admin/:path*`,
      },
    ]);
  },
};

export default nextConfig;
