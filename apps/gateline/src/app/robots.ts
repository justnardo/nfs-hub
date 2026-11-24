import type { MetadataRoute } from "next";

/** Internal NFS system: nothing here is for search engines. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
