import type { Locale, Me, Role } from "@kisht/contracts";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import type { Auth } from "../modules/auth/auth.js";
import { HttpError } from "./errors.js";

/** The signed-in user, exactly as /api/me returns it. */
export type AuthUser = Me;

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export function makeAuthenticate(auth: Auth) {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new HttpError(401, "Not signed in");
    const u = session.user as typeof session.user & {
      role?: string;
      branchId?: string | null;
      locale?: string;
    };
    request.user = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: (u.role ?? "OFFICER") as Role,
      branchId: u.branchId ?? null,
      locale: (u.locale ?? "hi") as Locale,
    };
  };
}

/** Use after authenticate. Wrong role is 403; out-of-scope records are 404 (see scope.ts). */
export function requireRole(...roles: Role[]) {
  return async function checkRole(request: FastifyRequest): Promise<void> {
    if (!request.user) throw new HttpError(401, "Not signed in");
    if (!roles.includes(request.user.role)) throw new HttpError(403, "Not allowed for this role");
  };
}

export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new HttpError(401, "Not signed in");
  return request.user;
}
