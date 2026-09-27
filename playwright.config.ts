import { defineConfig, devices } from "@playwright/test";

// Teste ponta a ponta contra um servidor já rodando:
//   E2E_BASE_URL=https://meu-servidor E2E_EMAIL=admin@... E2E_PASSWORD=... npm run test:e2e
// (na primeira vez: npx playwright install chromium)
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:8080",
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === "true",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
