import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env at the repo root serves every package (Next only looks in apps/web).
// forceReload: Next has already loaded (and cached) apps/web's env by now.
loadEnvConfig(
  fileURLToPath(new URL("../..", import.meta.url)),
  process.env.NODE_ENV !== "production",
  undefined,
  true,
);

// D3: the browser only ever talks to this origin. /api/* is proxied to Fastify,
// so auth cookies stay first-party and the API needs no CORS.
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@kisht/domain", "@kisht/contracts"],
  // Inlined explicitly so values from the root .env reach the client bundle.
  env: {
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE ?? "false",
    NEXT_PUBLIC_DEMO_PASSWORD: process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "",
    // Names the service worker's cache, so each build replaces the old app shell.
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID ?? String(Date.now()),
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            // Inline allowed for Next's bootstrap and our theme script; nothing loads from elsewhere.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
      // The service worker must never be stale, or a deploy can't replace it.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
