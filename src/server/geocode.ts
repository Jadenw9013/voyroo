import "server-only";
import { coordsFromMapsUrl, geocodeQueries, hasCoords, isShortMapsLink, locatable, roundCoord, validLatLng, type LatLng } from "@/domain/geo";
import type { Item, Place, Trip } from "@/domain/types";
import type { TripStore } from "./store";
import { safeFetch } from "./unfurl";

/*
 * Pins for the trip map. When a place's name, address or Maps link is saved,
 * the same write gets its coordinates, so one Undo puts back both. Older
 * items are placed by a backfill the map asks for (POST /api/t/{id}/locate).
 *
 * Coordinates come from, in order: a Google Maps link that carries them
 * (short links are followed through the same guarded fetch as link previews),
 * then OpenStreetMap's Nominatim. Nominatim's usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/):
 *   - at most one request a second for the whole app: a shared counter in the
 *     store spaces requests out across every server instance;
 *   - an identifying User-Agent;
 *   - results cached (found 90 days, not found 14), so a query is asked once;
 *   - OpenStreetMap credited on the map;
 *   - switchable off without a code change: GEOCODER=off.
 * GEOCODER=stub answers from a fixed table, for tests that must not reach it.
 */

export type Lookup = { ok: true; at: LatLng | null } | { ok: false };

export interface Geocoder {
  /** One free-text search. `ok: false` means it couldn't ask (busy, offline), so don't remember the answer. */
  lookup(query: string, deadline: number): Promise<Lookup>;
}

type Cache = Pick<TripStore, "getCache" | "setCache" | "hit">;

const FOUND_TTL = 90 * 24 * 3600;
const MISSING_TTL = 14 * 24 * 3600;
const USER_AGENT = "Voyroo/1.0 (+https://www.voyroo.com; trip planner, server-side geocoding of saved places)";

const norm = (q: string) => q.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NominatimGeocoder implements Geocoder {
  constructor(
    private cache: Cache,
    private endpoint = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search",
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async lookup(query: string, deadline: number): Promise<Lookup> {
    const key = `geo:v1:${norm(query)}`;
    const hit = await this.cache.getCache(key);
    if (hit === "none") return { ok: true, at: null };
    if (hit) {
      try {
        const at = JSON.parse(hit) as LatLng;
        if (validLatLng(at.lat, at.lng)) return { ok: true, at };
      } catch {
        // Ask again.
      }
    }
    // One request per wall-clock second across the app: whoever counts 1 for this second goes.
    for (;;) {
      if (Date.now() >= deadline - 300) return { ok: false };
      const second = Math.floor(Date.now() / 1000);
      if ((await this.cache.hit(`nominatim:${second}`, 5)) === 1) break;
      await sleep(1000 - (Date.now() % 1000) + 25);
    }
    const url = new URL(this.endpoint);
    url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", "accept-language": "en" }).toString();
    let rows: { lat?: string; lon?: string }[];
    try {
      const res = await this.fetcher(url, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(Math.max(500, Math.min(4000, deadline - Date.now()))),
      });
      if (!res.ok) return { ok: false };
      rows = await res.json();
    } catch {
      return { ok: false };
    }
    const first = Array.isArray(rows) ? rows[0] : undefined;
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    const at = first && validLatLng(lat, lng) ? { lat: roundCoord(lat), lng: roundCoord(lng) } : null;
    await this.cache.setCache(key, at ? JSON.stringify(at) : "none", at ? FOUND_TTL : MISSING_TTL);
    return { ok: true, at };
  }
}

/** Fixed answers for the seed trip and tests: never leaves the machine. */
const STUB: [RegExp, LatLng][] = [
  [/2 calle oriente/, { lat: 14.55841, lng: -90.73047 }],
  [/indian nose|nariz/, { lat: 14.71233, lng: -91.27419 }],
  [/san marcos la laguna/, { lat: 14.72459, lng: -91.25913 }],
  [/san juan la laguna/, { lat: 14.69462, lng: -91.28687 }],
  [/panajachel/, { lat: 14.74079, lng: -91.15608 }],
  [/lake atitlan/, { lat: 14.68897, lng: -91.20314 }],
  [/acatenango/, { lat: 14.50083, lng: -90.87583 }],
  [/pacaya/, { lat: 14.38139, lng: -90.60111 }],
  [/antigua/, { lat: 14.55861, lng: -90.73437 }],
  [/guatemala city|ciudad de guatemala/, { lat: 14.62763, lng: -90.51469 }],
  [/sabe rico/, { lat: 14.5573, lng: -90.7372 }],
];

export class StubGeocoder implements Geocoder {
  async lookup(query: string): Promise<Lookup> {
    const q = query.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return { ok: true, at: STUB.find(([re]) => re.test(q))?.[1] ?? null };
  }
}

// ---------------------------------------------------------------------------

export interface LocateDeps {
  geocoder: Geocoder | null;
  /** Follows a Maps short link to where it goes; null when links aren't followed (tests, stub). */
  expand: ((url: string) => Promise<string | null>) | null;
  /** Read coordinates out of Maps links. Off for the assistant's changes: it doesn't get to say where things are. */
  trustLinks: boolean;
  /** Stop starting new lookups after this long. */
  budgetMs: number;
  /** Network lookups allowed in one go (cached answers are free). */
  maxLookups: number;
}

/** Follows a maps.app.goo.gl link only until it reaches a URL that carries coordinates. */
export async function expandMapsLink(url: string): Promise<string | null> {
  const r = await safeFetch(url, { accept: "text/html", until: (u) => coordsFromMapsUrl(u) !== null, maxBytes: 1 });
  return r?.url ?? null;
}

let override: { deps: Partial<LocateDeps> } | null = null;

/** Tests choose the geocoder; nothing else should. */
export function setGeoForTests(deps: Partial<LocateDeps> | null) {
  override = deps && { deps };
}

/** GEOCODER: "nominatim" (default in the app), "stub", or "off". Unit tests default to off. */
export function geoDeps(store: Cache, opts: Partial<LocateDeps> = {}): LocateDeps {
  const mode = process.env.GEOCODER || (process.env.NODE_ENV === "test" ? "off" : "nominatim");
  const base: LocateDeps = {
    geocoder: mode === "nominatim" ? new NominatimGeocoder(store) : mode === "stub" ? new StubGeocoder() : null,
    expand: mode === "nominatim" ? expandMapsLink : null,
    trustLinks: true,
    budgetMs: 3500,
    maxLookups: 2,
  };
  return { ...base, ...opts, ...override?.deps };
}

interface Run {
  deps: LocateDeps;
  deadline: number;
  lookups: number;
}

/**
 * Where a place is: LatLng, null when nothing matched, undefined when it
 * couldn't be worked out right now (out of time, or the geocoder is busy).
 */
async function placeAt(place: Place | undefined, links: string[], destination: string | undefined, run: Run): Promise<LatLng | null | undefined> {
  if (run.deps.trustLinks) {
    for (const url of [place?.mapsUrl, ...links].filter((u): u is string => !!u)) {
      const direct = coordsFromMapsUrl(url);
      if (direct) return direct;
      if (isShortMapsLink(url) && run.deps.expand && Date.now() < run.deadline) {
        const long = await run.deps.expand(url);
        const found = long && coordsFromMapsUrl(long);
        if (found) return found;
      }
    }
  }
  const queries = geocodeQueries(place, destination);
  if (!queries.length) return null;
  if (!run.deps.geocoder) return undefined;
  for (const q of queries) {
    if (run.lookups >= run.deps.maxLookups || Date.now() >= run.deadline) return undefined;
    const r = await run.deps.geocoder.lookup(q, run.deadline);
    if (!r.ok) return undefined;
    run.lookups++;
    if (r.at) return r.at;
  }
  return null;
}

/** A flight's place is where it lands, often home: don't pin it inside the destination. */
const contextFor = (kind: unknown, trip: Trip) => (kind === "flight" ? undefined : trip.destination);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const LOCATION_KEYS = ["name", "address", "mapsUrl"] as const;

/** True when a batch adds a place or changes where one is: worth reading the trip for. */
export function touchesPlaces(ops: unknown): boolean {
  if (!Array.isArray(ops)) return false;
  return ops.some(
    (o) =>
      isObj(o) &&
      ((o.op === "item.add" && isObj(o.item) && isObj(o.item.place)) ||
        (o.op === "item.update" && isObj(o.set) && isObj(o.set.place) && LOCATION_KEYS.some((k) => k in (o.set as { place: object }).place))),
  );
}

/**
 * Gives a batch's new or moved places their coordinates, in the same ops, so
 * one Undo puts back both. A place that moves and can't be found loses its
 * old pin rather than keep a wrong one; a pin someone set by hand (lat/lng in
 * the op) is left alone. Ops it doesn't understand pass through untouched for
 * the usual validation to judge.
 */
export async function locateOps(trip: Trip, ops: unknown, deps: LocateDeps): Promise<unknown> {
  if (!Array.isArray(ops) || !touchesPlaces(ops)) return ops;
  const run: Run = { deps, deadline: Date.now() + deps.budgetMs, lookups: 0 };
  const places = new Map<string, Place | undefined>(trip.items.map((i) => [i.id, i.place]));
  const out: unknown[] = [];
  for (const op of ops) {
    if (isObj(op) && op.op === "item.add" && isObj(op.item) && isObj(op.item.place)) {
      const item = op.item as unknown as Item;
      const place = item.place!;
      if (!("lat" in place) && !("lng" in place)) {
        const links = (item.links ?? []).filter((l) => l?.kind === "maps").map((l) => l.url);
        const found = await placeAt(place, links, contextFor(item.kind, trip), run);
        if (found) {
          out.push({ ...op, item: { ...op.item, place: { ...place, ...found } } });
          places.set(item.id, { ...place, ...found });
          continue;
        }
      }
      places.set(item.id, place);
    } else if (isObj(op) && op.op === "item.update" && typeof op.id === "string" && isObj(op.set) && isObj(op.set.place)) {
      const set = op.set.place as Record<string, unknown>;
      const before = places.get(op.id) ?? {};
      const after: Record<string, unknown> = { ...before };
      for (const [k, v] of Object.entries(set)) {
        if (v === null) delete after[k];
        else after[k] = v;
      }
      const moved = LOCATION_KEYS.some((k) => k in set && (after[k] ?? null) !== ((before as Record<string, unknown>)[k] ?? null));
      if (moved && !("lat" in set) && !("lng" in set)) {
        const kind = trip.items.find((i) => i.id === op.id)?.kind;
        const found = await placeAt(after as Place, [], contextFor(kind, trip), run);
        const next = { ...set, lat: found?.lat ?? null, lng: found?.lng ?? null };
        out.push({ ...op, set: { ...op.set, place: next } });
        places.set(op.id, { ...(after as Place), ...(found ?? {}) });
        continue;
      }
      places.set(op.id, after as Place);
    }
    out.push(op);
  }
  return out;
}

export interface Backfill {
  /** item.update ops setting coordinates, one per item found. */
  ops: { op: "item.update"; id: string; set: { place: LatLng } }[];
  /** Items with a place nothing matched. */
  notFound: string[];
  /** Items not tried yet: time ran out or the geocoder was busy. */
  pending: number;
}

/** Finds coordinates for items that have a place but no pin yet, oldest question first. */
export async function locateTrip(trip: Trip, deps: LocateDeps, maxItems = 8): Promise<Backfill> {
  const run: Run = { deps, deadline: Date.now() + deps.budgetMs, lookups: 0 };
  const todo = trip.items.filter((i) => !hasCoords(i.place) && locatable(i));
  const out: Backfill = { ops: [], notFound: [], pending: 0 };
  for (const [n, item] of todo.entries()) {
    if (n >= maxItems || Date.now() >= run.deadline) {
      out.pending = todo.length - n;
      break;
    }
    const links = (item.links ?? []).filter((l) => l.kind === "maps").map((l) => l.url);
    const found = await placeAt(item.place, links, contextFor(item.kind, trip), run);
    if (found) out.ops.push({ op: "item.update", id: item.id, set: { place: found } });
    else if (found === null) out.notFound.push(item.id);
    else {
      out.pending = todo.length - n;
      break;
    }
  }
  return out;
}

/** For a write about to happen: the ops with coordinates added, or as they were if anything goes wrong. */
export async function locateForWrite(store: TripStore, tripId: string, ops: unknown, opts: Partial<LocateDeps> = {}): Promise<unknown> {
  if (!touchesPlaces(ops)) return ops;
  try {
    const state = await store.get(tripId);
    return state ? await locateOps(state.trip, ops, geoDeps(store, opts)) : ops;
  } catch {
    return ops;
  }
}
