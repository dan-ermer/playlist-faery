import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The share card image reads its fonts from disk at request time.
  outputFileTracingIncludes: {
    "/share/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
