import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

export type BuildAppOptions = Pick<FastifyServerOptions, "logger">;

// Factory so tests can build the app and call it with app.inject(), no port needed.
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  app.get("/health", async () => ({
    status: "ok",
    // Clients use this to measure device clock skew (see the sync design).
    serverTime: new Date().toISOString(),
  }));

  return app;
}
