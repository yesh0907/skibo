import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src/web/e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "bun run dev -- --port 8787 --persist-to .wrangler/playwright",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
