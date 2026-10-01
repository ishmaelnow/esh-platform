import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.RIDER_PREVIEW_DIST_DIR ?? ".next",
  ...(process.env.RIDER_PREVIEW_DIST_DIR ? { devIndicators: false as const } : {}),
  transpilePackages: ["@esh-platform/config", "@esh-platform/logger", "@esh-platform/maps", "@esh-platform/supabase"],
};

export default nextConfig;
