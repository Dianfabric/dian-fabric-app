import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qkkobestkhkxlrjeuakt.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
