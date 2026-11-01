import { describe, expect, it, vi } from "vitest";
import type { Item, Trip } from "@/domain/types";
import { MemoryCache } from "./cache";
import { MemoryBackend, TripStore } from "./store";
import { LIMITS, OpenMeteo, StubWeather, tripWeather, TTL, WeatherService, type WeatherApi } from "./weather";

/*
 * No test here talks to Open-Meteo: the API is a stand-in that counts calls,
 * or OpenMeteo with a fake fetch that records the URLs it was given.
 */

const HOUR = 3_600_000;
const NOV_1 = Date.parse("2026-11-01T15:00:00Z");

function setup(now = { t: NOV_1 }, api: WeatherApi = new StubWeather(() => now.t)) {
  const calls = { geocode: [] as string[], forecast: 0, history: 0 };
  const counted: WeatherApi = {
    geocode: (name, cc) => (calls.geocode.push(`${name}|${cc ?? ""}`), api.geocode(name, cc)),
    forecast: (at, tz) => (calls.forecast++, api.forecast(at, tz)),
    history: (at, from, to) => (calls.history++, api.history(at, from, to)),
  };
  const svc = new WeatherService(counted, new MemoryCache(() => now.t), new TripStore(new MemoryBackend()), () => now.t);
  return { svc, calls, now };
}

const trip = (items: Item[], over: Partial<Trip> = {}): Trip => ({
  schema: 2,
  id: "t",
  name: "Test",
  destination: "Guatemala",
  startDate: "2026-11-10",
  endDate: "2026-11-24",
  tz: "America/Guatemala",
  currency: "GTQ",
  people: [],
  items,
  todos: [],
  ...over,
});

describe("Open-Meteo requests", () => {
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  it("asks for a 16-day daily forecast in the trip's zone and reads it", async () => {
    const urls: URL[] = [];
    const api = new OpenMeteo(async (u) => {
      urls.push(new URL(String(u)));
      return reply({ daily: { time: ["2026-11-01", "2026-11-02"], weather_code: [2, null], temperature_2m_max: [24.4, 25], temperature_2m_min: [12.1, 13], precipitation_probability_max: [30, 40] } });
    }, "");
    const rows = await api.forecast({ lat: 14.56, lng: -90.73 }, "America/Guatemala");
    expect(rows).toEqual([{ date: "2026-11-01", code: 2, hi: 24.4, lo: 12.1, rain: 30 }]);
    expect(urls[0].host).toBe("api.open-meteo.com");
    expect(Object.fromEntries(urls[0].searchParams)).toMatchObject({ latitude: "14.56", longitude: "-90.73", timezone: "America/Guatemala", forecast_days: "16" });
    expect(urls[0].searchParams.get("daily")).toContain("precipitation_probability_max");
  });

  it("geocodes a town in the trip's country, retrying without a qualifier it can't match", async () => {
    const urls: URL[] = [];
    const api = new OpenMeteo(async (u) => {
      const url = new URL(String(u));
      urls.push(url);
      return reply(url.searchParams.get("name")!.includes(",") ? {} : { results: [{ latitude: 17.06, longitude: -96.72, country_code: "MX" }] });
    }, "");
    expect(await api.geocode("Oaxaca, Lake Somewhere", "MX")).toEqual({ lat: 17.06, lng: -96.72, countryCode: "MX" });
    expect(urls.map((u) => u.searchParams.get("name"))).toEqual(["Oaxaca, Lake Somewhere", "Oaxaca"]);
    expect(urls[0].searchParams.get("countryCode")).toBe("MX");
  });

  it("uses the customer endpoints when a key is set", async () => {
    const urls: URL[] = [];
    const api = new OpenMeteo(async (u) => (urls.push(new URL(String(u))), reply({ daily: { time: [] } })), "k123");
    await api.history({ lat: 1, lng: 2 }, "2016-01-01", "2025-12-31");
    expect(urls[0].host).toBe("customer-archive-api.open-meteo.com");
    expect(urls[0].searchParams.get("apikey")).toBe("k123");
  });

  it("treats an error status as a failure", async () => {
    const api = new OpenMeteo(async () => new Response("busy", { status: 429 }), "");
    await expect(api.forecast({ lat: 1, lng: 2 }, "UTC")).rejects.toThrow("429");
  });
});

describe("caching", () => {
  it("keeps a forecast 3 hours, then asks again", async () => {
    const { svc, calls, now } = setup();
    const first = await svc.forecast({ lat: 14.561, lng: -90.734 }, "America/Guatemala");
    await svc.forecast({ lat: 14.559, lng: -90.731 }, "America/Guatemala"); // same 5 km square
    expect(calls.forecast).toBe(1);
    now.t += TTL.forecast * 1000 - 1;
    expect((await svc.forecast({ lat: 14.56, lng: -90.73 }, "America/Guatemala"))!.at).toBe(first!.at);
    now.t += 2;
    await svc.forecast({ lat: 14.56, lng: -90.73 }, "America/Guatemala");
    expect(calls.forecast).toBe(2);
  });

  it("keeps typical weather 30 days", async () => {
    const { svc, calls, now } = setup();
    expect((await svc.normals({ lat: 14.56, lng: -90.73 }))!.years).toBe("2016–2025");
    now.t += 29 * 24 * HOUR;
    await svc.normals({ lat: 14.56, lng: -90.73 });
    expect(calls.history).toBe(1);
    now.t += 2 * 24 * HOUR;
    await svc.normals({ lat: 14.56, lng: -90.73 });
    expect(calls.history).toBe(2);
  });

  it("remembers places found and not found, but never a failed lookup", async () => {
    let fail = true;
    const api: WeatherApi = {
      ...new StubWeather(),
      geocode: async (name) => {
        if (fail) throw new Error("down");
        return name === "Nowhere" ? null : { lat: 1, lng: 2, countryCode: "GT" };
      },
      forecast: async () => [],
      history: async () => ({ time: [], hi: [], lo: [], rain: [] }),
    };
    const { svc, calls } = setup(undefined, api);
    expect(await svc.place("Antigua", "GT")).toBeNull();
    fail = false;
    expect(await svc.place("Antigua", "GT")).toEqual({ lat: 1, lng: 2, countryCode: "GT" });
    expect(await svc.place("antigua ", "GT")).toEqual({ lat: 1, lng: 2, countryCode: "GT" });
    expect(await svc.place("Nowhere", "GT")).toBeNull();
    expect(await svc.place("Nowhere", "GT")).toBeNull();
    expect(calls.geocode).toEqual(["Antigua|GT", "Antigua|GT", "Nowhere|GT"]);
  });

  it("stops asking once the hourly budget is spent", async () => {
    const { svc, calls, now } = setup();
    for (let i = 0; i < LIMITS.callsPerHour + 5; i++) await svc.forecast({ lat: i, lng: 0 }, "UTC");
    expect(calls.forecast).toBe(LIMITS.callsPerHour);
    expect(await svc.forecast({ lat: -50, lng: 50 }, "UTC")).toBeNull();
    now.t += HOUR;
    expect(await svc.forecast({ lat: -50, lng: 50 }, "UTC")).not.toBeNull();
  });
});

describe("a trip's weather", () => {
  const located = (id: string, from: string, to: string, lat: number, lng: number): Item => ({ id, kind: "stay", title: id, start: { date: from }, end: { date: to }, place: { name: id, lat, lng } });

  it("forecasts the next 16 days and gives typical weather after, one request per place", async () => {
    const { svc, calls } = setup();
    const t = trip([located("Antigua", "2026-10-30", "2026-11-25", 14.56, -90.73)], { startDate: "2026-10-30" });
    const r = await tripWeather(t, svc, NOV_1);
    // Past days get nothing; Nov 1 to Nov 16 are forecast; after that is typical.
    expect(Object.keys(r.days)[0]).toBe("2026-11-01");
    expect(r.days["2026-11-16"]).toMatchObject({ kind: "forecast", code: 2, hi: 24, lo: 12, rain: 30, place: "Antigua" });
    expect(r.days["2026-11-17"]).toMatchObject({ kind: "typical", hi: 24, lo: 12, place: "Antigua", season: "dry" });
    // The stand-in rains on 6 of the 15 days around Nov 17 outside the rainy season.
    expect(r.days["2026-11-17"].kind === "typical" && r.days["2026-11-17"].wet).toBeCloseTo(0.4, 2);
    expect(r.years).toBe("2016–2025");
    expect(calls).toMatchObject({ forecast: 1, history: 1, geocode: [] });
  });

  it("looks up town names in the destination's country, and falls back to the destination", async () => {
    const { svc, calls } = setup();
    const t = trip([
      { id: "a", kind: "stay", title: "Casa", start: { date: "2026-11-10" }, end: { date: "2026-11-12" }, place: { name: "Antigua Guatemala" } },
      { id: "b", kind: "stay", title: "Nowhere Inn", start: { date: "2026-11-12" }, end: { date: "2026-11-13" }, place: { name: "Nowhere Inn" } },
    ]);
    const r = await tripWeather(t, svc, NOV_1);
    expect(r.days["2026-11-10"].place).toBe("Antigua Guatemala");
    expect(r.days["2026-11-12"].place).toBe("Guatemala");
    expect(calls.geocode).toEqual(["Guatemala|", "Antigua Guatemala|GT", "Nowhere Inn|GT"]);
  });

  it("serves the whole group from the cache, with the forecast's own time as 'as of'", async () => {
    const { svc, calls, now } = setup();
    const t = trip([located("Lake", "2026-11-10", "2026-11-24", 14.72, -91.27)]);
    const first = await tripWeather(t, svc, now.t);
    now.t += HOUR;
    const second = await tripWeather(t, svc, now.t);
    expect(second.asOf).toBe(first.asOf);
    expect(second.asOf).toBe(NOV_1);
    expect(calls.forecast).toBe(1);
  });

  it("returns what it could when the service is down", async () => {
    const down: WeatherApi = { geocode: vi.fn().mockRejectedValue(new Error("x")), forecast: vi.fn().mockRejectedValue(new Error("x")), history: vi.fn().mockRejectedValue(new Error("x")) };
    const { svc } = setup(undefined, down);
    const r = await tripWeather(trip([located("Lake", "2026-11-10", "2026-11-24", 14.72, -91.27)]), svc, NOV_1);
    expect(r.days).toEqual({});
  });
});
