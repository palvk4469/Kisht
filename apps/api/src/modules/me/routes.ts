import { Me } from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppContext } from "../../context.js";
import { currentUser } from "../../http/guards.js";

export function registerMe(app: FastifyInstance, ctx: AppContext) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      "/api/me",
      { preHandler: ctx.authenticate, schema: { tags: ["session"], response: { 200: Me } } },
      async (request) => currentUser(request),
    );
}
