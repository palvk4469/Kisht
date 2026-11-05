import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // The public web origin. The browser only talks to it; /api/* is proxied here (D3).
  BETTER_AUTH_URL: z.url(),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Demo conveniences (D13): sample export download. Never set in a real deployment.
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Proxies between the internet and this API, for the sign-in limit (D29).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().positive().default(1),
  // AI reminder drafts (D31). Without a key, officers get the approved templates.
  OPENROUTER_API_KEY: z.string().optional(),
  // Comma-separated OpenRouter models, tried in order.
  // Docker passes an unset variable as "", which must mean the default, not no models.
  AI_DRAFT_MODELS: z
    .string()
    .optional()
    .transform((value) => {
      const models = (value ?? "").split(",").flatMap((model) => model.trim() || []);
      return models.length > 0 ? models : undefined;
    }),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
