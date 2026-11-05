import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the production build with the seeded demo data:
//   pnpm db:seed && pnpm --filter @kisht/web build && pnpm e2e
// Set E2E_WEB_PORT if something else on this machine uses port 3000.
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3000";
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  // One worker: the projects share one seeded database, and imports must not race.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @kisht/api start",
      url: "http://localhost:4000/health",
      env: { BETTER_AUTH_URL: WEB_URL },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter @kisht/web exec next start --port ${WEB_PORT}`,
      url: `${WEB_URL}/login`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
