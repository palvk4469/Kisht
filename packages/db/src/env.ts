import { config } from "dotenv";

// One .env at the repo root serves every package. Node tools load it through
// here; the API's start script uses --env-file, and Next loads it in next.config.
export const ROOT_ENV_PATH = new URL("../../../.env", import.meta.url).pathname;

export function loadRootEnv(): void {
  config({ path: ROOT_ENV_PATH, quiet: true });
}
