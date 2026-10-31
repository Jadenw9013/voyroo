import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, Trip } from "@/domain/types";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "142.250.72.14", family: 4 }] }));

const { setStoreForTests } = await import("./db");
const { MemoryBackend, TripStore } = await import("./store");
const { NominatimGeocoder, StubGeocoder, geoDeps, locateOps, locateTrip, setGeoForTests, expandMapsLink } = await import("./geocode");
const { seedTrip, SEED_TRIP_ID } = await import("./seed");
const { buildTools } = await import("./ai/tools");
const joinRoute = await import("@/app/api/t/[tripId]/join/route");
const opsRoute = await import("@/app/api/t/[tripId]/ops/route");
const undoRoute = await import("@/app/api/t/[tripId]/undo/route");
const locateRoute = await import("@/app/api/t/[tripId]/locate/route");

type Deps = Parameters<typeof locateOps>[2];

const ctx = (tripId = "guatemala") => ({ params: Promise.resolve({ tripId }) });
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

/** A geocoder that records what it was asked and answers from a table. */
function table(answers: Record<string, { lat: number; lng: number } | null>) {
  const asked: string[] = [];
  return {
    asked,
    lookup: async (q: string) => {
      asked.push(q);
      return { ok: true as const, at: answers[q] ?? null };
    },
  };
}

const deps = (over: Partial<Deps> = {}): Deps => ({ geocoder: new StubGeocoder(), expand: null, trustLinks: true, budgetMs: 3000, maxLookups: 3, ...over });

const trip: Trip = {
  ...seedTrip(),
  items: [
    { id: "cafe", kind: "food", title: "Café", place: { name: "Sabe Rico", lat: 1.5, lng: 2.5 } },
    { id: "hike", kind: "activity", title: "Hike", place: { name: "Somewhere" } },
    { id: "home", kind: "flight", title: "Home", start: { date: "2026-11-30" }, place: { name: "Seattle" } },
  ],
};

afterEach(() => {
  setGeoForTests(null);
  vi.restoreAllMocks();
});

describe("Nominatim", () => {
  it("identifies the app, asks once per query and remembers misses too", async () => {
    const store = new TripStore(new MemoryBackend());
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const q = new URL(String(url)).searchParams.get("q");
      return Response.json(q === "Lake Atitlán, Guatemala" ? [{ lat: "14.688970123", lon: "-91.203140987" }] : []);
    });
    const geo = new NominatimGeocoder(store, "https://nominatim.test/search", fetcher as unknown as typeof fetch);
    const deadline = Date.now() + 10_000;
    expect(await geo.lookup("Lake Atitlán, Guatemala", deadline)).toEqual({ ok: true, at: { lat: 14.68897, lng: -91.20314 } });
    expect(await geo.lookup("lake  atitlán, guatemala", deadline)).toEqual({ ok: true, at: { lat: 14.68897, lng: -91.20314 } });
    expect(await geo.lookup("Nowhere at all", deadline)).toEqual({ ok: true, at: null });
    expect(await geo.lookup("Nowhere at all", deadline)).toEqual({ ok: true, at: null });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: "Lake Atitlán, Guatemala", format: "jsonv2", limit: "1" });
    expect((init.headers as Record<string, string>)["user-agent"]).toMatch(/^Voyroo\/1\.0 \(\+https:\/\/www\.voyroo\.com/);
  });

  it("never asks twice in the same second, across everyone sharing the store", async () => {
    const store = new TripStore(new MemoryBackend());
    const times: number[] = [];
    const fetcher = vi.fn(async () => {
      times.push(Date.now());
      return Response.json([]);
    });
    const a = new NominatimGeocoder(store, "https://nominatim.test/search", fetcher as unknown as typeof fetch);
    const b = new NominatimGeocoder(store, "https://nominatim.test/search", fetcher as unknown as typeof fetch);
    const deadline = Date.now() + 10_000;
    await Promise.all([a.lookup("first place", deadline), b.lookup("second place", deadline)]);
    expect(times).toHaveLength(2);
    expect(Math.floor(times[1] / 1000)).not.toBe(Math.floor(times[0] / 1000));
  });

  it("gives up without caching when it runs out of time or the service fails", async () => {
    const store = new TripStore(new MemoryBackend());
    const fetcher = vi.fn(async () => new Response("busy", { status: 503 }));
    const geo = new NominatimGeocoder(store, "https://nominatim.test/search", fetcher as unknown as typeof fetch);
    expect(await geo.lookup("Antigua", Date.now() + 5000)).toEqual({ ok: false });
    expect(await store.getCache("geo:v1:antigua")).toBeNull();
    expect(await geo.lookup("Antigua", Date.now())).toEqual({ ok: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("coordinates on save", () => {
  it("adds coordinates to a new place in the same op, from a Maps link before the geocoder", async () => {
    const geo = table({ "Sabe Rico, Guatemala": { lat: 14.5573, lng: -90.7372 } });
    const ops = [
      { op: "item.add", item: { id: "a", kind: "food", title: "A", place: { name: "Sabe Rico" } } },
      { op: "item.add", item: { id: "b", kind: "food", title: "B", place: { name: "X", mapsUrl: "https://www.google.com/maps/place/X/data=!3d14.1!4d-90.2" } } },
      { op: "todo.add", todo: { id: "t", text: "Hi", done: false } },
    ];
    const out = (await locateOps(trip, ops, deps({ geocoder: geo }))) as { item?: Item }[];
    expect(out[0].item!.place).toEqual({ name: "Sabe Rico", lat: 14.5573, lng: -90.7372 });
    expect(out[1].item!.place).toMatchObject({ lat: 14.1, lng: -90.2 });
    expect(out[2]).toBe(ops[2]);
    expect(geo.asked).toEqual(["Sabe Rico, Guatemala"]);
  });

  it("moves the pin with the address, and drops a pin it can't replace rather than keep a wrong one", async () => {
    const moved = (await locateOps(trip, [{ op: "item.update", id: "cafe", set: { place: { name: "Antigua" } } }], deps())) as { set: { place: object } }[];
    expect(moved[0].set.place).toEqual({ name: "Antigua", lat: 14.55861, lng: -90.73437 });
    const lost = (await locateOps(trip, [{ op: "item.update", id: "hike", set: { place: { address: "Nowhere Street 9" } } }], deps())) as { set: { place: object } }[];
    expect(lost[0].set.place).toEqual({ address: "Nowhere Street 9", lat: null, lng: null });
  });

  it("leaves a hand-placed pin, an unchanged place and other fields alone", async () => {
    const ops = [
      { op: "item.update", id: "cafe", set: { place: { name: "Sabe Rico" } } },
      { op: "item.update", id: "cafe", set: { notes: "Good coffee" } },
      { op: "item.update", id: "hike", set: { place: { name: "Antigua", lat: 10, lng: 20 } } },
    ];
    expect(await locateOps(trip, ops, deps())).toEqual(ops);
  });

  it("doesn't read coordinates from links when told not to (the assistant's changes)", async () => {
    const op = { op: "item.update", id: "hike", set: { place: { mapsUrl: "https://www.google.com/maps/@14.1,-90.2,15z" } } };
    const out = (await locateOps(trip, [op], deps({ trustLinks: false }))) as { set: { place: object } }[];
    expect(out[0].set.place).toEqual({ mapsUrl: "https://www.google.com/maps/@14.1,-90.2,15z", lat: null, lng: null });
  });

  it("follows a Maps short link only through the guarded fetch", async () => {
    const expand = vi.fn(async () => "https://www.google.com/maps/place/Y/@14.3,-90.4,15z");
    const op = { op: "item.update", id: "hike", set: { place: { mapsUrl: "https://maps.app.goo.gl/AbC123" } } };
    const out = (await locateOps(trip, [op], deps({ expand }))) as { set: { place: object } }[];
    expect(expand).toHaveBeenCalledWith("https://maps.app.goo.gl/AbC123");
    expect(out[0].set.place).toMatchObject({ lat: 14.3, lng: -90.4 });
  });

  it("stops at the first redirect that carries coordinates", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(null, { status: 302, headers: { location: "https://www.google.com/maps/place/Y/data=!3d14.3!4d-90.4" } }));
    expect(await expandMapsLink("https://maps.app.goo.gl/AbC123")).toBe("https://www.google.com/maps/place/Y/data=!3d14.3!4d-90.4");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("looks up a flight's landing place without assuming it's in the destination", async () => {
    const geo = table({});
    await locateOps(trip, [{ op: "item.update", id: "home", set: { place: { name: "Seattle-Tacoma Airport" } } }], deps({ geocoder: geo }));
    expect(geo.asked).toEqual(["Seattle-Tacoma Airport"]);
  });
});

describe("the map's backfill", () => {
  beforeEach(() => {
    jar.clear();
    setStoreForTests(new TripStore(new MemoryBackend()));
  });

  it("places every seed item it can and says which it couldn't", async () => {
    const r = await locateTrip(seedTrip(), deps({ maxLookups: 50 }), 50);
    const placed = r.ops.map((o) => o.id);
    expect(placed).toEqual(expect.arrayContaining(["flight-out", "lodging-atitlan", "hike-acatenango", "activity-cliff-jumping", "lodging-nov26-28", "activity-indian-nose", "lodging-antigua"]));
    expect(placed).not.toContain("transfer-arrival");
    expect(r.notFound).toEqual(["flight-home"]);
    expect(r.pending).toBe(0);
  });

  it("stops when the time is up and reports what's left", async () => {
    const r = await locateTrip(seedTrip(), deps({ geocoder: null }));
    expect(r.ops).toEqual([]);
    expect(r.pending).toBeGreaterThan(0);
  });

  it("saves pins as one undoable change, and an address edit moves its pin in the same change", async () => {
    setGeoForTests({ geocoder: new StubGeocoder() });
    await joinRoute.POST(post({ name: "Sam", passcode: "volcano" }), ctx());
    let res = await locateRoute.POST(post({}), ctx());
    let body = await res.json();
    expect(res.status).toBe(200);
    while (body.pending) body = await (await locateRoute.POST(post({}), ctx())).json();
    const { getStore } = await import("./db");
    let state = (await getStore().get(SEED_TRIP_ID))!;
    expect(state.trip.items.find((i) => i.id === "lodging-antigua")!.place).toMatchObject({ lat: 14.55861, lng: -90.73437 });
    expect((await getStore().history(SEED_TRIP_ID, 1))[0].author).toBe("Sam via map");

    res = await opsRoute.POST(post({ ops: [{ op: "item.update", id: "lodging-antigua", set: { place: { name: "San Juan La Laguna" } } }] }), ctx());
    body = await res.json();
    expect(body.trip.items.find((i: Item) => i.id === "lodging-antigua").place).toEqual({ name: "San Juan La Laguna", lat: 14.69462, lng: -91.28687 });
    await undoRoute.POST(post({ entryId: body.entry.id }), ctx());
    state = (await getStore().get(SEED_TRIP_ID))!;
    expect(state.trip.items.find((i) => i.id === "lodging-antigua")!.place).toEqual({ name: "Antigua Guatemala", lat: 14.55861, lng: -90.73437 });
  });

  it("answers from memory once a version of the trip has nothing left to place", async () => {
    const geo = new StubGeocoder();
    const lookup = vi.spyOn(geo, "lookup");
    setGeoForTests({ geocoder: geo });
    await joinRoute.POST(post({ name: "Sam", passcode: "volcano" }), ctx());
    let body = await (await locateRoute.POST(post({}), ctx())).json();
    while (body.pending || body.located.length) body = await (await locateRoute.POST(post({}), ctx())).json();
    expect(body.notFound).toEqual(["flight-home"]);
    lookup.mockClear();
    for (let i = 0; i < 30; i++) {
      const res = await locateRoute.POST(post({}), ctx());
      expect(res.status).toBe(200);
      expect((await res.json()).notFound).toEqual(["flight-home"]);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    expect((await locateRoute.POST(post({}), ctx())).status).toBe(401);
  });
});

describe("the assistant", () => {
  it("gets coordinates from the geocoder, not from links it wrote", async () => {
    setGeoForTests({ geocoder: new StubGeocoder() });
    const store = new TripStore(new MemoryBackend());
    await store.get(SEED_TRIP_ID);
    const tools = buildTools({ store, tripId: SEED_TRIP_ID, me: "Jaden", trip: async () => (await store.get(SEED_TRIP_ID))!.trip });
    const add = tools.add_items as unknown as { execute: (input: unknown, opts: unknown) => Promise<unknown> };
    await add.execute({ items: [{ title: "Coffee", kind: "food", placeName: "Sabe Rico", mapsUrl: "https://www.google.com/maps/@1.5,2.5,15z" }] }, {});
    const coffee = (await store.get(SEED_TRIP_ID))!.trip.items.find((i) => i.title === "Coffee")!;
    expect(coffee.place).toMatchObject({ lat: 14.5573, lng: -90.7372 });
  });
});

describe("which geocoder", () => {
  it("is off in unit tests unless chosen, and can be switched off in production", () => {
    const store = new TripStore(new MemoryBackend());
    expect(geoDeps(store).geocoder).toBeNull();
    vi.stubEnv("GEOCODER", "off");
    vi.stubEnv("NODE_ENV", "production");
    expect(geoDeps(store).geocoder).toBeNull();
    vi.stubEnv("GEOCODER", "");
    expect(geoDeps(store).geocoder).toBeInstanceOf(NominatimGeocoder);
    vi.unstubAllEnvs();
  });
});
