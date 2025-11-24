import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Handle app directory and routing
  output: 'standalone',
  // Ensure @/lib alias resolves during Next.js build
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/lib": path.join(__dirname, "src/lib"),
    };
    return config;
  },
  // Disable type checking and linting during build
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
