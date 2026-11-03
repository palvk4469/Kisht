import { createAuthClient } from "better-auth/react";

// Better Auth lives behind the same-origin /api/auth proxy.
export const authClient = createAuthClient({
  basePath: "/api/auth",
});
