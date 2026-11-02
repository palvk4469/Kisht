import type { FastifyRequest } from "fastify";
import { HttpError } from "./session.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// CSRF defence for our own routes (Better Auth guards /api/auth/* itself).
// Session cookies are SameSite=Lax already; this also rejects cross-site
// requests from browsers that send cookies anyway, and requests with no Origin.
export function makeOriginGuard(baseURL: string) {
  const allowed = new URL(baseURL).origin;
  return async function originGuard(request: FastifyRequest): Promise<void> {
    if (!UNSAFE_METHODS.has(request.method)) return;
    if (!request.url.startsWith("/api/") || request.url.startsWith("/api/auth/")) return;
    if (request.headers.origin !== allowed) {
      throw new HttpError(403, "Cross-origin request rejected");
    }
  };
}
