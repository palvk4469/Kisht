import type { Prisma, PrismaClient } from "@kisht/db";

type Db = PrismaClient | Prisma.TransactionClient;

export type AuditEvent = {
  actorId: string;
  /** dotted verb, e.g. "contact.reveal", "import.commit" */
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
};

/** Append-only record of sensitive actions (DPDP access log, overrides, imports). */
export function audit(db: Db, event: AuditEvent) {
  return db.auditLog.create({
    data: {
      actorId: event.actorId,
      action: event.action,
      entity: event.entity,
      entityId: event.entityId,
      meta: (event.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
}
