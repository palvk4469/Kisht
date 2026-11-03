import type { PrismaClient } from "@kisht/db";
import { fromDbDate, isIsoDay } from "@kisht/shared";
import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { currentUser, HttpError, requireRole } from "../auth/session.js";
import { buildDemoSample } from "../imports/demoSample.js";
import { commitImport, importScopeFor, previewImport } from "../imports/service.js";

const MAX_CSV_BYTES = 8 * 1024 * 1024;

const PreviewBody = z.object({
  asOfDate: z.string().refine(isIsoDay, "must be YYYY-MM-DD"),
  fileName: z.string().trim().min(1).max(200),
  csv: z.string().min(1).max(MAX_CSV_BYTES),
});
const Params = z.object({ id: z.string().min(1).max(64) });

export function registerImportRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  authenticate: preHandlerAsyncHookHandler,
  now: () => Date,
  demoMode: boolean,
) {
  const managers = { preHandler: [authenticate, requireRole("BRANCH_MANAGER", "HEAD")] };

  app.post(
    "/api/imports",
    { ...managers, bodyLimit: MAX_CSV_BYTES + 64 * 1024 },
    async (request, reply) => {
      const body = PreviewBody.parse(request.body);
      const result = await previewImport(prisma, currentUser(request), body, now());
      return reply.status(201).send(result);
    },
  );

  if (demoMode) {
    app.get("/api/imports/demo-sample", managers, async (request, reply) => {
      const { fileName, csv } = await buildDemoSample(prisma, importScopeFor(currentUser(request)));
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${fileName}"`)
        .send(csv);
    });
  }

  app.post("/api/imports/:id/commit", managers, async (request) => {
    const { id } = Params.parse(request.params);
    return commitImport(prisma, currentUser(request), id, now());
  });

  app.get("/api/imports", managers, async (request) => {
    const scope = importScopeFor(currentUser(request));
    const batches = await prisma.importBatch.findMany({
      where: {
        // Unconfirmed previews are scratch work, not history.
        status: { not: "PREVIEW" },
        ...(scope.branchIds === null
          ? {}
          : { OR: [{ branchId: { in: scope.branchIds } }, { branchId: null }] }),
      },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: { uploadedBy: { select: { name: true } } },
    });
    return batches.map((b) => ({
      id: b.id,
      asOfDate: fromDbDate(b.asOfDate),
      fileName: b.fileName,
      status: b.status,
      rowCount: b.rowCount,
      errorCount: b.errorCount,
      uploadedBy: b.uploadedBy.name,
      createdAt: b.createdAt,
      committedAt: b.committedAt,
      summary: b.summary,
    }));
  });

  app.get("/api/imports/:id", managers, async (request) => {
    const user = currentUser(request);
    const { id } = Params.parse(request.params);
    const scope = importScopeFor(user);
    const b = await prisma.importBatch.findFirst({
      where: {
        id,
        ...(scope.branchIds === null
          ? {}
          : { OR: [{ branchId: { in: scope.branchIds } }, { branchId: null }] }),
      },
    });
    if (!b) throw new HttpError(404, "Import not found");
    return {
      id: b.id,
      asOfDate: fromDbDate(b.asOfDate),
      fileName: b.fileName,
      status: b.status,
      summary: b.summary,
      errors: b.errors ?? [],
      canCommit: b.status === "PREVIEW" && b.uploadedById === user.id && b.payload !== null,
    };
  });
}
