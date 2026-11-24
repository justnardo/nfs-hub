import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nfs/ui", "@nfs/db"],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // Internal company page: never indexed
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
