import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeKey, type Point, type TravelMode } from "@/domain/travel";

/** A cookie jar standing in for next/headers between "requests" in one test. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

const { setStoreForTests, getStore } = await import("./db");
const { MemoryBackend, TripStore } = await import("./store");
const { lookupRoutes, MemoryRouteCache, NO_ROUTE_TTL_SECONDS, openRouteService, RedisRouteCache, ROUTE_TTL_SECONDS, setRoutingForTests } = await import("./routing");
type Router = import("./routing").Router;
type RouterAnswer = import("./routing").RouterAnswer;
const joinRoute = await import("@/app/api/t/[tripId]/join/route");
const opsRoute = await import("@/app/api/t/[tripId]/ops/route");
const routesRoute = await import("@/app/api/t/[tripId]/routes/route");

const HOTEL = { lat: 14.5586, lng: -90.7295 };
const CAFE = { lat: 14.5601, lng: -90.7328 };
const TOUR = { lat: 14.5432, lng: -90.696 };
const PANA = { lat: 14.7409, lng: -91.1557 };

/** A router that answers from a script and counts calls. */
function stubRouter(answer: (from: Point, to: Point, mode: TravelMode) => RouterAnswer = () => ({ ok: true, route: { s: 900, m: 6000 } })) {
  const calls: string[] = [];
  const router: Router = {
    name: "stub",
    async route(from, to, mode) {
      calls.push(routeKey(from, to, mode));
      return answer(from, to, mode);
    },
  };
  return { router, calls };
}

const always = async () => true;

describe("looking up routes", () => {
  const a = routeKey(HOTEL, CAFE, "walk");
  const b = routeKey(CAFE, TOUR, "drive");
  const c = routeKey(TOUR, PANA, "drive");

  it("asks the router once per leg, then answers from the cache", async () => {
    const cache = new MemoryRouteCache();
    const { router, calls } = stubRouter();
    const first = await lookupRoutes([a, b, a], { cache, router, allow: always });
    expect(first).toEqual({ routes: { [a]: { s: 900, m: 6000 }, [b]: { s: 900, m: 6000 } }, pending: 0, provider: "stub" });
    expect(calls.sort()).toEqual([a, b].sort());
    const again = await lookupRoutes([a, b], { cache, router, allow: always });
    expect(again.routes).toEqual(first.routes);
    expect(calls).toHaveLength(2);
  });

  it("remembers 'no road' for a shorter while, and road routes for longer", async () => {
    const cache = new MemoryRouteCache();
    const set = vi.spyOn(cache, "set");
    const { router } = stubRouter((from) => (from.lat === TOUR.lat ? { ok: true, route: null } : { ok: true, route: { s: 60, m: 80 } }));
    const answer = await lookupRoutes([b, c], { cache, router, allow: always });
    expect(answer.routes[c]).toBeNull();
    expect(set).toHaveBeenCalledWith(c, "none", NO_ROUTE_TTL_SECONDS);
    expect(set).toHaveBeenCalledWith(b, JSON.stringify({ s: 60, m: 80 }), ROUTE_TTL_SECONDS);
    const { router: other, calls } = stubRouter();
    expect((await lookupRoutes([c], { cache, router: other, allow: always })).routes[c]).toBeNull();
    expect(calls).toEqual([]);
  });

  it("leaves failures pending and uncached, to try again later", async () => {
    const cache = new MemoryRouteCache();
    const { router, calls } = stubRouter(() => ({ ok: false, stop: false }));
    const answer = await lookupRoutes([a, b], { cache, router, allow: always });
    expect(answer).toEqual({ routes: {}, pending: 2, provider: "stub" });
    await lookupRoutes([a, b], { cache, router, allow: always });
    expect(calls).toHaveLength(4);
  });

  it("stops asking when the service says stop (bad key, quota, too fast)", async () => {
    const { router, calls } = stubRouter(() => ({ ok: false, stop: true }));
    const answer = await lookupRoutes([a, b, c], { cache: new MemoryRouteCache(), router, allow: always, concurrency: 1 });
    expect(calls).toHaveLength(1);
    expect(answer.pending).toBe(3);
  });

  it("keeps to the ration and the per-request budget", async () => {
    const { router, calls } = stubRouter();
    let left = 1;
    const rationed = await lookupRoutes([a, b, c], { cache: new MemoryRouteCache(), router, allow: async () => left-- > 0, concurrency: 1 });
    expect(calls).toHaveLength(1);
    expect(rationed.pending).toBe(2);
    const budgeted = await lookupRoutes([a, b, c], { cache: new MemoryRouteCache(), router, allow: always, budget: 2 });
    expect(Object.keys(budgeted.routes)).toHaveLength(2);
    expect(budgeted.pending).toBe(1);
    const late = stubRouter();
    expect(await lookupRoutes([a, b], { cache: new MemoryRouteCache(), router: late.router, allow: always, deadlineMs: 0 })).toMatchObject({ routes: {}, pending: 2 });
    expect(late.calls).toEqual([]);
  });

  it("with no router, hands back what's cached and says so", async () => {
    const cache = new MemoryRouteCache();
    await cache.set(a, JSON.stringify({ s: 300, m: 400 }), 60);
    expect(await lookupRoutes([a, b], { cache, router: null, allow: always })).toEqual({ routes: { [a]: { s: 300, m: 400 } }, pending: 0, provider: null });
  });

  it("ignores keys that aren't route keys, and junk in the cache", async () => {
    const cache = new MemoryRouteCache();
    await cache.set(a, "{not json", 60);
    const { router, calls } = stubRouter();
    const answer = await lookupRoutes(["drive:nope", a], { cache, router, allow: always });
    expect(calls).toEqual([a]);
    expect(Object.keys(answer.routes)).toEqual([a]);
  });
});

describe("openrouteservice", () => {
  const signal = new AbortController().signal;
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("asks for a driving or walking route with the key in a header, lng before lat", async () => {
    const fetchImpl = vi.fn(async () => reply(200, { routes: [{ summary: { distance: 12034.5, duration: 1499.6 } }] }));
    const answer = await openRouteService("secret-key", fetchImpl as unknown as typeof fetch).route(HOTEL, TOUR, "drive", signal);
    expect(answer).toEqual({ ok: true, route: { s: 1500, m: 12035 } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openrouteservice.org/v2/directions/driving-car");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>).authorization).toBe("secret-key");
    expect(JSON.parse(init.body as string).coordinates).toEqual([
      [HOTEL.lng, HOTEL.lat],
      [TOUR.lng, TOUR.lat],
    ]);
    await openRouteService("k", fetchImpl as unknown as typeof fetch).route(HOTEL, CAFE, "walk", signal);
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toContain("/foot-walking");
  });

  it("reads 'no route' and 'no road nearby' as no road, and an empty summary as a zero route", async () => {
    const ors = (r: Response) => openRouteService("k", (async () => r) as unknown as typeof fetch);
    expect(await ors(reply(404, { error: { code: 2010, message: "Could not find routable point" } })).route(HOTEL, PANA, "drive", signal)).toEqual({ ok: true, route: null });
    expect(await ors(reply(404, { error: { code: 2009 } })).route(HOTEL, PANA, "drive", signal)).toEqual({ ok: true, route: null });
    expect(await ors(reply(200, { routes: [{ summary: {} }] })).route(HOTEL, HOTEL, "walk", signal)).toEqual({ ok: true, route: { s: 0, m: 0 } });
  });

  it("stops on a bad key, a spent quota or too many requests; retries after a blip", async () => {
    const ors = (r: Response) => openRouteService("k", (async () => r) as unknown as typeof fetch);
    expect(await ors(reply(403, { error: "Access to this API has been disallowed" })).route(HOTEL, PANA, "drive", signal)).toEqual({ ok: false, stop: true });
    expect(await ors(reply(429, { error: "Rate limit exceeded" })).route(HOTEL, PANA, "drive", signal)).toEqual({ ok: false, stop: true });
    expect(await ors(reply(502, "Bad gateway")).route(HOTEL, PANA, "drive", signal)).toEqual({ ok: false, stop: false });
    const offline = openRouteService("k", (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(await offline.route(HOTEL, PANA, "drive", signal)).toEqual({ ok: false, stop: false });
  });
});

describe("the Redis route cache", () => {
  it("keeps routes under their own prefix, with an expiry", async () => {
    const redis = { mget: vi.fn(async (...keys: string[]) => keys.map(() => null)), set: vi.fn(async () => "OK") };
    const cache = new RedisRouteCache(redis);
    await cache.set("walk:1.0000,2.0000;3.0000,4.0000", "none", 60);
    expect(redis.set).toHaveBeenCalledWith("route:v1:walk:1.0000,2.0000;3.0000,4.0000", "none", { ex: 60 });
    expect(await cache.get(["a", "b"])).toEqual([null, null]);
    expect(redis.mget).toHaveBeenCalledWith("route:v1:a", "route:v1:b");
    expect(await cache.get([])).toEqual([]);
  });
});

describe("GET /api/t/:id/routes", () => {
  const ctx = { params: Promise.resolve({ tripId: "guatemala" }) };
  const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const get = () => new Request("http://localhost/api");

  async function joinAndPlace() {
    await joinRoute.POST(post({ name: "Sam", passcode: "volcano" }), ctx);
    const items = [
      { id: "i_coffee", kind: "food", title: "Coffee", start: { date: "2026-11-25", time: "08:00" }, place: { name: "Cafe", ...CAFE } },
      { id: "i_tour", kind: "activity", title: "Tour", start: { date: "2026-11-25", time: "09:00" }, place: { name: "Tour", ...TOUR } },
    ];
    const res = await opsRoute.POST(post({ ops: items.map((item) => ({ op: "item.add", item })) }), ctx);
    expect(res.status).toBe(200);
  }

  beforeEach(() => {
    jar.clear();
    setStoreForTests(new TripStore(new MemoryBackend()));
    setRoutingForTests(undefined);
  });

  it("needs a session", async () => {
    expect((await routesRoute.GET(get(), ctx)).status).toBe(401);
  });

  it("routes the trip's own legs through the cache", async () => {
    await joinAndPlace();
    const { router, calls } = stubRouter();
    setRoutingForTests(router, new MemoryRouteCache());
    const res = await routesRoute.GET(get(), ctx);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    const key = routeKey(CAFE, TOUR, "drive");
    expect(body).toEqual({ routes: { [key]: { s: 900, m: 6000 } }, pending: 0, provider: "stub" });
    await routesRoute.GET(get(), ctx);
    expect(calls).toEqual([key]);
  });

  it("says there's no provider when none is set up", async () => {
    await joinAndPlace();
    setRoutingForTests(null, new MemoryRouteCache());
    expect(await (await routesRoute.GET(get(), ctx)).json()).toEqual({ routes: {}, pending: 0, provider: null });
  });

  it("rations lookups per trip", async () => {
    await joinAndPlace();
    const { router } = stubRouter();
    setRoutingForTests(router, new MemoryRouteCache());
    for (let i = 0; i < 150; i++) await getStore().hit("routes:trip:guatemala", 3600);
    const body = await (await routesRoute.GET(get(), ctx)).json();
    expect(body).toMatchObject({ routes: {}, pending: 1 });
  });

  it("turns away a phone asking too often", async () => {
    await joinAndPlace();
    setRoutingForTests(null, new MemoryRouteCache());
    for (let i = 0; i < 30; i++) expect((await routesRoute.GET(get(), ctx)).status).toBe(200);
    expect((await routesRoute.GET(get(), ctx)).status).toBe(429);
  });
});
