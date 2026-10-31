import { dayRows, stayOn, tripDays } from "./derive";
import { addDays } from "./time";
import type { Item, Trip } from "./types";

/*
 * Weather for each day of the trip: where to ask about, what came back, and
 * how to say it. Pure, so the same rules run on the server (which asks
 * Open-Meteo) and in tests. Temperatures are stored in °C and converted only
 * for display.
 */

// ---------------------------------------------------------------------------
// Where each day's weather is for

export interface Spot {
  /** Shown with the weather: "San Marcos La Laguna". */
  label: string;
  lat?: number;
  lng?: number;
  /** Town names to look up when there are no coordinates, best first. */
  names: string[];
  /** Why this place: where you sleep, the day's first stop, the night before, or the trip's destination. */
  from: "stay" | "item" | "night-before" | "destination";
}

const located = (i: Item | null | undefined): i is Item & { place: { lat: number; lng: number } } =>
  typeof i?.place?.lat === "number" && typeof i.place.lng === "number";

/** Town-like names in a place, for Open-Meteo's geocoder (towns, not street addresses). */
export function townNames(item: Item, destination: string): string[] {
  const out: string[] = [];
  const dest = destination.split(",")[0].trim().toLowerCase();
  const name = item.place?.name?.split(",")[0].trim();
  if (name) out.push(name);
  // "2 calle oriente #22, Antigua Guatemala": the parts with no digits, last first.
  const parts = (item.place?.address ?? "").split(",").map((p) => p.trim()).filter((p) => p && !/\d/.test(p));
  out.push(...parts.reverse().slice(0, 2));
  return [...new Set(out)].filter((n) => n.length > 1 && n.toLowerCase() !== dest).slice(0, 3);
}

function fromItem(item: Item, from: Spot["from"], destination: string): Spot | null {
  const label = item.place?.name?.split(",")[0].trim() || item.title;
  if (located(item)) return { label, lat: item.place.lat, lng: item.place.lng, names: [], from };
  const names = townNames(item, destination);
  return names.length ? { label: names[0], names, from } : null;
}

/**
 * Where a day's weather is for: where you sleep that night, else the day's
 * first stop with coordinates, else (travel days, unplanned nights) where you
 * slept the night before, else the trip's destination.
 */
export function weatherSpot(trip: Trip, date: string): Spot {
  const stay = stayOn(trip, date);
  if (located(stay)) return fromItem(stay, "stay", trip.destination)!;
  const first = dayRows(trip, date).find((r) => r.part === "start" && !r.item.maybe && located(r.item));
  if (first) return fromItem(first.item, "item", trip.destination)!;
  const named = stay ? fromItem(stay, "stay", trip.destination) : null;
  if (named) return named;
  const before = addDays(date, -1);
  const lastNight = before >= trip.startDate ? stayOn(trip, before) : null;
  const morning = lastNight ? fromItem(lastNight, "night-before", trip.destination) : null;
  if (morning) return morning;
  return { label: trip.destination.split(",")[0].trim(), names: [trip.destination], from: "destination" };
}

export function weatherSpots(trip: Trip): Record<string, Spot> {
  return Object.fromEntries(tripDays(trip).map((d) => [d, weatherSpot(trip, d)]));
}

/** What the phone needs to know changed before asking again: the days and anything that moves a spot. */
export function weatherSignature(trip: Trip): string {
  return JSON.stringify([trip.destination, trip.tz, Object.entries(weatherSpots(trip)).map(([d, s]) => [d, s.lat, s.lng, s.names[0]])]);
}

// ---------------------------------------------------------------------------
// What comes back

export interface Forecast {
  kind: "forecast";
  /** WMO weather code. */
  code: number;
  hi: number;
  lo: number;
  /** Highest chance of rain in the day, 0–100, when the model gives one. */
  rain: number | null;
}

export interface Typical {
  kind: "typical";
  hi: number;
  lo: number;
  /** Share of days with at least 1 mm of rain, 0–1. */
  wet: number;
  season?: "rainy" | "dry";
}

export type DayWeather = (Forecast | Typical) & { place: string };

export interface WeatherReport {
  /** When the oldest forecast in it was fetched, epoch ms. */
  asOf: number;
  days: Record<string, DayWeather>;
  /** The years typical weather is averaged over: "2016–2025". */
  years?: string;
}

// ---------------------------------------------------------------------------
// Typical weather from past years

export interface Normals {
  /** Indexed by day of a non-leap year (0 = Jan 1), smoothed over ±7 days. */
  hi: number[];
  lo: number[];
  wet: number[];
  /** Share of wet days per calendar month. */
  monthWet: number[];
  years: string;
}

const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** 0–364; Feb 29 counts as Feb 28. */
export function dayOfYear(date: string): number {
  const m = Number(date.slice(5, 7)) - 1;
  const d = Math.min(Number(date.slice(8, 10)), m === 1 ? 28 : 31);
  return CUM[m] + d - 1;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Averages years of daily history into a typical value for every day of the year. */
export function normalsFrom(daily: { time: string[]; hi: (number | null)[]; lo: (number | null)[]; rain: (number | null)[] }, window = 7): Normals | null {
  const sums = Array.from({ length: 365 }, () => ({ hi: 0, nh: 0, lo: 0, nl: 0, wet: 0, nr: 0 }));
  const months = Array.from({ length: 12 }, () => ({ wet: 0, n: 0 }));
  daily.time.forEach((t, i) => {
    const s = sums[dayOfYear(t)];
    const [h, l, r] = [daily.hi[i], daily.lo[i], daily.rain[i]];
    if (typeof h === "number") {
      s.hi += h;
      s.nh++;
    }
    if (typeof l === "number") {
      s.lo += l;
      s.nl++;
    }
    if (typeof r === "number") {
      s.wet += r >= 1 ? 1 : 0;
      s.nr++;
      const m = months[Number(t.slice(5, 7)) - 1];
      m.wet += r >= 1 ? 1 : 0;
      m.n++;
    }
  });
  if (!sums.some((s) => s.nh && s.nl && s.nr)) return null;
  const smooth = (pick: (s: (typeof sums)[number]) => [number, number]) =>
    sums.map((_, d) => {
      let total = 0;
      let n = 0;
      for (let k = -window; k <= window; k++) {
        const [v, c] = pick(sums[(d + k + 365) % 365]);
        total += v;
        n += c;
      }
      return n ? total / n : NaN;
    });
  const years = [...new Set(daily.time.map((t) => t.slice(0, 4)))].sort();
  return {
    hi: smooth((s) => [s.hi, s.nh]).map(round1),
    lo: smooth((s) => [s.lo, s.nl]).map(round1),
    wet: smooth((s) => [s.wet, s.nr]).map((w) => Math.round(w * 100) / 100),
    monthWet: months.map((m) => (m.n ? Math.round((m.wet / m.n) * 100) / 100 : NaN)),
    years: years.length > 1 ? `${years[0]}–${years.at(-1)}` : (years[0] ?? ""),
  };
}

/**
 * "Rainy season" or "dry season", only where the year really has one: the
 * wettest and driest months differ by at least 3 rainy days in 10.
 */
export function seasonOf(n: Normals, date: string): Typical["season"] {
  const known = n.monthWet.filter((w) => Number.isFinite(w));
  if (known.length < 12) return undefined;
  const max = Math.max(...known);
  const min = Math.min(...known);
  if (max - min < 0.3) return undefined;
  return n.monthWet[Number(date.slice(5, 7)) - 1] >= (max + min) / 2 ? "rainy" : "dry";
}

export function typicalOn(n: Normals, date: string): Omit<Typical, "kind"> | null {
  const d = dayOfYear(date);
  const [hi, lo, wet] = [n.hi[d], n.lo[d], n.wet[d]];
  if (![hi, lo, wet].every(Number.isFinite)) return null;
  const season = seasonOf(n, date);
  return { hi, lo, wet, ...(season ? { season } : {}) };
}

// ---------------------------------------------------------------------------
// Saying it

export type TempUnit = "C" | "F";

export function toUnit(celsius: number, unit: TempUnit): number {
  return Math.round(unit === "F" ? (celsius * 9) / 5 + 32 : celsius);
}

/** "24°" in the chosen unit. */
export const temp = (celsius: number, unit: TempUnit) => `${toUnit(celsius, unit)}°`;

/** Home zones (and their neighbours) that read temperatures in Fahrenheit. */
const FAHRENHEIT_ZONE =
  /^(America\/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Menominee|Puerto_Rico|St_Thomas|Nassau|Cayman|Belize|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/(Honolulu|Guam|Saipan|Pago_Pago|Palau|Majuro|Kwajalein|Chuuk|Pohnpei|Kosrae)|Africa\/Monrovia|US\/.+)$/;

/** °F for a group from the US (and the few other places that use it), else °C. */
export function defaultTempUnit(trip: Pick<Trip, "homeTz" | "homeCurrency">): TempUnit {
  if (trip.homeTz) return FAHRENHEIT_ZONE.test(trip.homeTz) ? "F" : "C";
  return trip.homeCurrency === "USD" ? "F" : "C";
}

export type Sky = "sun" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

const CODES: [number[], string, Sky][] = [
  [[0], "Clear", "sun"],
  [[1], "Mostly clear", "sun"],
  [[2], "Partly cloudy", "partly"],
  [[3], "Cloudy", "cloud"],
  [[45, 48], "Fog", "fog"],
  [[51, 53, 55], "Drizzle", "drizzle"],
  [[56, 57], "Freezing drizzle", "drizzle"],
  [[61], "Light rain", "rain"],
  [[63], "Rain", "rain"],
  [[65], "Heavy rain", "rain"],
  [[66, 67], "Freezing rain", "rain"],
  [[71], "Light snow", "snow"],
  [[73], "Snow", "snow"],
  [[75], "Heavy snow", "snow"],
  [[77], "Snow grains", "snow"],
  [[80], "Light showers", "rain"],
  [[81], "Showers", "rain"],
  [[82], "Heavy showers", "rain"],
  [[85, 86], "Snow showers", "snow"],
  [[95], "Thunderstorms", "storm"],
  [[96, 99], "Thunderstorms with hail", "storm"],
];

export function describeSky(w: Forecast | Typical): { words: string; sky: Sky } {
  if (w.kind === "typical") return w.wet >= 0.5 ? { words: "Often rainy", sky: "rain" } : w.wet >= 0.2 ? { words: "Some rain", sky: "partly" } : { words: "Mostly dry", sky: "sun" };
  const hit = CODES.find(([codes]) => codes.includes(w.code));
  return hit ? { words: hit[1], sky: hit[2] } : { words: "Mixed", sky: "partly" };
}

/** "30% chance of rain", or for typical weather "rain on about 3 days in 10". */
export function rainWords(w: Forecast | Typical): string | null {
  if (w.kind === "forecast") return w.rain === null ? null : `${Math.round(w.rain)}% chance of rain`;
  const tenths = Math.round(w.wet * 10);
  if (tenths <= 0) return "rarely rains";
  if (tenths >= 10) return "rain most days";
  return `rain on about ${tenths} ${tenths === 1 ? "day" : "days"} in 10`;
}
