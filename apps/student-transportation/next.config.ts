import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@esh-platform/supabase", "@esh-platform/config"],
};
export default config;
