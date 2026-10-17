import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@esh-platform/supabase", "@esh-platform/config", "@esh-platform/maps"],
};
export default config;
