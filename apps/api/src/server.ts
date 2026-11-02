import { buildApp } from "./app.js";

const host = process.env["API_HOST"] ?? "0.0.0.0";
const port = Number(process.env["API_PORT"] ?? 4000);

const app = await buildApp({ logger: true });

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
