import "server-only";
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { coordsFromMapsUrl, geocodeQueries, hasCoords, isShortMapsLink, locatable, localityWords, roundCoord, validLatLng, type LatLng } from "@/domain/geo";
import type { Item, Place, Trip } from "@/domain/types";
import { assistantModel, googleProvider, isMock } from "./ai/models";
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
 *
 * A hit has to be in the town the address names: Nominatim's best match for
 * a street it doesn't know can be a namesake in another town ("Phuket, Krabi"
 * once landed on Krabi Road in Phuket City). When nothing matches, the map's
 * backfill asks Gemini, grounded in Google Maps, for the place's real name and
 * street address, and looks those up the same way: the coordinates always come
 * from the geocoder, never from the model.
 */

export type Lookup = { ok: true; at: LatLng | null } | { ok: false };

export interface Geocoder {
  /**
   * One free-text search. `near`: town and region words the match must mention
   * (from the address); a match elsewhere counts as not found. `ok: false` means
   * it couldn't ask (busy, offline), so don't remember the answer.
   */
  lookup(query: string, deadline: number, near?: string[]): Promise<Lookup>;
}

/** A match's coordinates and Nominatim's name for it ("Chalong, Mueang Phuket, Phuket, Thailand"). */
interface Candidate extends LatLng {
  name?: string;
}

const foldName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Where a match is: its name without its own first part, so "Krabi Road, …, Phuket City, Phuket" is in Phuket, not Krabi. */
function areaOf(name: string): string {
  const parts = foldName(name).split(",");
  return parts.length > 1 ? parts.slice(1).join(",") : parts[0];
}

/** The first candidate in the town or region the address names (any, when it names none). */
function pick(candidates: Candidate[], near: string[] | undefined): LatLng | null {
  const ok = candidates.find((c) => !near?.length || !c.name || near.some((w) => areaOf(c.name!).includes(w)));
  return ok ? { lat: ok.lat, lng: ok.lng } : null;
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

  async lookup(query: string, deadline: number, near?: string[]): Promise<Lookup> {
    // v2: a few candidates with their names, so the town check can choose; v1 kept only the first.
    const key = `geo:v2:${norm(query)}`;
    const hit = await this.cache.getCache(key);
    if (hit === "none") return { ok: true, at: null };
    if (hit) {
      try {
        const kept = (JSON.parse(hit) as Candidate[]).filter((c) => validLatLng(c.lat, c.lng));
        if (kept.length) return { ok: true, at: pick(kept, near) };
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
    url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "5", "accept-language": "en" }).toString();
    let rows: { lat?: string; lon?: string; display_name?: string }[];
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
    const candidates: Candidate[] = (Array.isArray(rows) ? rows : []).flatMap((r) => {
      const lat = Number(r?.lat);
      const lng = Number(r?.lon);
      return validLatLng(lat, lng) ? [{ lat: roundCoord(lat), lng: roundCoord(lng), ...(r.display_name ? { name: String(r.display_name).slice(0, 300) } : {}) }] : [];
    });
    await this.cache.setCache(key, candidates.length ? JSON.stringify(candidates) : "none", candidates.length ? FOUND_TTL : MISSING_TTL);
    return { ok: true, at: candidates.length ? pick(candidates, near) : null };
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

/**
 * A place's real name and street address, as Google Maps knows it. `grounded`
 * false: the model answered without looking at Maps, so only a respelling of
 * the name the group typed is kept ("Aonang" → "Ao Nang"), never an address.
 */
export interface Canonical {
  name?: string;
  address?: string;
  grounded?: boolean;
}

/** Letters and digits only: "Ao Nang Elephant Sanctuary" and "Aonang elephant sanctuary" squash the same. */
const squash = (s: string) => foldName(s).replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");

/** Words a match must mention to be inside the trip's destination ("krabi"). */
const destinationWords = (destination: string | undefined) => (destination ? foldName(destination).split(/[\s,]+/).filter((w) => w.length >= 4) : []);

/** Looks a place up by what the group typed; null when it can't say. Never gives coordinates. */
export type FindCanonical = (place: Place, destination: string | undefined, deadline: number) => Promise<Canonical | null>;

export interface LocateDeps {
  geocoder: Geocoder | null;
  /** The last resort when no search matched: the map's backfill only (it costs a model call). */
  canonical?: FindCanonical | null;
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
    maxLookups: 3,
    canonical: null,
  };
  return { ...base, ...opts, ...override?.deps };
}

const CANONICAL_TTL = 30 * 24 * 3600;

/**
 * Gemini, grounded in Google Maps, names the place and its street address.
 * A grounded answer gives both; an answer without grounding (the model could
 * make one up) gives only a respelling of the name the group typed, and must
 * then land inside the trip's destination. Never coordinates: those come from
 * looking the answer up. Answers, and "doesn't know", are cached a month.
 */
export function mapsCanonical(cache: Cache): FindCanonical | null {
  if (isMock() || !process.env.GEMINI_API_KEY) return null;
  return async (place, destination, deadline) => {
    const what = [place.name, place.address].filter(Boolean).join(" | ");
    if (!what) return null;
    const key = `geo:canon:v1:${createHash("sha256").update(`${norm(what)}|${norm(destination ?? "")}`).digest("hex")}`;
    const hit = await cache.getCache(key);
    if (hit === "none") return null;
    if (hit) {
      try {
        return JSON.parse(hit) as Canonical;
      } catch {
        // Ask again.
      }
    }
    const model = assistantModel();
    const left = deadline - Date.now();
    if (!model || left < 2500) return null;
    try {
      const res = await generateText({
        model,
        tools: { google_maps: googleProvider().tools.googleMaps({}) },
        prompt:
          `Use Google Maps to look up this place: ${what}${destination ? ` (on a trip to ${destination}; it may be in another town)` : ""}. ` +
          "Don't answer from memory; search Google Maps for it.\n" +
          'Then reply with one line of JSON: {"name": "its name on Google Maps", "address": "its street address on Google Maps, with town and region"}. ' +
          "If Google Maps doesn't have it, reply NONE.",
        maxOutputTokens: 400,
        abortSignal: AbortSignal.timeout(Math.min(12_000, left - 300)),
      });
      const grounded = !!(res.providerMetadata?.google as { groundingMetadata?: unknown } | undefined)?.groundingMetadata;
      if (process.env.DEBUG_GEO === "1") console.log("[geo] maps answer,", grounded ? "grounded:" : "NOT grounded:", JSON.stringify(res.text.slice(0, 300)), "metadata:", JSON.stringify(res.providerMetadata ?? null).slice(0, 600), "sources:", res.sources?.length ?? 0);
      const json = /\{[^{}]*\}/.exec(res.text)?.[0];
      let found: Canonical | null = null;
      if (json) {
        const raw = JSON.parse(json) as Record<string, unknown>;
        const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 200) : "";
        const address = typeof raw.address === "string" ? raw.address.trim().slice(0, 300) : "";
        if (grounded && (name || address)) found = { ...(name ? { name } : {}), ...(address ? { address } : {}), grounded: true };
        // Without Maps: only the name, and only when it's the same name re-spaced or re-cased (perhaps with its town added).
        else if (!grounded && name && place.name && squash(place.name).length >= 6 && squash(name).includes(squash(place.name)) && squash(name) !== squash(place.name)) found = { name, grounded: false };
      }
      // An ungrounded answer that wasn't a respelling isn't remembered: next time Maps may be available.
      if (found || grounded) await cache.setCache(key, found ? JSON.stringify(found) : "none", CANONICAL_TTL);
      return found;
    } catch (e) {
      if (process.env.DEBUG_GEO === "1") console.log("[geo] maps lookup failed:", (e as Error).message);
      return null;
    }
  };
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
  const near = localityWords(place);
  const found = await search(queries, near, run);
  if (found !== null || !run.deps.canonical || !place) return found;
  // Nothing matched what the group typed: ask Google Maps what the place is really called and where, then look that up.
  if (Date.now() >= run.deadline) return undefined;
  const real = await run.deps.canonical(place, destination, run.deadline);
  if (!real) return null;
  // Its name first: an address can be vague ("272 Ao Nang" is a subdistrict that takes in Ko Phi Phi), a place's name isn't.
  const fromMaps = [...geocodeQueries({ name: real.name }, destination), ...(real.grounded !== false && real.address ? geocodeQueries({ address: real.address }, destination) : [])];
  const again = [...new Set(fromMaps)].filter((q) => !queries.includes(q));
  // A respelled name must still land inside the trip's destination; a Maps answer in the town its address names.
  const where = near.length ? near : real.grounded === false ? destinationWords(destination) : localityWords(real);
  return again.length ? search(again, where, run) : null;
}

/** The first query that finds something in the right town; undefined when out of time or lookups. */
async function search(queries: string[], near: string[], run: Run): Promise<LatLng | null | undefined> {
  for (const q of queries) {
    if (run.lookups >= run.deps.maxLookups || Date.now() >= run.deadline) return undefined;
    const r = await run.deps.geocoder!.lookup(q, run.deadline, near);
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
