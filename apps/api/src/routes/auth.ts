import type { FastifyInstance } from "fastify";
import type { Auth } from "../auth/auth.js";

// Bridges Fastify to Better Auth's fetch-style handler.
export function registerAuthRoutes(app: FastifyInstance, auth: Auth, baseURL: string): void {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      // Build the URL from the configured origin, not the Host header (spoofable).
      const url = new URL(request.url, baseURL);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined)
          headers.append(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") reply.header(key, value);
      });
      // Several cookies (session + cache) must stay separate headers.
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
