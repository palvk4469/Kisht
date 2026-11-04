import {
  IdParams,
  ImportCommitted,
  ImportHistory,
  ImportPreview,
  ImportPreviewBody,
  MAX_IMPORT_CSV_BYTES,
} from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { currentUser, requireRole } from "../../http/guards.js";
import { managerScope } from "../auth/scope.js";
import { buildDemoSample } from "./demoSample.js";
import { commitImport, listImports, previewImport } from "./service.js";

export function registerImports(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const managers = [ctx.authenticate, requireRole("BRANCH_MANAGER", "HEAD")];
  const tags = ["imports"];

  r.post(
    "/api/imports",
    {
      preHandler: managers,
      bodyLimit: MAX_IMPORT_CSV_BYTES + 64 * 1024,
      schema: {
        tags,
        summary: "Validate an overdue export and plan its effect, without changing loan data",
        body: ImportPreviewBody,
        response: { 201: ImportPreview },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await previewImport(ctx, currentUser(request), request.body)),
  );

  r.post(
    "/api/imports/:id/commit",
    {
      preHandler: managers,
      schema: {
        tags,
        summary: "Apply a previewed import",
        params: IdParams,
        response: { 200: ImportCommitted },
      },
    },
    async (request) => commitImport(ctx, currentUser(request), request.params.id),
  );

  r.get(
    "/api/imports",
    {
      preHandler: managers,
      schema: { tags, summary: "Recent committed imports", response: { 200: ImportHistory } },
    },
    async (request) => listImports(ctx, currentUser(request)),
  );

  if (ctx.config.demoMode) {
    r.get(
      "/api/imports/demo-sample",
      {
        preHandler: managers,
        schema: {
          tags,
          summary: "Demo only: today's export with sample changes",
          response: { 200: z.string() },
        },
      },
      async (request, reply) => {
        const { fileName, csv } = await buildDemoSample(
          ctx.prisma,
          managerScope(currentUser(request)),
        );
        return reply
          .header("content-type", "text/csv; charset=utf-8")
          .header("content-disposition", `attachment; filename="${fileName}"`)
          .send(csv);
      },
    );
  }
}
