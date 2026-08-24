import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@esh-platform/config", "@esh-platform/supabase"],
};
export default nextConfig;
