import { afterEach, expect, it, vi } from "vitest";
import { mediaFeatureEnabled } from "./flags";

afterEach(() => vi.unstubAllEnvs());

it("fails closed without configuration, and child flags cannot bypass the master switch", () => {
  vi.stubEnv("MEMORIES_ENABLED", "0");
  vi.stubEnv("RECAP_AI_ENABLED", "1");
  vi.stubEnv("RECAP_RENDERING_ENABLED", "1");
  vi.stubEnv("MEMORIES_PILOT_TRIP_IDS", "trip-a");
  vi.stubEnv("MEMORIES_PILOT_ACCOUNT_IDS", "account-a");
  for (const capability of ["memories", "analysis", "rendering"] as const) {
    expect(mediaFeatureEnabled(capability, { tripId: "trip-a", accountId: "account-a" })).toBe(false);
  }
});

it("requires pilot membership and an account for analysis/rendering", () => {
  vi.stubEnv("MEMORIES_ENABLED", "1");
  vi.stubEnv("RECAP_AI_ENABLED", "1");
  vi.stubEnv("RECAP_RENDERING_ENABLED", "0");
  vi.stubEnv("MEMORIES_PILOT_TRIP_IDS", "trip-a");
  vi.stubEnv("MEMORIES_PILOT_ACCOUNT_IDS", "account-a");
  expect(mediaFeatureEnabled("memories", { tripId: "trip-a" })).toBe(true);
  expect(mediaFeatureEnabled("analysis", { tripId: "trip-a" })).toBe(false);
  expect(mediaFeatureEnabled("analysis", { tripId: "trip-a", accountId: "account-a" })).toBe(true);
  expect(mediaFeatureEnabled("rendering", { tripId: "trip-a", accountId: "account-a" })).toBe(false);
  expect(mediaFeatureEnabled("memories", { tripId: "trip-b", accountId: "account-a" })).toBe(false);
  expect(mediaFeatureEnabled("memories", { tripId: "trip-a", accountId: "account-b" })).toBe(false);
  vi.stubEnv("MEMORIES_PILOT_TRIP_IDS", "");
  expect(mediaFeatureEnabled("memories", { tripId: "trip-a" })).toBe(false);
});
