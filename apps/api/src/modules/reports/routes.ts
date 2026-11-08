import {
  ActivityLog,
  ActivityQuery,
  Dashboard,
  DashboardQuery,
  ManagerDay,
} from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppContext } from "../../context.js";
import { currentUser, requireRole } from "../../http/guards.js";
import { getActivity, getDashboard, getManagerDay } from "./service.js";

export function registerReports(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [ctx.authenticate, requireRole("BRANCH_MANAGER", "HEAD")];
  const tags = ["reports"];

  r.get(
    "/api/manager/dashboard",
    {
      preHandler,
      schema: {
        tags,
        summary: "Roll rates, loans about to roll, promises, the back-test",
        querystring: DashboardQuery,
        response: { 200: Dashboard },
      },
    },
    async (request) => getDashboard(ctx, currentUser(request), request.query.branchId),
  );

  r.get(
    "/api/manager/activity",
    {
      preHandler,
      schema: {
        tags,
        summary: "Officer activity with locations, and the contact-rule record",
        querystring: ActivityQuery,
        response: { 200: ActivityLog },
      },
    },
    async (request) => getActivity(ctx, currentUser(request), request.query),
  );

  r.get(
    "/api/manager/day",
    {
      preHandler,
      schema: {
        tags,
        summary: "Each officer's day so far: attempts, outcomes, rupees, last sync",
        response: { 200: ManagerDay },
      },
    },
    async (request) => getManagerDay(ctx, currentUser(request)),
  );
}
