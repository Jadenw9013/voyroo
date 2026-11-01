import { spawnSync } from "node:child_process";

// Run via npm so its exact CLI is available on Windows and Linux without a shell.
const commands = {
  checks: [["run", "lint"], ["run", "typecheck"], ["test"]],
  browser: [["run", "e2e"]],
  production: [["run", "build"], ["exec", "--", "playwright", "test", "--config", "playwright.production.config.ts"]],
};
const selected = commands[process.argv[2]];
if (!selected || !process.env.npm_execpath) throw new Error("Use npm run ci:checks, ci:browser, or e2e:production");
const env = { ...process.env };
// Never inherit provider credentials into a test/build. Explicit blanks also
// override Next's .env.local loading. Do not print the inherited environment.
for (const key of Object.keys(env)) {
  if (/(TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|CREDENTIAL)/i.test(key)) env[key] = "";
}
Object.assign(env, {
  KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "",
  GEMINI_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_REDIRECT_URI: "",
  SESSION_SECRET: "isolated-test-only-session-secret", TRIP_PASSCODE: "", ALLOW_MEMORY_STORE: "1",
  MEMORIES_ENABLED: "0", RECAP_AI_ENABLED: "0", RECAP_RENDERING_ENABLED: "0",
  MEMORIES_PILOT_TRIP_IDS: "", MEMORIES_PILOT_ACCOUNT_IDS: "", NEXT_DIST_DIR: ".next", GEOCODER: "stub",
});
for (const args of selected) {
  const child = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { env, stdio: "inherit" });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
