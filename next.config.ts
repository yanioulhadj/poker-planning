import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Requis pour Google Sign-In (gsi/client) - requête cross-origin vers accounts.google.com
      {
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/room/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
