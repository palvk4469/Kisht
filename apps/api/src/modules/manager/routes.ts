import {
  ClearDisputeBody,
  ClearPinBody,
  IdParams,
  ManagerBoard,
  MoveLoanBody,
  OfficerIdParams,
  Ok,
  PromiseQuery,
  PromiseTracker,
  ReassignBody,
} from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppContext } from "../../context.js";
import { currentUser, requireRole } from "../../http/guards.js";
import {
  clearDispute,
  clearPin,
  getBoard,
  getPromiseTracker,
  moveLoan,
  reassignLoan,
} from "./service.js";

export function registerManager(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = [ctx.authenticate, requireRole("BRANCH_MANAGER", "HEAD")];
  const tags = ["manager"];

  r.get(
    "/api/manager/board",
    {
      preHandler,
      schema: {
        tags,
        summary: "Officers' lists, the unassigned queue and disputes",
        response: { 200: ManagerBoard },
      },
    },
    async (request) => getBoard(ctx, currentUser(request)),
  );

  r.post(
    "/api/manager/lists/:officerId/move",
    {
      preHandler,
      schema: {
        tags,
        summary: "Pin a loan to a position today (audited)",
        params: OfficerIdParams,
        body: MoveLoanBody,
        response: { 200: Ok },
      },
    },
    async (request) => moveLoan(ctx, currentUser(request), request.params.officerId, request.body),
  );

  r.post(
    "/api/manager/lists/:officerId/unpin",
    {
      preHandler,
      schema: {
        tags,
        summary: "Hand a loan back to the model's order",
        params: OfficerIdParams,
        body: ClearPinBody,
        response: { 200: Ok },
      },
    },
    async (request) =>
      clearPin(ctx, currentUser(request), request.params.officerId, request.body.loanId),
  );

  r.post(
    "/api/manager/assignments",
    {
      preHandler,
      schema: {
        tags,
        summary: "Assign a loan to an officer by hand (audited)",
        body: ReassignBody,
        response: { 200: Ok },
      },
    },
    async (request) => reassignLoan(ctx, currentUser(request), request.body),
  );

  r.post(
    "/api/manager/disputes/:id/clear",
    {
      preHandler,
      schema: {
        tags,
        summary: "Allow contact again after review (audited)",
        params: IdParams,
        body: ClearDisputeBody,
        response: { 200: Ok },
      },
    },
    async (request) =>
      clearDispute(ctx, currentUser(request), request.params.id, request.body.note),
  );

  r.get(
    "/api/manager/promises",
    {
      preHandler,
      schema: {
        tags,
        summary: "Promise tracker and reminder log",
        querystring: PromiseQuery,
        response: { 200: PromiseTracker },
      },
    },
    async (request) => getPromiseTracker(ctx, currentUser(request), request.query),
  );
}
