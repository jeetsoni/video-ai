import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@video-ai/shared"],
  webpack: (config) => {
    // The shared package uses NodeNext module resolution with .js extensions
    // in imports (e.g., "./types/format-config.js" → resolves to .ts source).
    // Webpack's bundler resolution doesn't do this automatically, so we ensure
    // .ts/.tsx are tried before .js when resolving modules.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
