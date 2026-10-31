import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import type { Item, Trip } from "./types";
import { dayOfYear, defaultTempUnit, describeSky, normalsFrom, rainWords, seasonOf, temp, toUnit, townNames, typicalOn, weatherSpot, weatherSpots } from "./weather";

const base = (items: Item[], over: Partial<Trip> = {}): Trip => ({
  schema: 2,
  id: "t",
  name: "Test",
  destination: "Guatemala",
  startDate: "2026-11-24",
  endDate: "2026-11-28",
  tz: "America/Guatemala",
  currency: "GTQ",
  people: [],
  items,
  todos: [],
  ...over,
});

const stay = (id: string, from: string, to: string, place: Item["place"]): Item => ({ id, kind: "stay", title: id, start: { date: from }, end: { date: to }, place });

describe("which place a day's weather is for", () => {
  it("uses where you sleep that night when it has coordinates", () => {
    const trip = base([
      stay("lake", "2026-11-24", "2026-11-26", { name: "Casa Lago", lat: 14.72, lng: -91.27 }),
      { id: "hike", kind: "activity", title: "Hike", start: { date: "2026-11-25", time: "06:00" }, place: { name: "Volcán", lat: 14.5, lng: -90.88 } },
    ]);
    expect(weatherSpot(trip, "2026-11-25")).toMatchObject({ from: "stay", lat: 14.72, lng: -91.27, label: "Casa Lago" });
  });

  it("falls back to the day's first stop with coordinates when the stay has none", () => {
    const trip = base([
      stay("hotel", "2026-11-24", "2026-11-26", { name: "Hotel Something" }),
      { id: "late", kind: "food", title: "Dinner", start: { date: "2026-11-25", time: "19:00" }, place: { name: "Late", lat: 1, lng: 1 } },
      { id: "early", kind: "activity", title: "Market", start: { date: "2026-11-25", time: "08:00" }, place: { name: "Chichi market", lat: 14.94, lng: -91.11 } },
      { id: "unplaced", kind: "activity", title: "Walk", start: { date: "2026-11-25", time: "07:00" }, place: { name: "Somewhere" } },
    ]);
    expect(weatherSpot(trip, "2026-11-25")).toMatchObject({ from: "item", lat: 14.94, label: "Chichi market" });
  });

  it("looks up the stay's town by name when nothing that day has coordinates", () => {
    const trip = base([stay("airbnb", "2026-11-25", "2026-11-26", { name: "San Marcos La Laguna, Lake Atitlán", address: "Barrio 2, San Marcos La Laguna, Sololá" })]);
    const spot = weatherSpot(trip, "2026-11-25");
    expect(spot).toMatchObject({ from: "stay", label: "San Marcos La Laguna" });
    expect(spot.names).toEqual(["San Marcos La Laguna", "Sololá"]);
  });

  it("uses last night's place on a day with nowhere to sleep (the day you travel home), then the destination", () => {
    const trip = base([stay("antigua", "2026-11-26", "2026-11-28", { name: "Antigua Guatemala", lat: 14.56, lng: -90.73 })]);
    expect(weatherSpot(trip, "2026-11-28")).toMatchObject({ from: "night-before", lat: 14.56 });
    expect(weatherSpot(trip, "2026-11-24")).toEqual({ label: "Guatemala", names: ["Guatemala"], from: "destination" });
  });

  it("ignores maybe stays and gives every trip day a spot", () => {
    const trip = base([{ ...stay("maybe", "2026-11-24", "2026-11-25", { name: "Maybe", lat: 1, lng: 1 }), maybe: true }]);
    expect(weatherSpot(trip, "2026-11-24").from).toBe("destination");
    expect(Object.keys(weatherSpots(trip))).toEqual(["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
  });

  it("reads town names out of addresses, not streets or the country", () => {
    const item = (place: Item["place"]): Item => ({ id: "x", kind: "stay", title: "x", place });
    expect(townNames(item({ name: "Meeting point", address: "2 calle oriente #22, Antigua Guatemala" }), "Guatemala")).toEqual(["Meeting point", "Antigua Guatemala"]);
    expect(townNames(item({ address: "Calle 5, Panajachel, Guatemala" }), "Guatemala")).toEqual(["Panajachel"]);
  });

  it("works on the Guatemala trip as stored", () => {
    const trip = seedTrip();
    const spots = weatherSpots(trip);
    expect(spots[trip.startDate]).toBeDefined();
    expect(Object.values(spots).some((s) => s.names.includes("San Marcos La Laguna"))).toBe(true);
  });
});

describe("temperatures", () => {
  it("converts Celsius for display, rounded", () => {
    expect(toUnit(0, "F")).toBe(32);
    expect(toUnit(100, "F")).toBe(212);
    expect(toUnit(-40, "F")).toBe(-40);
    expect(toUnit(24, "F")).toBe(75);
    expect(toUnit(12, "F")).toBe(54);
    expect(toUnit(23.6, "C")).toBe(24);
    expect(temp(23.4, "C")).toBe("23°");
  });

  it("defaults to the group's home: °F from US zones, °C elsewhere", () => {
    expect(defaultTempUnit({ homeTz: "America/Los_Angeles" })).toBe("F");
    expect(defaultTempUnit({ homeTz: "America/Indiana/Indianapolis" })).toBe("F");
    expect(defaultTempUnit({ homeTz: "Europe/London", homeCurrency: "USD" })).toBe("C");
    expect(defaultTempUnit({ homeTz: "America/Mexico_City" })).toBe("C");
    expect(defaultTempUnit({ homeCurrency: "USD" })).toBe("F");
    expect(defaultTempUnit({})).toBe("C");
  });
});

describe("typical weather", () => {
  /** Ten years where May–October rains every day and the rest of the year never does. */
  function history() {
    const time: string[] = [];
    for (let y = 2016; y <= 2025; y++) for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) time.push(d.toISOString().slice(0, 10));
    const m = (t: string) => Number(t.slice(5, 7));
    return { time, hi: time.map((t) => (m(t) === 7 ? 30 : 24)), lo: time.map(() => 12), rain: time.map((t) => (m(t) >= 5 && m(t) <= 10 ? 5 : 0)) };
  }

  it("averages past years per day of the year and names the season", () => {
    const n = normalsFrom(history())!;
    expect(n.years).toBe("2016–2025");
    expect(typicalOn(n, "2026-11-24")).toEqual({ hi: 24, lo: 12, wet: 0, season: "dry" });
    expect(typicalOn(n, "2026-08-15")).toEqual({ hi: 24, lo: 12, wet: 1, season: "rainy" });
    // Smoothed across the edge of a month.
    expect(typicalOn(n, "2026-05-01")!.wet).toBeCloseTo(8 / 15, 2);
    expect(typicalOn(n, "2026-07-15")!.hi).toBe(30);
  });

  it("only says rainy or dry season where the year really has one", () => {
    const h = history();
    const flat = normalsFrom({ ...h, rain: h.time.map((t) => (Number(t.slice(8, 10)) % 3 === 0 ? 2 : 0)) })!;
    expect(seasonOf(flat, "2026-08-01")).toBeUndefined();
    expect(typicalOn(flat, "2026-08-01")).not.toHaveProperty("season");
  });

  it("handles leap days and empty history", () => {
    expect(dayOfYear("2028-02-29")).toBe(dayOfYear("2028-02-28"));
    expect(dayOfYear("2026-12-31")).toBe(364);
    expect(normalsFrom({ time: [], hi: [], lo: [], rain: [] })).toBeNull();
  });
});

describe("weather in words", () => {
  it("says what the sky does, not just an icon", () => {
    expect(describeSky({ kind: "forecast", code: 2, hi: 20, lo: 10, rain: 30 })).toEqual({ words: "Partly cloudy", sky: "partly" });
    expect(describeSky({ kind: "forecast", code: 95, hi: 20, lo: 10, rain: 80 }).words).toBe("Thunderstorms");
    expect(describeSky({ kind: "forecast", code: 42, hi: 20, lo: 10, rain: null }).words).toBe("Mixed");
    expect(describeSky({ kind: "typical", hi: 20, lo: 10, wet: 0.7 }).words).toBe("Often rainy");
  });

  it("gives rain as a chance, or how often it usually rains", () => {
    expect(rainWords({ kind: "forecast", code: 61, hi: 20, lo: 10, rain: 64.6 })).toBe("65% chance of rain");
    expect(rainWords({ kind: "forecast", code: 0, hi: 20, lo: 10, rain: null })).toBeNull();
    expect(rainWords({ kind: "typical", hi: 20, lo: 10, wet: 0.3 })).toBe("rain on about 3 days in 10");
    expect(rainWords({ kind: "typical", hi: 20, lo: 10, wet: 0.08 })).toBe("rain on about 1 day in 10");
    expect(rainWords({ kind: "typical", hi: 20, lo: 10, wet: 0.02 })).toBe("rarely rains");
    expect(rainWords({ kind: "typical", hi: 20, lo: 10, wet: 0.97 })).toBe("rain most days");
  });
});
