import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nfs/ui", "@nfs/db", "@nfs/rules", "@nfs/auth", "@nfs/events", "@nfs/flights"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
