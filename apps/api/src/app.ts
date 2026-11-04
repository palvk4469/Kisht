import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { PrismaClient } from "@kisht/db";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { AppConfig, AppContext, Clock } from "./context.js";
import { errorHandler } from "./http/errors.js";
import { makeAuthenticate } from "./http/guards.js";
import { makeOriginGuard } from "./http/origin.js";
import { createAuth } from "./modules/auth/auth.js";
import { registerAuth } from "./modules/auth/routes.js";
import { createDemoClock, registerDemo } from "./modules/demo/routes.js";
import { registerField } from "./modules/field/routes.js";
import { registerHealth } from "./modules/health/routes.js";
import { registerImports } from "./modules/imports/routes.js";
import { registerLoans } from "./modules/loans/routes.js";
import { registerManager } from "./modules/manager/routes.js";
import { registerMe } from "./modules/me/routes.js";
import { startReminderTimer } from "./modules/reminders/service.js";

export type BuildAppOptions = {
  prisma: PrismaClient;
  authSecret: string;
  config: Pick<AppConfig, "baseURL"> & Partial<AppConfig>;
  clock?: Clock;
  logger?: FastifyServerOptions["logger"];
};

/** Every feature module, registered in one place. Each gets the same context. */
const MODULES = [
  registerHealth,
  registerAuth,
  registerMe,
  registerLoans,
  registerImports,
  registerField,
  registerManager,
];

// Composition root. Tests call this and use app.inject(); no port, no globals.
export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const config: AppConfig = { demoMode: false, docs: false, backgroundJobs: false, ...opts.config };
  const auth = createAuth(opts.prisma, { secret: opts.authSecret, baseURL: config.baseURL });
  const demoClock = createDemoClock(opts.clock ?? (() => new Date()));
  const ctx: AppContext = {
    prisma: opts.prisma,
    auth,
    clock: demoClock.now,
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

  if (config.docs) {
    // OpenAPI generated from the same zod contracts the routes run on.
    await app.register(swagger, {
      openapi: {
        info: {
          title: "Kisht Collections API",
          version: "1.0.0",
          description:
            "Field collections for MSME loans. Every route is scoped to the signed-in user (D6).",
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: "/api/docs" });
  }

  for (const register of MODULES) register(app, ctx);
  if (config.demoMode) registerDemo(app, ctx, demoClock);
  if (config.backgroundJobs) {
    const stop = startReminderTimer(ctx, app.log);
    app.addHook("onClose", async () => stop());
  }
  return app;
}
