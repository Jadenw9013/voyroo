import { defineConfig } from "@playwright/test";

/*
 * End-to-end checks at phone and desktop sizes: joining, adding, the item
 * page, the assistant, layout and accessibility. `npm run e2e`.
 *
 * The server uses the in-memory store, the scripted stand-in assistant and
 * stand-in weather, never Redis, Gemini or Open-Meteo, so nothing here can
 * touch a real trip or a real service.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // One at a time: tests share one server and its in-memory trip.
  workers: 1,
  // On GitHub, also report each failing test as an annotation on the pull request.
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    // The trip map draws with WebGL. CI machines have no GPU, and Chrome only falls back to its
    // software renderer when asked; without it the map shows its no-WebGL fallback instead.
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "npx next dev -p 3200",
    url: "http://localhost:3200",
    env: {
      CHAT_MOCK: "1",
      RATES_MOCK: "1",
      WEATHER: "stub",
      ALLOW_MEMORY_STORE: "1",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      GEMINI_API_KEY: "",
      // Travel times: a local stand-in, never a real routing service.
      ROUTING_MOCK: "1",
      OPENROUTESERVICE_API_KEY: "",
      SESSION_SECRET: "test-only-playwright-session-secret",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: "",
      TRIP_PASSCODE: "volcano",
      NEXT_DIST_DIR: ".next-e2e",
      // Map pins come from a fixed table: tests never reach Nominatim.
      GEOCODER: "stub",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
