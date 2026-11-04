import { z } from "zod";
import { request } from "./api";

// Plain calls to Better Auth's endpoints. Its client library is large for two
// requests, and every kilobyte counts on the officers' phones.

export const signInWithEmail = (email: string, password: string) =>
  request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
    schema: z.unknown(),
  });

export const signOutOfServer = () =>
  request("/api/auth/sign-out", { method: "POST", body: {}, schema: z.unknown() });
