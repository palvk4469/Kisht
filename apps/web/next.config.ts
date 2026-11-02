import type { NextConfig } from "next";

// D3: the browser only ever talks to this origin. /api/* is proxied to Fastify,
// so auth cookies stay first-party and the API needs no CORS.
const apiUrl = process.env["API_URL"] ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@kisht/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
