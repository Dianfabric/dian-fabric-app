import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
