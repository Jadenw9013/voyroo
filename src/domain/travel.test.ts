import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import {
  dayLegs,
  describeLeg,
  estimateRoute,
  formatDistance,
  formatMinutes,
  legInto,
  modeFor,
  roundMinutes,
  routeKey,
  routeKeys,
  routePoints,
  straightLineM,
  type Leg,
} from "./travel";
import type { Item, Trip } from "./types";

// Antigua and around, roughly.
const HOTEL = { lat: 14.5586, lng: -90.7295 };
const CAFE = { lat: 14.5601, lng: -90.7328 }; // ~400 m from the hotel
const HOBBITENANGO = { lat: 14.5432, lng: -90.696 }; // ~4 km
const MUSEUM = { lat: 14.5655, lng: -90.7368 }; // ~1.1 km
const DINNER = { lat: 14.5559, lng: -90.734 }; // ~580 m
const PANA = { lat: 14.7409, lng: -91.1557 };
const GUA = { lat: 14.5833, lng: -90.5275 };

const at = (p: { lat: number; lng: number }, name = "somewhere") => ({ name, ...p });

function trip(items: Item[]): Trip {
  return {
    schema: 2,
    id: "test",
    name: "Test",
    destination: "Guatemala",
    startDate: "2026-11-24",
    endDate: "2026-11-28",
    tz: "America/Guatemala",
    currency: "GTQ",
    people: ["Sam"],
    items,
    todos: [],
  };
}

const hotel: Item = { id: "hotel", kind: "stay", title: "Casa Antigua", start: { date: "2026-11-24" }, end: { date: "2026-11-27", time: "11:00" }, place: at(HOTEL) };
const base: Item[] = [
  hotel,
  { id: "dinner", kind: "food", title: "Arrival dinner", start: { date: "2026-11-24", time: "20:00" }, place: at(DINNER) },
  { id: "breakfast", kind: "food", title: "Breakfast", start: { date: "2026-11-25", time: "08:00" }, end: { date: "2026-11-25", time: "08:45" }, place: at(CAFE) },
  { id: "tour", kind: "activity", title: "Hobbitenango", start: { date: "2026-11-25", time: "09:00" }, end: { date: "2026-11-25", time: "12:00" }, place: at(HOBBITENANGO) },
  { id: "lunch", kind: "food", title: "Lunch somewhere", start: { date: "2026-11-25", time: "13:00" }, place: { name: "TBD" } },
  { id: "late", kind: "activity", title: "Rooftop", start: { date: "2026-11-25", time: "18:00" }, place: at(MUSEUM) },
  { id: "shuttle", kind: "transport", title: "Shuttle to the lake", start: { date: "2026-11-26", time: "07:00" }, place: at(HOTEL, "Hotel door") },
  { id: "pana", kind: "activity", title: "Walk in Panajachel", start: { date: "2026-11-26", time: "11:00" }, place: at(PANA) },
  { id: "museum", kind: "activity", title: "Jade museum", start: { date: "2026-11-27", time: "12:00" }, place: at(MUSEUM) },
  { id: "flight", kind: "flight", title: "GUA to SEA", start: { date: "2026-11-27", time: "18:00" }, end: { date: "2026-11-27", time: "23:00", tz: "America/Los_Angeles" }, place: at(GUA) },
];

const between = (legs: Leg[]) => legs.map((l) => `${l.fromKey ?? `bed:${l.from.id}`} > ${l.toKey}`);

describe("legs between a day's stops", () => {
  const t = trip(base);

  it("links timed stops in order and starts the day from where you slept", () => {
    expect(between(dayLegs(t, "2026-11-25"))).toEqual(["bed:hotel > breakfast:start", "breakfast:start > tour:start"]);
  });

  it("draws nothing to or from a stop with no coordinates", () => {
    const legs = dayLegs(t, "2026-11-25");
    expect(legs.some((l) => l.from.id === "lunch" || l.to.id === "lunch")).toBe(false);
    expect(legs.some((l) => l.to.id === "late")).toBe(false);
  });

  it("walks short hops and drives longer ones", () => {
    const [toBreakfast, toTour] = dayLegs(t, "2026-11-25");
    expect(toBreakfast.mode).toBe("walk");
    expect(toTour.mode).toBe("drive");
    expect(modeFor(HOTEL, CAFE)).toBe("walk");
    expect(modeFor(HOTEL, HOBBITENANGO)).toBe("drive");
  });

  it("heads to an untimed check-in after the last timed thing", () => {
    expect(between(dayLegs(t, "2026-11-24"))).toEqual(["dinner:start > hotel:start"]);
    const [leg] = dayLegs(t, "2026-11-24");
    expect(leg.dueAt).toBeNull();
    expect(describeLeg(leg, { s: 480, m: 700 })).toMatchObject({ leaveBy: null, tight: null, summary: "About 8 min walk · 700 m" });
  });

  it("draws nothing out of a shuttle, and nothing to the same place", () => {
    // The shuttle leaves from the hotel door (same place as the bed), and it carries you to Panajachel.
    expect(dayLegs(t, "2026-11-26")).toEqual([]);
  });

  it("starts from the checkout when it's the first thing, and skips flights", () => {
    expect(between(dayLegs(t, "2026-11-27"))).toEqual(["hotel:end > museum:start"]);
  });

  it("goes to a shuttle's pickup", () => {
    const withCafe = trip([...base, { id: "coffee", kind: "food", title: "Coffee", start: { date: "2026-11-26", time: "06:15" }, place: at(CAFE) }]);
    expect(between(dayLegs(withCafe, "2026-11-26"))).toEqual(["bed:hotel > coffee:start", "coffee:start > shuttle:start"]);
  });

  it("only links untimed rows whose order is known", () => {
    const a: Item = { id: "a", kind: "stay", title: "First stay", start: { date: "2026-11-24" }, end: { date: "2026-11-26" }, place: at(HOTEL) };
    const b: Item = { id: "b", kind: "stay", title: "Second stay", start: { date: "2026-11-26" }, end: { date: "2026-11-28" }, place: at(PANA) };
    const idea: Item = { id: "c", kind: "activity", title: "Anytime market", start: { date: "2026-11-26" }, place: at(CAFE) };
    // Moving day, nothing timed: check out, check in.
    expect(between(dayLegs(trip([a, b]), "2026-11-26"))).toEqual(["a:end > b:start"]);
    // Something untimed in between: no idea when it happens, so no lines.
    expect(between(dayLegs(trip([a, b, idea]), "2026-11-26"))).toEqual([]);
    // A timed thing too: the untimed checkout really happened before it, so no checkout-to-check-in line,
    // and the checkout is listed between it and the check-in, so no line from it either.
    const timed: Item = { id: "d", kind: "activity", title: "Museum", start: { date: "2026-11-26", time: "12:00" }, place: at(MUSEUM) };
    expect(between(dayLegs(trip([a, b, timed]), "2026-11-26"))).toEqual(["bed:a > d:start"]);
  });

  it("finds the leg into an item for its page", () => {
    expect(legInto(t, t.items.find((i) => i.id === "tour")!)?.from.id).toBe("breakfast");
    expect(legInto(t, t.items.find((i) => i.id === "breakfast")!)?.fromKey).toBeNull();
    expect(legInto(t, t.items.find((i) => i.id === "lunch")!)).toBeNull();
    expect(legInto(t, { id: "x", kind: "other", title: "Idea" })).toBeNull();
  });

  it("lists each route the trip needs once", () => {
    const keys = routeKeys(t);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(routeKey(CAFE, HOBBITENANGO, "drive"));
  });

  it("has nothing to draw for the seed trip until places have coordinates", () => {
    expect(routeKeys(seedTrip())).toEqual([]);
  });
});

describe("how a leg reads", () => {
  const t = trip(base);
  const toTour = dayLegs(t, "2026-11-25")[1];

  it("says how long, how far, and when to leave", () => {
    const info = describeLeg(toTour, { s: 25 * 60, m: 12_000 })!;
    expect(info).toMatchObject({ mode: "drive", minutes: 25, estimate: false, summary: "About 25 min drive · 12 km", leaveBy: "8:35 AM" });
  });

  it("flags a gap shorter than the trip, in words", () => {
    // Breakfast ends 8:45, the tour starts 9:00: 15 minutes for a 25 minute drive.
    const info = describeLeg(toTour, { s: 25 * 60, m: 12_000 })!;
    expect(info.tight).toEqual({ travel: 25, gap: 15 });
    expect(info.tightText).toBe("Tight: 25 min drive, 15 min gap");
  });

  it("flags a gap with less than ten minutes to spare, and not one with more", () => {
    expect(describeLeg(toTour, { s: 6 * 60, m: 3000 })!.tight).toEqual({ travel: 6, gap: 15 });
    expect(describeLeg(toTour, { s: 4 * 60, m: 3000 })!.tight).toBeNull();
  });

  it("says when there's no time at all", () => {
    const overlap = trip(base.map((i) => (i.id === "breakfast" ? { ...i, end: { date: "2026-11-25", time: "09:30" } } : i)));
    expect(describeLeg(dayLegs(overlap, "2026-11-25")[1], { s: 600, m: 5000 })!.tightText).toBe("Tight: 10 min drive, no time between");
  });

  it("uses the start when the end isn't known", () => {
    const open = trip(base.map((i) => (i.id === "breakfast" ? { ...i, end: null } : i)));
    expect(describeLeg(dayLegs(open, "2026-11-25")[1], { s: 25 * 60, m: 12_000 })!.tight).toBeNull();
    expect(dayLegs(open, "2026-11-25")[1].freeAt).toBe(Date.parse("2026-11-25T08:00:00-06:00"));
  });

  it("never checks the gap from where you slept", () => {
    const fromBed = dayLegs(t, "2026-11-25")[0];
    expect(fromBed.freeAt).toBeNull();
    expect(describeLeg(fromBed, { s: 300, m: 450 })).toMatchObject({ tight: null, leaveBy: "7:55 AM", summary: "About 5 min walk · 450 m" });
  });

  it("says the leave-by time where the next stop is", () => {
    const la: Item = { id: "la", kind: "activity", title: "LA thing", start: { date: "2026-11-25", time: "09:00", tz: "America/Los_Angeles" }, place: at(HOBBITENANGO) };
    const t2 = trip([...base.filter((i) => i.id !== "tour"), la]);
    const leg = dayLegs(t2, "2026-11-25").find((l) => l.to.id === "la")!;
    expect(describeLeg(leg, { s: 30 * 60, m: 12_000 })!.leaveBy).toBe("8:30 AM");
  });

  it("shows nothing when there's no road between them", () => {
    expect(describeLeg(toTour, null)).toBeNull();
  });

  it("falls back to a straight-line guess, marked as one", () => {
    const info = describeLeg(toTour, undefined)!;
    const guess = estimateRoute(CAFE, HOBBITENANGO, "drive");
    expect(info.estimate).toBe(true);
    expect(guess.m).toBeGreaterThan(straightLineM(CAFE, HOBBITENANGO));
    expect(info.minutes).toBe(roundMinutes(guess.s));
  });
});

describe("travel words and keys", () => {
  it("rounds minutes like people do", () => {
    expect(roundMinutes(20)).toBe(1);
    expect(roundMinutes(7 * 60 + 10)).toBe(8);
    expect(roundMinutes(23 * 60)).toBe(25);
    expect(roundMinutes(81 * 60)).toBe(80);
    expect(formatMinutes(25)).toBe("25 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(130)).toBe("2 hr 10 min");
  });

  it("formats distances", () => {
    expect(formatDistance(12)).toBe("50 m");
    expect(formatDistance(780)).toBe("800 m");
    expect(formatDistance(2440)).toBe("2.4 km");
    expect(formatDistance(3000)).toBe("3 km");
    expect(formatDistance(12_345)).toBe("12 km");
  });

  it("round-trips route keys at about 11 m", () => {
    const key = routeKey({ lat: 14.558612, lng: -90.729481 }, PANA, "drive");
    expect(key).toBe("drive:14.5586,-90.7295;14.7409,-91.1557");
    expect(routePoints(key)).toEqual({ mode: "drive", from: { lat: 14.5586, lng: -90.7295 }, to: PANA });
    expect(routePoints("fly:1,2;3,4")).toBeNull();
  });
});
