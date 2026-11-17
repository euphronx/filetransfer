import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { FC_ENDPOINT: process.env.FC_ENDPOINT },

  generateBuildId: async () => {
    return process.env.COMMIT_REF || `build-${new Date().getTime()}`;
  },

  webpack: config => {
    return config;
  },

  typescript: { ignoreBuildErrors: true },

  trailingSlash: true,

  async rewrites() {
    return [
      { source: "/deepseek", destination: "/deepseek/index.html" },
      { source: "/deepseek/", destination: "/deepseek/index.html" },
    ];
  },
};

export default nextConfig;
