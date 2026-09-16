import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // canonical home is www.arnavbule.in/parakh (proxied by the portfolio site)
  basePath: "/parakh",
  devIndicators: false, // keeps the dev badge out of README screenshots
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
