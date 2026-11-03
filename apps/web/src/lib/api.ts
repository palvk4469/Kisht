import type { z } from "zod";

// Same-origin fetch. /api/* is proxied to Fastify (D3), so cookies are
// first-party and every mutation carries this page's Origin, which the API
// checks. Responses are parsed with the same @kisht/contracts schema the API
// serialises with, so a contract drift fails loudly here, not in a component.

export class ApiError extends Error {
  constructor(
    /** HTTP status; 0 = network unreachable, -1 = response broke its contract. */
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

type Options<S extends z.ZodType> = {
  schema: S;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function request<S extends z.ZodType>(
  path: string,
  opts: Options<S>,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      credentials: "same-origin",
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    const body = data as { error?: string; message?: string } | null;
    throw new ApiError(res.status, body?.error ?? body?.message ?? res.statusText, data);
  }
  const parsed = opts.schema.safeParse(data);
  if (!parsed.success) {
    console.error(`Response from ${path} broke its contract`, parsed.error.issues);
    throw new ApiError(-1, "contract", data);
  }
  return parsed.data;
}

export const isSignedOut = (err: unknown) => err instanceof ApiError && err.status === 401;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
