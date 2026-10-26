import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests", workers: 1, timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3400", viewport: { width: 1200, height: 1000 } },
  webServer: { command: "npm run dev", url: "http://127.0.0.1:3400", reuseExistingServer: !process.env.CI },
});
