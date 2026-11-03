import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the production build with the seeded demo data:
//   pnpm db:seed && pnpm --filter @kisht/web build && pnpm e2e
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  // One worker: the projects share one seeded database, and imports must not race.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
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
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter @kisht/web start",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
