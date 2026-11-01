import { dayRows, stayOn, tripDays } from "./derive";
import { hostOf } from "./links";
import type { Item, Place, Trip, When } from "./types";

/*
 * Where things are, for the trip map. Coordinates come from a person (a pin
 * dropped on the map, or a pasted Google Maps link that carries them) or from
 * the geocoder on the server, never from the assistant's own text.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** About a metre: enough for a pin, and keeps the stored numbers short. */
export const roundCoord = (n: number) => Math.round(n * 1e5) / 1e5;

export function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

const at = (lat: string | number, lng: string | number): LatLng | null => {
  const a = Number(lat);
  const b = Number(lng);
  return validLatLng(a, b) ? { lat: roundCoord(a), lng: roundCoord(b) } : null;
};

export const hasCoords = (place: Place | undefined): place is Place & LatLng => typeof place?.lat === "number" && typeof place?.lng === "number";

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
/** "14.55,-90.73", "loc:14.55, -90.73" (a + in a query reads as a space). */
const PAIR = new RegExp(String.raw`^\s*(?:loc:)?\s*${NUM}\s*,\s*${NUM}\s*$`);
/** The place's own pin, from a Maps "data" segment: !3d14.55!4d-90.73. */
const PIN = new RegExp(String.raw`!3d${NUM}!4d${NUM}`);
/** Where the view was centred: /@14.55,-90.73,15z. Close to the place, but only the view. */
const VIEW = new RegExp(String.raw`/@${NUM},${NUM}`);
/** /maps/search/14.55,+-90.73 or /maps/place/14.55,-90.73. */
const PATH = new RegExp(String.raw`/maps/(?:search|place)/${NUM},\s*\+?${NUM}`);

const isGoogle = (host: string) => /(^|\.)google\.[a-z.]+$/.test(host);

/** A Maps link that has to be followed before it says where it goes. */
export function isShortMapsLink(url: string): boolean {
  const host = hostOf(url);
  if (/(^|\.)maps\.app\.goo\.gl$/.test(host)) return true;
  try {
    return host === "goo.gl" && new URL(url).pathname.startsWith("/maps");
  } catch {
    return false;
  }
}

/**
 * The coordinates a Google or Apple Maps link carries, if it carries any.
 * The place's own pin wins over a coordinate query, which wins over where
 * the view happened to be centred.
 */
export function coordsFromMapsUrl(raw: string): LatLng | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (/(^|\.)consent\.google\.[a-z.]+$/.test(host)) {
    const next = u.searchParams.get("continue");
    return next ? coordsFromMapsUrl(next) : null;
  }
  if (host === "maps.apple.com") {
    for (const key of ["coordinate", "ll", "q", "daddr", "sll"]) {
      const m = PAIR.exec(u.searchParams.get(key) ?? "");
      if (m) return at(m[1], m[2]);
    }
    return null;
  }
  if (!isGoogle(host)) return null;
  if (!host.startsWith("maps.") && !u.pathname.startsWith("/maps")) return null;
  let path = u.pathname;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    // Keep the raw path.
  }
  const pin = PIN.exec(path) ?? PIN.exec(u.search);
  if (pin) return at(pin[1], pin[2]);
  for (const key of ["q", "query", "ll", "destination", "daddr", "center", "sll"]) {
    const m = PAIR.exec(u.searchParams.get(key) ?? "");
    if (m) return at(m[1], m[2]);
  }
  const p = PATH.exec(path);
  if (p) return at(p[1], p[2]);
  const view = VIEW.exec(path);
  return view ? at(view[1], view[2]) : null;
}

// ---------------------------------------------------------------------------
// What to ask the geocoder

/** Names that say nothing about where: no lookup is better than a wrong pin. */
const VAGUE = /^(meeting point|meet(ing)? spot|tbd|tba|tbc|unknown|n\/?a|none|somewhere|hotel|the hotel|our hotel|airbnb|home|airport|here|there|various|multiple)$/i;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function tidy(s: string): string {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

/** "TBD", "?", or a choice ("airport hotel or Antigua"): nothing to look up. */
function undecided(s: string): boolean {
  return !s || VAGUE.test(s) || /\btb[dac]\b|\?/i.test(s) || /\s(or|and\/or)\s/i.test(s);
}

/** Adds where the trip is, so "Antigua" isn't the Caribbean island. */
function within(s: string, destination: string | undefined): string {
  if (!destination) return s;
  const words = fold(destination).split(/[\s,]+/).filter((w) => w.length > 3);
  const have = fold(s);
  return words.length && words.every((w) => have.includes(w)) ? s : `${s}, ${destination}`;
}

/**
 * Free-text searches to try, best first: the address, then the name, then
 * shorter forms of each. At most three, so one place costs at most three
 * lookups.
 */
export function geocodeQueries(place: Place | undefined, destination?: string): string[] {
  if (!place) return [];
  const out: string[] = [];
  const add = (s: string | undefined) => {
    const t = s && tidy(s);
    if (t && t.length >= 3 && !undecided(t)) out.push(within(t, destination));
  };
  const address = place.address ? tidy(place.address) : "";
  const name = place.name ? tidy(place.name) : "";
  if (address && !undecided(address)) {
    add(address);
    add(address.replace(/#\s*\d+\w*/g, "").replace(/\s+,/g, ","));
  }
  if (name && !undecided(name)) {
    add(name);
    if (name.includes(",")) add(name.split(",")[0]);
  }
  // Last resort for an address nothing matched: its town, the last part.
  if (address.includes(",") && !undecided(address)) add(address.split(",").at(-1));
  const seen = new Set<string>();
  return out.filter((q) => !seen.has(fold(q)) && seen.add(fold(q))).slice(0, 3);
}

/** True when there is something to place: a name, an address or a Maps link. */
export function locatable(item: Item): boolean {
  if (hasCoords(item.place)) return false;
  const p = item.place;
  if (p?.mapsUrl || item.links?.some((l) => l.kind === "maps")) return true;
  return geocodeQueries(p).length > 0;
}

// ---------------------------------------------------------------------------
// Stops: what goes on the map, in order

export type StopPart = "start" | "end" | "night" | "idea";

export interface Stop {
  item: Item;
  /** Which moment this is: a start, a checkout or landing, tonight's bed, or an idea with no day. */
  part: StopPart;
  when: When | null;
}

/**
 * The stops to show. For a day: everything on it in day order, then where
 * you sleep that night if it isn't already there. For the whole trip: each
 * item once, where it starts, day by day; ideas last.
 */
export function stopsFor(trip: Trip, day?: string): Stop[] {
  if (day) {
    const seen = new Set<string>();
    const out: Stop[] = [];
    for (const r of dayRows(trip, day)) {
      if (seen.has(r.item.id)) continue;
      seen.add(r.item.id);
      out.push({ item: r.item, part: r.part, when: r.when });
    }
    const bed = stayOn(trip, day);
    if (bed && !seen.has(bed.id)) out.push({ item: bed, part: "night", when: null });
    return out;
  }
  const out: Stop[] = [];
  for (const d of tripDays(trip)) {
    for (const r of dayRows(trip, d)) if (r.part === "start") out.push({ item: r.item, part: "start", when: r.when });
  }
  for (const i of trip.items) if (!i.start) out.push({ item: i, part: "idea", when: null });
  return out;
}

/** Stops that can't go on the map yet, worth asking about: dated ones, and ideas someone gave a place. */
export function unplaced(stops: Stop[]): Stop[] {
  return stops.filter((s) => !hasCoords(s.item.place) && (s.part !== "idea" || !!(s.item.place?.name || s.item.place?.address || s.item.place?.mapsUrl)));
}

// ---------------------------------------------------------------------------
// Grouping pins that would sit on top of each other

const TILE = 512;

/** Web Mercator, in pixels at `zoom` (MapLibre's 512px tiles). */
export function project(p: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((p.lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

export interface Cluster extends LatLng {
  /** The item id for a single pin; a stable key for a group. */
  key: string;
  ids: string[];
}

/**
 * Greedy grouping in screen space: each pin, in order, takes every later pin
 * close enough that the two labels would overlap. Pills are wide and short,
 * so "close" is an ellipse. Depends only on the zoom, not on where the map is.
 */
export function clusterPoints(points: (LatLng & { id: string })[], zoom: number, rx = 140, ry = 40): Cluster[] {
  const px = points.map((p) => project(p, zoom));
  const taken = new Array<boolean>(points.length).fill(false);
  const out: Cluster[] = [];
  for (let i = 0; i < points.length; i++) {
    if (taken[i]) continue;
    taken[i] = true;
    const members = [i];
    for (let j = i + 1; j < points.length; j++) {
      if (taken[j]) continue;
      const dx = (px[j].x - px[i].x) / rx;
      const dy = (px[j].y - px[i].y) / ry;
      if (dx * dx + dy * dy < 1) {
        taken[j] = true;
        members.push(j);
      }
    }
    const ids = members.map((m) => points[m].id);
    if (members.length === 1) {
      out.push({ key: ids[0], ids, lat: points[i].lat, lng: points[i].lng });
    } else {
      const lat = members.reduce((s, m) => s + points[m].lat, 0) / members.length;
      const lng = members.reduce((s, m) => s + points[m].lng, 0) / members.length;
      out.push({ key: `group:${[...ids].sort().join("|")}`, ids, lat, lng });
    }
  }
  return out;
}

/** [[west, south], [east, north]], or null with nothing to frame. */
export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [[w, s], [e, n]];
}

/** Metres between two points, near enough for "is this the same spot". */
export function distanceM(a: LatLng, b: LatLng): number {
  const r = 6371e3;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
