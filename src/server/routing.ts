import "server-only";
import { Redis } from "@upstash/redis";
import { routePoints, straightLineM, type Point, type Route, type TravelMode } from "@/domain/travel";
import { redisEnv } from "./db";

/*
 * Road times between a trip's stops, for the "25 min drive" lines.
 *
 * openrouteservice (HeiGIT, OpenStreetMap data): a free key, 2,000 routes a
 * day, driving and walking, results we may keep. The key stays on the
 * server (OPENROUTESERVICE_API_KEY); with none set, phones show a labeled
 * straight-line guess instead. Every answer is cached in Redis per
 * (from, to, mode), so a trip costs a lookup per leg once, not per view.
 *
 * Lookups are rationed per trip and for the whole site, so a busy phone or a
 * runaway loop can't use up the day's quota.
 */

/** A route, null when there's no road between them, or undefined when it isn't known yet. */
export type Lookup = Route | null;

export interface RouteCache {
  get(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export class MemoryRouteCache implements RouteCache {
  private rows = new Map<string, { value: string; until: number }>();
  async get(keys: string[]) {
    const now = Date.now();
    return keys.map((k) => {
      const row = this.rows.get(k);
      return row && row.until > now ? row.value : null;
    });
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.rows.set(key, { value, until: Date.now() + ttlSeconds * 1000 });
  }
}

/** The subset of the @upstash/redis client used here. */
export interface RedisCacheLike {
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, opts: { ex: number }): Promise<unknown>;
}

export class RedisRouteCache implements RouteCache {
  constructor(private redis: RedisCacheLike) {}
  async get(keys: string[]) {
    if (!keys.length) return [];
    const rows = await this.redis.mget(...keys.map((k) => `route:v1:${k}`));
    return rows.map((r) => (r === null || r === undefined ? null : typeof r === "string" ? r : JSON.stringify(r)));
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(`route:v1:${key}`, value, { ex: ttlSeconds });
  }
}

/** Roads change slowly; "no road" may just be a pin in the wrong spot, so it's tried again sooner. */
export const ROUTE_TTL_SECONDS = 90 * 86_400;
export const NO_ROUTE_TTL_SECONDS = 7 * 86_400;

// ---------------------------------------------------------------------------
// Routers

export type RouterAnswer =
  | { ok: true; route: Route | null }
  /** `stop`: don't try more this time (no quota, bad key). */
  | { ok: false; stop: boolean };

export interface Router {
  /** Who the times come from, for attribution. */
  name: string;
  route(from: Point, to: Point, mode: TravelMode, signal: AbortSignal): Promise<RouterAnswer>;
}

const ORS_PROFILE: Record<TravelMode, string> = { drive: "driving-car", walk: "foot-walking" };
/** Pins are often a little off the road: look this far for one, in metres. */
const SNAP_RADIUS_M = 1000;

/** No route found (2009), or no road near a point (2010). */
const ORS_NO_ROUTE = new Set([2009, 2010]);

export function openRouteService(key: string, fetchImpl: typeof fetch = fetch): Router {
  return {
    name: "openrouteservice",
    async route(from, to, mode, signal) {
      let res: Response;
      try {
        res = await fetchImpl(`https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[mode]}`, {
          method: "POST",
          headers: { authorization: key, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            coordinates: [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ],
            radiuses: [SNAP_RADIUS_M, SNAP_RADIUS_M],
            instructions: false,
            geometry: false,
          }),
          signal,
        });
      } catch {
        return { ok: false, stop: false };
      }
      const body = (await res.json().catch(() => null)) as { routes?: { summary?: { distance?: number; duration?: number } }[]; error?: { code?: number } } | null;
      if (res.ok) {
        const summary = body?.routes?.[0]?.summary;
        if (!summary) return { ok: true, route: null };
        // A zero-length route comes back with an empty summary.
        return { ok: true, route: { s: Math.round(summary.duration ?? 0), m: Math.round(summary.distance ?? 0) } };
      }
      if (ORS_NO_ROUTE.has(Number(body?.error?.code))) return { ok: true, route: null };
      // 401/403: bad key or the day's quota is gone. 429: too fast. Either way, stop for now.
      return { ok: false, stop: res.status === 401 || res.status === 403 || res.status === 429 };
    },
  };
}

/** Local testing only (ROUTING_MOCK=1): road-ish times with no network. Never in production. */
export function mockRouter(): Router {
  return {
    name: "test",
    async route(from, to, mode) {
      const m = Math.round(straightLineM(from, to) * 1.3);
      return { ok: true, route: { m, s: Math.round(m / (mode === "walk" ? 1.2 : 8)) } };
    },
  };
}

const isProduction = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

// ---------------------------------------------------------------------------
// Looking routes up

export interface RoutesAnswer {
  /** Known routes by key; null for "no road between them". */
  routes: Record<string, Lookup>;
  /** Keys still unknown that a later request may fill (rationed or the service was busy). */
  pending: number;
  /** Who the times come from, or null when no service is set up (phones show estimates). */
  provider: string | null;
}

export interface RouteDeps {
  cache: RouteCache;
  router: Router | null;
  /** Asks for one more lookup; false when the ration is used up. */
  allow: () => Promise<boolean>;
  /** Most lookups in one request. */
  budget?: number;
  concurrency?: number;
  /** Per lookup, and for the whole request: what isn't done by then waits for the next one. */
  timeoutMs?: number;
  deadlineMs?: number;
}

function readCached(raw: string | null): Lookup | undefined {
  if (raw === null) return undefined;
  if (raw === "none") return null;
  try {
    const r = JSON.parse(raw) as Route;
    return Number.isFinite(r?.s) && Number.isFinite(r?.m) ? { s: r.s, m: r.m } : undefined;
  } catch {
    return undefined;
  }
}

/** Routes for `keys` (as made by routeKey): from the cache, else from the router within the ration. */
export async function lookupRoutes(keys: string[], deps: RouteDeps): Promise<RoutesAnswer> {
  const unique = [...new Set(keys)].filter((k) => routePoints(k));
  const routes: Record<string, Lookup> = {};
  const cached = await deps.cache.get(unique);
  const misses: string[] = [];
  unique.forEach((k, i) => {
    const hit = readCached(cached[i]);
    if (hit === undefined) misses.push(k);
    else routes[k] = hit;
  });
  const router = deps.router;
  if (!router || !misses.length) return { routes, pending: 0, provider: router?.name ?? null };

  const queue = misses.slice(0, deps.budget ?? 20);
  let pending = misses.length - queue.length;
  let stopped = false;
  const deadline = Date.now() + (deps.deadlineMs ?? 8000);
  const work = async () => {
    for (let k = queue.shift(); k !== undefined; k = queue.shift()) {
      const left = deadline - Date.now();
      if (stopped || left < 500 || !(await deps.allow())) {
        stopped = true;
        pending++;
        continue;
      }
      const { mode, from, to } = routePoints(k)!;
      const signal = AbortSignal.timeout(Math.min(deps.timeoutMs ?? 6000, left));
      const answer = await router.route(from, to, mode, signal).catch((): RouterAnswer => ({ ok: false, stop: false }));
      if (!answer.ok) {
        if (answer.stop) stopped = true;
        pending++;
        continue;
      }
      routes[k] = answer.route;
      await deps.cache.set(k, answer.route ? JSON.stringify(answer.route) : "none", answer.route ? ROUTE_TTL_SECONDS : NO_ROUTE_TTL_SECONDS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? 3, queue.length) }, work));
  return { routes, pending, provider: router.name };
}

// ---------------------------------------------------------------------------
// Wiring

const g = globalThis as unknown as { routeCache?: RouteCache; routerForTests?: Router | null };

export function getRouteCache(): RouteCache {
  if (g.routeCache) return g.routeCache;
  const env = redisEnv();
  g.routeCache = env ? new RedisRouteCache(new Redis({ ...env, automaticDeserialization: false }) as unknown as RedisCacheLike) : new MemoryRouteCache();
  return g.routeCache;
}

/** The router this server is set up with, or null for estimates only. */
export function getRouter(): Router | null {
  if (g.routerForTests !== undefined) return g.routerForTests;
  if (process.env.ROUTING_MOCK === "1" && !isProduction()) return mockRouter();
  const key = process.env.OPENROUTESERVICE_API_KEY?.trim();
  return key ? openRouteService(key) : null;
}

/** Tests swap in a stub router and a fresh cache; undefined puts the real ones back. */
export function setRoutingForTests(router: Router | null | undefined, cache?: RouteCache) {
  g.routerForTests = router;
  g.routeCache = cache;
}
