import { IdParams, LoanDetail, RevealContactResponse } from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppContext } from "../../context.js";
import { currentUser } from "../../http/guards.js";
import { getLoanDetail, revealContact } from "./service.js";

export function registerLoans(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ["loans"];

  r.get(
    "/api/loans/:id",
    {
      preHandler: ctx.authenticate,
      schema: { tags, params: IdParams, response: { 200: LoanDetail } },
    },
    async (request) => getLoanDetail(ctx, currentUser(request), request.params.id),
  );

  r.post(
    "/api/loans/:id/reveal-contact",
    {
      preHandler: ctx.authenticate,
      schema: { tags, params: IdParams, response: { 200: RevealContactResponse } },
    },
    async (request) => revealContact(ctx, currentUser(request), request.params.id),
  );
}
