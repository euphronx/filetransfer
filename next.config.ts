import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  generateBuildId: async () => {
    return process.env.COMMIT_REF || `build-${new Date().getTime()}`;
  },

  webpack: (config) => {
    return config;
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  trailingSlash: true,
};

export default nextConfig;
