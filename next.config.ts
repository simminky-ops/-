import type { NextConfig } from "next";

// A-D PROJECT — 모든 내부 화면은 로그인 쿠키에 따라 동적으로 렌더링되므로
// Cache Components(정적 셸 사전렌더링)는 사용하지 않습니다.
const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
