import "server-only";
import { normalsFrom, typicalOn, weatherSpots, type DayWeather, type Normals, type Spot, type WeatherReport } from "@/domain/weather";
import { addDays, todayIn } from "@/domain/time";
import type { Trip } from "@/domain/types";
import { getCache, type KeyValueCache } from "./cache";
import { getStore } from "./db";

/*
 * A trip's weather, from Open-Meteo (https://open-meteo.com): free for
 * non-commercial use with no key, under 10,000 calls a day, data under
 * CC BY 4.0 (credited next to every forecast on screen). Voyroo is a private
 * app for a group of friends with no ads or subscriptions; a commercial
 * deploy sets OPEN_METEO_API_KEY and uses the customer endpoints.
 *
 *   - Forecasts (16 days) are cached 3 hours per place, so every phone in the
 *     group shares one call.
 *   - Typical weather past the forecast is averaged from the last 10 years
 *     of daily history and cached 30 days. That request counts as ~260 calls
 *     against the quota, so at most HISTORY_PER_DAY run in a day.
 *   - Town names are geocoded by Open-Meteo's own geocoder (towns, not
 *     street addresses) and cached 30 days; misses for a week.
 *   - WEATHER=stub answers from fixed numbers for tests; WEATHER=off turns it off.
 */

export interface Located {
  lat: number;
  lng: number;
  countryCode?: string;
}

export interface ForecastRow {
  date: string;
  code: number;
  hi: number;
  lo: number;
  rain: number | null;
}

export interface History {
  time: string[];
  hi: (number | null)[];
  lo: (number | null)[];
  rain: (number | null)[];
}

/** The calls made to the weather service. Swapped for a stand-in in tests. */
export interface WeatherApi {
  geocode(name: string, countryCode?: string): Promise<Located | null>;
  forecast(at: Located, tz: string): Promise<ForecastRow[]>;
  history(at: Located, from: string, to: string): Promise<History>;
}

export const TTL = { forecast: 3 * 3600, climate: 30 * 86_400, place: 30 * 86_400, noPlace: 7 * 86_400 };
export const LIMITS = { callsPerHour: 300, historyPerDay: 20 };
/** How many days ahead forecasts reach (today plus 15). */
export const FORECAST_DAYS = 16;

const TIMEOUT_MS = 8000;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export class OpenMeteo implements WeatherApi {
  constructor(
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private key = process.env.OPEN_METEO_API_KEY,
  ) {}

  private url(sub: "api" | "archive-api" | "geocoding-api", path: string, params: Record<string, string>) {
    const u = new URL(path, `https://${this.key ? "customer-" : ""}${sub}.open-meteo.com`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (this.key) u.searchParams.set("apikey", this.key);
    return u;
  }

  private async json(u: URL): Promise<Record<string, unknown>> {
    const res = await this.fetcher(u, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  async geocode(name: string, countryCode?: string): Promise<Located | null> {
    // "Oaxaca, Mexico" narrows by country or region, but only on an exact match: fall back to the town alone.
    const tries = name.includes(",") ? [name, name.split(",")[0].trim()] : [name];
    for (const q of tries) {
      const body = await this.json(this.url("geocoding-api", "/v1/search", { name: q, count: "1", language: "en", format: "json", ...(countryCode ? { countryCode } : {}) }));
      const hit = Array.isArray(body.results) ? (body.results[0] as Record<string, unknown>) : null;
      const lat = num(hit?.latitude);
      const lng = num(hit?.longitude);
      if (lat !== null && lng !== null) return { lat, lng, ...(typeof hit?.country_code === "string" ? { countryCode: hit.country_code } : {}) };
    }
    return null;
  }

  async forecast(at: Located, tz: string): Promise<ForecastRow[]> {
    const body = await this.json(
      this.url("api", "/v1/forecast", {
        latitude: String(at.lat),
        longitude: String(at.lng),
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        timezone: tz,
        forecast_days: String(FORECAST_DAYS),
      }),
    );
    const d = (body.daily ?? {}) as Record<string, unknown[]>;
    const rows: ForecastRow[] = [];
    (Array.isArray(d.time) ? d.time : []).forEach((date, i) => {
      const [code, hi, lo] = [num(d.weather_code?.[i]), num(d.temperature_2m_max?.[i]), num(d.temperature_2m_min?.[i])];
      if (typeof date === "string" && code !== null && hi !== null && lo !== null) rows.push({ date, code, hi, lo, rain: num(d.precipitation_probability_max?.[i]) });
    });
    return rows;
  }

  async history(at: Located, from: string, to: string): Promise<History> {
    const body = await this.json(
      this.url("archive-api", "/v1/archive", {
        latitude: String(at.lat),
        longitude: String(at.lng),
        start_date: from,
        end_date: to,
        daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
        timezone: "auto",
      }),
    );
    const d = (body.daily ?? {}) as Record<string, unknown[]>;
    const time = (Array.isArray(d.time) ? d.time : []).filter((t): t is string => typeof t === "string");
    return {
      time,
      hi: time.map((_, i) => num(d.temperature_2m_max?.[i])),
      lo: time.map((_, i) => num(d.temperature_2m_min?.[i])),
      rain: time.map((_, i) => num(d.precipitation_sum?.[i])),
    };
  }
}

/** Fixed answers for tests and offline development: partly cloudy, 24°/12°, rainy May to October. */
export class StubWeather implements WeatherApi {
  constructor(private now: () => number = Date.now) {}
  async geocode(name: string): Promise<Located | null> {
    if (/nowhere/i.test(name)) return null;
    return /antigua/i.test(name) ? { lat: 14.56, lng: -90.73, countryCode: "GT" } : { lat: 14.7, lng: -91.25, countryCode: "GT" };
  }
  async forecast(_at: Located, tz: string): Promise<ForecastRow[]> {
    const today = todayIn(tz, this.now());
    return Array.from({ length: FORECAST_DAYS }, (_, i) => ({ date: addDays(today, i), code: 2, hi: 24, lo: 12, rain: 30 }));
  }
  async history(_at: Located, from: string, to: string): Promise<History> {
    const time: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) time.push(d);
    const month = (t: string) => Number(t.slice(5, 7));
    return {
      time,
      hi: time.map(() => 24),
      lo: time.map(() => 12),
      // Every day in the rainy months; 3 days in 10 otherwise.
      rain: time.map((t) => (month(t) >= 5 && month(t) <= 10 ? 6 : Number(t.slice(9, 10)) < 3 ? 4 : 0)),
    };
  }
}

type Counter = { hit(key: string, ttlSeconds: number): Promise<number> };
type Outcome<T> = { ok: true; value: T } | { ok: false };

const norm = (q: string) => q.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
/** Forecast places on a ~5 km grid, climate on ~11 km: close enough for weather, and fewer distinct calls. */
const grid = (at: Located, step: number): Located => ({ lat: Math.round(at.lat / step) * step, lng: Math.round(at.lng / step) * step });
const fixed = (at: Located) => `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`;

/** Asks the weather API through the cache, inside the call budget. */
export class WeatherService {
  constructor(
    private api: WeatherApi,
    private cache: KeyValueCache,
    private counter: Counter,
    private now: () => number = Date.now,
  ) {}

  /** One upstream call, if the budget allows. Failures are not cached. */
  private async call<T>(kind: "call" | "history", run: () => Promise<T>): Promise<Outcome<T>> {
    const used =
      kind === "history"
        ? await this.counter.hit(`wx:history:${Math.floor(this.now() / 86_400_000)}`, 86_400)
        : await this.counter.hit(`wx:calls:${Math.floor(this.now() / 3_600_000)}`, 3600);
    if (used > (kind === "history" ? LIMITS.historyPerDay : LIMITS.callsPerHour)) return { ok: false };
    try {
      return { ok: true, value: await run() };
    } catch {
      return { ok: false };
    }
  }

  async place(name: string, countryCode?: string): Promise<Located | null> {
    const key = `wx:place:v1:${countryCode ?? "-"}:${norm(name)}`;
    const hit = await this.cache.get(key);
    if (hit === "none") return null;
    if (hit) return JSON.parse(hit) as Located;
    const r = await this.call("call", () => this.api.geocode(name, countryCode));
    if (!r.ok) return null;
    await this.cache.set(key, r.value ? JSON.stringify(r.value) : "none", r.value ? TTL.place : TTL.noPlace);
    return r.value;
  }

  async forecast(at: Located, tz: string): Promise<{ rows: ForecastRow[]; at: number } | null> {
    const spot = grid(at, 0.05);
    const key = `wx:forecast:v1:${fixed(spot)}:${tz}`;
    const hit = await this.cache.get(key);
    if (hit) return JSON.parse(hit);
    const r = await this.call("call", () => this.api.forecast(spot, tz));
    if (!r.ok || !r.value.length) return null;
    const value = { rows: r.value, at: this.now() };
    await this.cache.set(key, JSON.stringify(value), TTL.forecast);
    return value;
  }

  /** Typical weather for every day of the year at a place, from the last 10 full years. */
  async normals(at: Located): Promise<Normals | null> {
    const spot = grid(at, 0.1);
    const key = `wx:normals:v1:${fixed(spot)}`;
    const hit = await this.cache.get(key);
    if (hit) return JSON.parse(hit);
    const last = new Date(this.now()).getUTCFullYear() - 1;
    const r = await this.call("history", () => this.api.history(spot, `${last - 9}-01-01`, `${last}-12-31`));
    const normals = r.ok ? normalsFrom(r.value) : null;
    if (!normals) return null;
    await this.cache.set(key, JSON.stringify(normals), TTL.climate);
    return normals;
  }
}

/** Weather for every trip day from today on: forecasts where they reach, typical weather after. */
export async function tripWeather(trip: Trip, svc: WeatherService, now = Date.now()): Promise<WeatherReport> {
  const today = todayIn(trip.tz, now);
  const lastForecastDay = addDays(today, FORECAST_DAYS - 1);
  const days = Object.entries(weatherSpots(trip)).filter(([d]) => d >= today);

  // The same name is often asked for by several days at once: one lookup each.
  const places = new Map<string, Promise<Located | null>>();
  const place = (name: string, cc?: string) => {
    const k = `${cc ?? ""}|${name}`;
    if (!places.has(k)) places.set(k, svc.place(name, cc));
    return places.get(k)!;
  };
  let country: Promise<string | undefined> | undefined;
  const countryCode = () => (country ??= place(trip.destination).then((p) => p?.countryCode));
  const destination: Spot = { label: trip.destination.split(",")[0].trim(), names: [trip.destination], from: "destination" };

  const resolve = async (spot: Spot): Promise<(Located & { label: string }) | null> => {
    if (spot.lat !== undefined && spot.lng !== undefined) return { lat: spot.lat, lng: spot.lng, label: spot.label };
    const cc = spot.from === "destination" ? undefined : await countryCode();
    for (const name of spot.names) {
      const at = await place(name, cc);
      if (at) return { ...at, label: spot.from === "destination" ? spot.label : name };
    }
    return spot.from === "destination" ? null : resolve(destination);
  };

  // Each distinct spot is looked up once, then days are grouped by where they ended up.
  const lookups = new Map<string, ReturnType<typeof resolve>>();
  const spotKey = (s: Spot) => (s.lat !== undefined ? `${s.lat},${s.lng}` : s.names.join("|"));
  const placed = await Promise.all(
    days.map(async ([date, spot]) => {
      const k = spotKey(spot);
      if (!lookups.has(k)) lookups.set(k, resolve(spot));
      return { date, at: await lookups.get(k)! };
    }),
  );

  const groups = new Map<string, { at: Located; days: { date: string; label: string }[] }>();
  for (const p of placed) {
    if (!p.at) continue;
    const k = fixed(grid(p.at, 0.05));
    const g = groups.get(k) ?? { at: p.at, days: [] };
    g.days.push({ date: p.date, label: p.at.label });
    groups.set(k, g);
  }

  const out: Record<string, DayWeather> = {};
  let asOf = now;
  let years: string | undefined;
  await Promise.all(
    [...groups.values()].map(async (g) => {
      const fc = g.days.some((d) => d.date <= lastForecastDay) ? await svc.forecast(g.at, trip.tz) : null;
      if (fc) asOf = Math.min(asOf, fc.at);
      const byDate = new Map(fc?.rows.map((r) => [r.date, r]));
      let normals: Promise<Normals | null> | undefined;
      for (const d of g.days) {
        const f = byDate.get(d.date);
        if (f) {
          out[d.date] = { kind: "forecast", code: f.code, hi: f.hi, lo: f.lo, rain: f.rain, place: d.label };
          continue;
        }
        const n = await (normals ??= svc.normals(g.at));
        const t = n ? typicalOn(n, d.date) : null;
        if (!n || !t) continue;
        years = n.years;
        out[d.date] = { kind: "typical", ...t, place: d.label };
      }
    }),
  );
  return { asOf, days: out, ...(years ? { years } : {}) };
}

const g = globalThis as unknown as { weatherService?: WeatherService | null };

/** The app's weather service, or null when WEATHER=off. */
export function weatherService(): WeatherService | null {
  if (g.weatherService !== undefined) return g.weatherService;
  const mode = process.env.WEATHER;
  g.weatherService = mode === "off" ? null : new WeatherService(mode === "stub" ? new StubWeather() : new OpenMeteo(), getCache(), getStore());
  return g.weatherService;
}

/** Tests swap in a service with a stand-in API. */
export function setWeatherServiceForTests(svc: WeatherService | null | undefined) {
  g.weatherService = svc;
}
