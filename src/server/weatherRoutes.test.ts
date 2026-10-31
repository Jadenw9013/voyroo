import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A cookie jar standing in for next/headers between "requests" in one test. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

const { setStoreForTests, getStore } = await import("./db");
const { MemoryBackend, TripStore } = await import("./store");
const { MemoryCache } = await import("./cache");
const { setWeatherServiceForTests, StubWeather, WeatherService } = await import("./weather");
const joinRoute = await import("@/app/api/t/[tripId]/join/route");
const weatherRoute = await import("@/app/api/t/[tripId]/weather/route");
const essentialsRoute = await import("@/app/api/t/[tripId]/essentials/route");

const ctx = (tripId = "guatemala") => ({ params: Promise.resolve({ tripId }) });
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const get = () => new Request("http://localhost/api");

beforeEach(() => {
  jar.clear();
  setStoreForTests(new TripStore(new MemoryBackend()));
  setWeatherServiceForTests(new WeatherService(new StubWeather(), new MemoryCache(), getStore()));
});

afterEach(() => {
  setWeatherServiceForTests(undefined);
  vi.unstubAllEnvs();
});

const join = () => joinRoute.POST(post({ name: "Sam", passcode: "volcano" }), ctx());

describe("GET /api/t/{id}/weather", () => {
  it("is only for people on the trip", async () => {
    expect((await weatherRoute.GET(get(), ctx())).status).toBe(401);
  });

  it("returns each remaining day's weather, never cached by the browser", async () => {
    await join();
    const res = await weatherRoute.GET(get(), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(typeof body.asOf).toBe("number");
    for (const d of Object.values(body.days) as { kind: string; hi: number; place: string }[]) {
      expect(["forecast", "typical"]).toContain(d.kind);
      expect(d.hi).toBe(24);
      expect(d.place).toBeTruthy();
    }
  });

  it("slows down a trip that asks too often", async () => {
    await join();
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await weatherRoute.GET(get(), ctx())).status;
    expect(last).toBe(429);
  });
});

describe("POST /api/t/{id}/essentials", () => {
  it("is only for people on the trip, and needs a nationality", async () => {
    expect((await essentialsRoute.POST(post({ nationality: "United States" }), ctx())).status).toBe(401);
    await join();
    expect((await essentialsRoute.POST(post({ nationality: "" }), ctx())).status).toBe(400);
    expect((await essentialsRoute.POST(post({ nationality: "<script>" }), ctx())).status).toBe(400);
  });

  it("says plainly when there's no assistant to draft with", async () => {
    vi.stubEnv("CHAT_MOCK", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    await join();
    const res = await essentialsRoute.POST(post({ nationality: "United States" }), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("type the essentials in yourself");
  });

  it("returns a draft with its sources and the day it was looked up, and limits drafts per day", async () => {
    vi.stubEnv("CHAT_MOCK", "1");
    await join();
    const res = await essentialsRoute.POST(post({ nationality: "United States" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields.emergency).toContain("Police");
    expect(body.sources.length).toBeGreaterThan(0);
    expect(body.draftedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    let last = 200;
    for (let i = 0; i < 10; i++) last = (await essentialsRoute.POST(post({ nationality: "United States" }), ctx())).status;
    expect(last).toBe(429);
  });
});
