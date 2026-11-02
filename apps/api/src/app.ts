import type { PrismaClient } from "@kisht/db";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { ZodError, z } from "zod";
import { createAuth } from "./auth/auth.js";
import { makeOriginGuard } from "./auth/origin.js";
import { HttpError, makeAuthenticate } from "./auth/session.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerLoanRoutes } from "./routes/loans.js";
import { registerMeRoutes } from "./routes/me.js";

export type BuildAppOptions = {
  prisma: PrismaClient;
  authSecret: string;
  /** Public web origin; Better Auth builds callback URLs and checks Origin against it. */
  baseURL: string;
  logger?: FastifyServerOptions["logger"];
};

// Factory so tests can build the app and call it with app.inject(), no port needed.
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const auth = createAuth(opts.prisma, { secret: opts.authSecret, baseURL: opts.baseURL });
  const authenticate = makeAuthenticate(auth);

  app.decorateRequest("user", null);
  app.addHook("onRequest", makeOriginGuard(opts.baseURL));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "Invalid input", issues: z.flattenError(error) });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: (error as Error).message });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "Something went wrong" });
  });

  app.get("/health", async () => ({
    status: "ok",
    // Clients use this to measure device clock skew (see the sync design).
    serverTime: new Date().toISOString(),
  }));

  registerAuthRoutes(app, auth, opts.baseURL);
  registerMeRoutes(app, authenticate);
  registerLoanRoutes(app, opts.prisma, authenticate);

  return app;
}
