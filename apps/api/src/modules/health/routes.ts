import { HealthResponse } from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppContext } from "../../context.js";

export function registerHealth(app: FastifyInstance, ctx: AppContext) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/health",
      { schema: { tags: ["system"], response: { 200: HealthResponse } } },
      async () => ({ status: "ok" as const, serverTime: ctx.clock().toISOString() }),
    );
}
