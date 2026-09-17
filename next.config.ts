import type { NextConfig } from "next";

// onnxruntime-node dlopens libonnxruntime.so at runtime; Vercel's file tracing cannot see that, so the
// Linux binaries must be listed explicitly for every route that loads @huggingface/transformers on the server.
const ONNX_LINUX_BIN = "./node_modules/@huggingface/transformers/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers"],
  outputFileTracingIncludes: {
    "/api/embed": [ONNX_LINUX_BIN],
    "/api/classify": [ONNX_LINUX_BIN],
  },
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
