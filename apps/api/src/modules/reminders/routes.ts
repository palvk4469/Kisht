import { ReminderDraft, ReminderDraftRequest, ReminderSendResult } from "@kisht/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../../context.js";
import { currentUser, requireRole } from "../../http/guards.js";
import { draftReminder, sendReminder } from "./drafts.js";

export function registerReminders(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const officers = [ctx.authenticate, requireRole("OFFICER")];
  const tags = ["reminders"];

  r.post(
    "/api/officer/loans/:loanId/reminder-draft",
    {
      preHandler: officers,
      schema: {
        tags,
        summary: "Draft a reminder from an approved template. Sends nothing",
        params: z.object({ loanId: z.string() }),
        body: ReminderDraftRequest,
        response: { 200: ReminderDraft },
      },
    },
    async (request) =>
      draftReminder(ctx, currentUser(request), request.params.loanId, request.body.lang),
  );

  r.post(
    "/api/officer/reminder-drafts/:draftId/send",
    {
      preHandler: officers,
      schema: {
        tags,
        summary: "Send a drafted reminder, on the officer's tap",
        params: z.object({ draftId: z.string() }),
        response: { 200: ReminderSendResult },
      },
    },
    async (request) => sendReminder(ctx, currentUser(request), request.params.draftId),
  );
}
