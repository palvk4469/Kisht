import type { PrismaClient } from "@kisht/db";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { AppConfig, AppContext, Clock } from "./context.js";
import { errorHandler } from "./http/errors.js";
import { makeAuthenticate } from "./http/guards.js";
import { makeOriginGuard } from "./http/origin.js";
import { createAuth } from "./modules/auth/auth.js";
import { registerAuth } from "./modules/auth/routes.js";
import { registerHealth } from "./modules/health/routes.js";
import { registerImports } from "./modules/imports/routes.js";
import { registerLoans } from "./modules/loans/routes.js";
import { registerMe } from "./modules/me/routes.js";

export type BuildAppOptions = {
  prisma: PrismaClient;
  authSecret: string;
  config: Pick<AppConfig, "baseURL"> & Partial<AppConfig>;
  clock?: Clock;
  logger?: FastifyServerOptions["logger"];
};

/** Every feature module, registered in one place. Each gets the same context. */
const MODULES = [registerHealth, registerAuth, registerMe, registerLoans, registerImports];

// Composition root. Tests call this and use app.inject(); no port, no globals.
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const config: AppConfig = { demoMode: false, docs: false, ...opts.config };
  const auth = createAuth(opts.prisma, { secret: opts.authSecret, baseURL: config.baseURL });
  const ctx: AppContext = {
    prisma: opts.prisma,
    auth,
    clock: opts.clock ?? (() => new Date()),
    config,
    authenticate: makeAuthenticate(auth),
  };

  const app = Fastify({ logger: opts.logger ?? false });
  // Requests are validated and responses serialised by the zod contracts.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.decorateRequest("user", null);
  app.addHook("onRequest", makeOriginGuard(config.baseURL));

  for (const register of MODULES) register(app, ctx);
  return app;
}
