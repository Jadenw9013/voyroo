import { defineConfig } from "@playwright/test";
const url = `http://127.0.0.1:${Number(process.env.RECAP_EDITOR_PORT || "3400")}`;
export default defineConfig({
  testDir: "tests", workers: 1, timeout: 30_000,
  use: { baseURL: url, viewport: { width: 1200, height: 1000 } },
  webServer: { command: "npm run dev", url, reuseExistingServer: false },
});
