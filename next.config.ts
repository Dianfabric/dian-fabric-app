import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qkkobestkhkxlrjeuakt.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // 클라이언트 번들에서 Node.js 전용 패키지 제외
    // @xenova/transformers는 브라우저에서 onnxruntime-web(WASM)을 자동 사용
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "onnxruntime-node": false,
        sharp: false,
      };
    }

    // 서버 빌드에서 @xenova/transformers 관련 패키지 제외
    // (서버에서는 사용하지 않음 - 클라이언트 전용)
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(
          "@xenova/transformers",
          "onnxruntime-node",
          "onnxruntime-web",
          "sharp"
        );
      }
    }

    return config;
  },
};

export default nextConfig;
