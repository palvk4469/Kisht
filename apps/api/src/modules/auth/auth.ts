import type { PrismaClient } from "@kisht/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

export type AuthConfig = {
  secret: string;
  baseURL: string;
  /** Limit password guessing per IP. On in production. */
  rateLimit: boolean;
};

const DAY_SECONDS = 24 * 60 * 60;

export function createAuth(prisma: PrismaClient, config: AuthConfig) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
      // Accounts are provisioned by the lender (seed / admin), never self-registered.
      disableSignUp: true,
      minPasswordLength: 8,
    },
    user: {
      additionalFields: {
        // input: false means clients can never set these, at sign-up or via update-user.
        role: { type: "string", required: false, defaultValue: "OFFICER", input: false },
        branchId: { type: "string", required: false, input: false },
        locale: { type: "string", required: false, defaultValue: "hi", input: false },
      },
    },
    rateLimit: {
      enabled: config.rateLimit,
      storage: "memory",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 20 } },
    },
    advanced: {
      // Better Auth skips its Origin/CSRF checks when NODE_ENV=test. Force them on
      // so tests exercise the same protection as production.
      disableOriginCheck: false,
    },
    session: {
      // Officers can be offline for days; a short session would strand their outbox.
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
