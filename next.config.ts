import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // canonical home is www.arnavbule.in/parakh (proxied by the portfolio site)
  basePath: "/parakh",
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
