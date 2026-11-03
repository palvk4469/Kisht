import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "../src/http/errors.js";

// The guarantees every route gets from declaring a response contract.
function appReturning(payload: unknown) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.withTypeProvider<ZodTypeProvider>().get(
    "/thing/:id",
    {
      schema: {
        params: z.object({ id: z.string().max(4) }),
        response: { 200: z.object({ name: z.string(), phoneMasked: z.string() }) },
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: deliberately off-contract payloads
    async () => payload as any,
  );
  return app;
}

describe("response contracts", () => {
  it("strip fields the contract doesn't list, so nothing leaks by accident", async () => {
    const res = await appReturning({
      name: "Company B",
      phoneMasked: "••••••2345",
      phone: "9000012345",
    }).inject("/thing/1");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: "Company B", phoneMasked: "••••••2345" });
  });

  it("turn a response missing a field into a 500, not a malformed reply", async () => {
    const res = await appReturning({ name: "Company B" }).inject("/thing/1");
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Something went wrong" });
  });

  it("reject invalid input with 400 before the handler runs", async () => {
    const res = await appReturning({ name: "x", phoneMasked: "y" }).inject("/thing/too-long");
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Invalid input");
  });
});
