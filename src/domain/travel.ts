import { dayRows, stayOn, tripDays, type Row } from "./derive";
import { addDays, formatTime, instantOf, localParts } from "./time";
import type { Item, Place, Trip } from "./types";

/*
 * Getting from one thing to the next on a day: which stops are worth a
 * "25 min drive · leave by 8:35" line between them, and whether the gap is
 * tight. Road times come from the server (src/server/routing.ts) and are kept
 * on the phone; without one, a straight-line guess is shown and says so.
 */

export type TravelMode = "drive" | "walk";

export interface Point {
  lat: number;
  lng: number;
}

/** A road route: seconds and metres. */
export interface Route {
  s: number;
  m: number;
}

/** Closer than this, as the crow flies, and you walk. */
export const WALK_MAX_M = 1500;
/** Closer than this and it's the same place: no line. */
export const SAME_PLACE_M = 100;
/** Less spare time than this, after the trip there, and the gap is tight. */
export const TIGHT_SLACK_MIN = 10;

export function pointOf(place: Place | undefined): Point | null {
  const lat = place?.lat;
  const lng = place?.lng;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Metres between two points as the crow flies. */
export function straightLineM(a: Point, b: Point): number {
  const r = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const modeFor = (a: Point, b: Point): TravelMode => (straightLineM(a, b) < WALK_MAX_M ? "walk" : "drive");

/** About 11 m: close enough that two pins on the same door share a route. */
const round4 = (n: number) => (Math.round(n * 1e4) / 1e4).toFixed(4);

/** The cache key for a route, here and on the server. */
export function routeKey(from: Point, to: Point, mode: TravelMode): string {
  return `${mode}:${round4(from.lat)},${round4(from.lng)};${round4(to.lat)},${round4(to.lng)}`;
}

/** The points a route key stands for, rounded the same way. */
export function routePoints(key: string): { mode: TravelMode; from: Point; to: Point } | null {
  const m = /^(drive|walk):(-?\d+\.\d{4}),(-?\d+\.\d{4});(-?\d+\.\d{4}),(-?\d+\.\d{4})$/.exec(key);
  if (!m) return null;
  return { mode: m[1] as TravelMode, from: { lat: +m[2], lng: +m[3] }, to: { lat: +m[4], lng: +m[5] } };
}

/**
 * A guess with no road data: the straight line stretched for winding roads,
 * at highland-road speeds (Antigua to Panajachel is about 80 km in 2.5 hours).
 */
const GUESS = { drive: { detour: 1.4, kmh: 35 }, walk: { detour: 1.25, kmh: 4.5 } } as const;

export function estimateRoute(from: Point, to: Point, mode: TravelMode): Route {
  const m = straightLineM(from, to) * GUESS[mode].detour;
  return { m: Math.round(m), s: Math.round(m / ((GUESS[mode].kmh * 1000) / 3600)) };
}

// ---------------------------------------------------------------------------
// Legs on a day

export interface Leg {
  /** The route's cache key. */
  key: string;
  /** The row this leg arrives at. */
  toKey: string;
  /** The row it leaves from; null when it leaves from where you slept. */
  fromKey: string | null;
  from: Item;
  to: Item;
  fromPoint: Point;
  toPoint: Point;
  mode: TravelMode;
  /** When you can set off, epoch ms: when the last thing ends, or starts if its end isn't known. */
  freeAt: number | null;
  /** When you need to be there, epoch ms. */
  dueAt: number | null;
  /** The zone to say the leave-by time in. */
  tz: string;
}

const isCheckIn = (r: Row) => r.part === "start" && r.item.kind === "stay";
const isCheckOut = (r: Row) => r.part === "end" && r.item.kind === "stay";

/**
 * Whether the day's order says `a` really comes right before `b`. Timed rows
 * are in time order; untimed ones are listed after them (checkouts, then the
 * rest by title, then check-ins), so among those only "then to bed" is known.
 */
function inOrder(a: Row, b: Row, anyTimed: boolean): boolean {
  if (a.at !== null && b.at !== null) return true;
  if (!isCheckIn(b) || b.at !== null) return false;
  if (a.at !== null) return true;
  // Moving day with no times at all: check out, then check in.
  return !anyTimed && isCheckOut(a);
}

/**
 * Whether a line between the two makes sense. Flights are their own thing.
 * A shuttle or boat carries you, and its place is usually the pickup, so
 * nothing is drawn out of it (getting to the pickup is).
 */
function travelBetween(a: Row, b: Row): boolean {
  if (a.item.kind === "flight" || b.item.kind === "flight") return false;
  if (a.item.kind === "transport") return false;
  if (b.item.kind === "transport" && b.part === "end") return false;
  return a.item.id !== b.item.id;
}

/** When you're free to leave a row: an activity's end the same day, else the row's own time. */
function freeAt(r: Row, tz: string): number | null {
  const end = r.item.end;
  if (r.part === "start" && r.item.kind !== "stay" && end?.time && end.date === r.when.date) return instantOf(end, tz);
  return r.at;
}

function legFor(from: Item, to: Row, fromRow: Row | null, trip: Trip): Leg | null {
  const a = pointOf(from.place);
  const b = pointOf(to.item.place);
  if (!a || !b || straightLineM(a, b) < SAME_PLACE_M) return null;
  const mode = modeFor(a, b);
  return {
    key: routeKey(a, b, mode),
    toKey: to.key,
    fromKey: fromRow?.key ?? null,
    from,
    to: to.item,
    fromPoint: a,
    toPoint: b,
    mode,
    freeAt: fromRow ? freeAt(fromRow, trip.tz) : null,
    dueAt: to.at,
    tz: to.when.tz ?? trip.tz,
  };
}

/**
 * The legs between a day's stops, in order. The first timed stop also gets
 * one from where you slept, unless it's that stay's own checkout.
 */
export function dayLegs(trip: Trip, date: string): Leg[] {
  const rows = dayRows(trip, date);
  const anyTimed = rows.some((r) => r.at !== null);
  const out: Leg[] = [];
  const first = rows[0];
  const bed = stayOn(trip, addDays(date, -1));
  if (first && first.at !== null && bed && bed.kind === "stay" && bed.id !== first.item.id && first.item.kind !== "flight") {
    const leg = legFor(bed, first, null, trip);
    if (leg) out.push(leg);
  }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (!inOrder(a, b, anyTimed) || !travelBetween(a, b)) continue;
    const leg = legFor(a.item, b, a, trip);
    if (leg) out.push(leg);
  }
  return out;
}

/** Every leg on the trip, for fetching routes ahead of going offline. */
export function tripLegs(trip: Trip): Leg[] {
  return tripDays(trip).flatMap((d) => dayLegs(trip, d));
}

/** The route keys a trip needs, each once, sorted. */
export function routeKeys(trip: Trip): string[] {
  return [...new Set(tripLegs(trip).map((l) => l.key))].sort();
}

/** The leg that arrives at an item's start, if there is one. */
export function legInto(trip: Trip, item: Item): Leg | null {
  if (!item.start) return null;
  return dayLegs(trip, item.start.date).find((l) => l.toKey === `${item.id}:start`) ?? null;
}

// ---------------------------------------------------------------------------
// In words

export interface LegInfo {
  mode: TravelMode;
  /** Rounded minutes on the road. */
  minutes: number;
  metres: number;
  /** True when it's the straight-line guess, not a road route. */
  estimate: boolean;
  /** "About 25 min drive · 12 km" */
  summary: string;
  /** "8:35 AM", when the next stop has a time. */
  leaveBy: string | null;
  /** Set when there isn't enough time between the two. */
  tight: { travel: number; gap: number } | null;
  /** "Tight: 40 min drive, 30 min gap" */
  tightText: string | null;
}

/** Short trips to the minute, longer ones to five. */
export function roundMinutes(seconds: number): number {
  const m = seconds / 60;
  return m < 10 ? Math.max(1, Math.ceil(m)) : Math.round(m / 5) * 5;
}

/** "25 min", "1 hr", "2 hr 10 min". */
export function formatMinutes(minutes: number): string {
  const n = Math.max(0, Math.round(minutes));
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "350 m", "2.4 km", "12 km". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(50, Math.round(metres / 50) * 50)} m`;
  if (metres < 10_000) return `${(Math.round(metres / 100) / 10).toFixed(1).replace(/\.0$/, "")} km`;
  return `${Math.round(metres / 1000)} km`;
}

const FIVE_MIN = 5 * 60_000;

/**
 * What to say about a leg. `route` is the road route, null when the router
 * found no road between them (nothing is shown), or undefined when there
 * isn't one yet (the straight-line guess is used, marked as an estimate).
 */
export function describeLeg(leg: Leg, route: Route | null | undefined): LegInfo | null {
  if (route === null) return null;
  const estimate = route === undefined;
  const r = route ?? estimateRoute(leg.fromPoint, leg.toPoint, leg.mode);
  const minutes = roundMinutes(r.s);
  const verb = leg.mode === "walk" ? "walk" : "drive";
  const summary = `About ${formatMinutes(minutes)} ${verb} · ${formatDistance(r.m)}`;
  let leaveBy: string | null = null;
  if (leg.dueAt !== null) {
    const leave = Math.floor((leg.dueAt - r.s * 1000) / FIVE_MIN) * FIVE_MIN;
    leaveBy = formatTime(localParts(leave, leg.tz).time);
  }
  let tight: LegInfo["tight"] = null;
  if (leg.dueAt !== null && leg.freeAt !== null) {
    const gap = Math.round((leg.dueAt - leg.freeAt) / 60_000);
    if (gap - r.s / 60 < TIGHT_SLACK_MIN) tight = { travel: minutes, gap };
  }
  const tightText = tight ? `Tight: ${formatMinutes(tight.travel)} ${verb}, ${tight.gap > 0 ? `${formatMinutes(tight.gap)} gap` : "no time between"}` : null;
  return { mode: leg.mode, minutes, metres: r.m, estimate, summary, leaveBy, tight, tightText };
}
