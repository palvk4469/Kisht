import type { Locale, Role } from "@kisht/db";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "./auth.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchId: string | null;
  locale: Locale;
};

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
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

/** Use after authenticate. Wrong role is 403; out-of-scope records are 404 (see loanScope). */
export function requireRole(...roles: Role[]) {
  return async function checkRole(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw new HttpError(401, "Not signed in");
    if (!roles.includes(request.user.role)) throw new HttpError(403, "Not allowed for this role");
  };
}

export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw new HttpError(401, "Not signed in");
  return request.user;
}
