import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

/** An error with an HTTP status that is safe to show the client. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    return reply.status(400).send({ error: "Invalid input", issues: error.validation });
  }
  if (isResponseSerializationError(error)) {
    // Our response didn't match its contract: a server bug, never the client's fault.
    request.log.error({ err: error.cause, url: error.url }, "response failed its contract");
    return reply.status(500).send({ error: "Something went wrong" });
  }
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  request.log.error(error);
  return reply.status(500).send({ error: "Something went wrong" });
}
