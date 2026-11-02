import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { currentUser } from "../auth/session.js";

export function registerMeRoutes(app: FastifyInstance, authenticate: preHandlerAsyncHookHandler) {
  app.get("/api/me", { preHandler: authenticate }, async (request) => currentUser(request));
}
