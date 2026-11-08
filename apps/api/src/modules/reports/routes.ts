import {
  ActivityExportQuery,
  ActivityLog,
  ActivityQuery,
  Dashboard,
  DashboardQuery,
  ManagerDay,
} from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { currentUser, requireRole } from "../../http/guards.js";
import { exportActivity, getActivity, getDashboard, getManagerDay } from "./service.js";

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

  r.get(
    "/api/manager/activity/export",
    {
      preHandler,
      schema: {
        tags,
        summary: "Every contact attempt over a range of IST days, as CSV, for an audit",
        querystring: ActivityExportQuery,
        response: { 200: z.string() },
      },
    },
    async (request, reply) => {
      const { fileName, csv } = await exportActivity(ctx, currentUser(request), request.query);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${fileName}"`)
        .header("cache-control", "no-store")
        .send(csv);
    },
  );
}
