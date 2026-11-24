import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nfs/ui", "@nfs/db", "@nfs/rules", "@nfs/auth", "@nfs/events", "@nfs/flights"],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // Internal NFS system: never indexed, never framed by another site
    return [{ source: "/:path*", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }];
  },
};

export default nextConfig;
