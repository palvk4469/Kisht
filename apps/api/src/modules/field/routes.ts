import { SyncRequest, SyncResponse, TodayList } from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppContext } from "../../context.js";
import { currentUser, requireRole } from "../../http/guards.js";
import { syncEvents } from "./sync.js";
import { getTodayList } from "./today.js";

export function registerField(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const officers = [ctx.authenticate, requireRole("OFFICER")];
  const tags = ["field"];

  r.get(
    "/api/officer/today",
    {
      preHandler: officers,
      schema: {
        tags,
        summary: "The officer's prioritised list for today",
        response: { 200: TodayList },
      },
    },
    async (request) => getTodayList(ctx, currentUser(request)),
  );

  r.post(
    "/api/sync",
    {
      preHandler: officers,
      schema: {
        tags,
        summary: "Record contact attempts and outcomes from the phone (idempotent)",
        body: SyncRequest,
        response: { 200: SyncResponse },
      },
    },
    async (request) => syncEvents(ctx, currentUser(request), request.body),
  );
}
