import { beforeEach, describe, expect, it, vi } from "vitest";

/** A cookie jar standing in for next/headers between "requests" in one test. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

const { setStoreForTests } = await import("./db");
const { MemoryBackend, TripStore } = await import("./store");
const tripRoute = await import("@/app/api/t/[tripId]/route");
const joinRoute = await import("@/app/api/t/[tripId]/join/route");
const opsRoute = await import("@/app/api/t/[tripId]/ops/route");
const undoRoute = await import("@/app/api/t/[tripId]/undo/route");
const tripsRoute = await import("@/app/api/trips/route");
const previewRoute = await import("@/app/api/t/[tripId]/preview/route");
const meRoute = await import("@/app/api/t/[tripId]/me/route");
const unfurlRoute = await import("@/app/api/t/[tripId]/unfurl/route");
const publicRoute = await import("@/app/api/p/[tripId]/[token]/route");
const { previewTrip, publicTrip } = await import("./preview");
const { getStore } = await import("./db");
const { ACCOUNT_COOKIE, hashPasscode, seal } = await import("./auth");
const { requester } = await import("./http");

const ctx = (tripId = "guatemala") => ({ params: Promise.resolve({ tripId }) });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const get = () => new Request("http://localhost/api");

async function join(name = "Sam", passcode = "volcano") {
  return joinRoute.POST(post({ name, passcode }), ctx());
}

beforeEach(() => {
  jar.clear();
  setStoreForTests(new TripStore(new MemoryBackend()));
});

describe("view-only presentation links", () => {
  it("returns only the current version, checks access before 304, and rejects revoked links", async () => {
    await join();
    const { path } = await (await previewRoute.POST(post({}), ctx())).json();
    const context = { params: Promise.resolve({ tripId: "guatemala", token: path.split("/").at(-1) }) };
    const first = await publicRoute.GET(get(), context);
    expect(first.headers.get("cache-control")).toContain("no-store");
    const original = await first.json();
    const changed = await opsRoute.POST(post({ ops: [{ op: "trip.update", set: { name: "Updated public trip", notes: "PRIVATE-REFRESH-NOTE" } }] }), ctx());
    expect(changed.status).toBe(200);
    jar.clear();
    const next = await publicRoute.GET(new Request("http://localhost/api", { headers: { "If-None-Match": first.headers.get("etag")! } }), context);
    const body = await next.json();
    expect(Object.keys(body)).toEqual(["version"]);
    expect(body.version).toBeGreaterThan(original.version);
    expect(JSON.stringify(body)).not.toContain("PRIVATE-REFRESH-NOTE");
    const unchangedRequest = new Request("http://localhost/api", { headers: { "If-None-Match": next.headers.get("etag")! } });
    expect((await publicRoute.GET(unchangedRequest, context)).status).toBe(304);
    const { getStore } = await import("./db");
    await getStore().disablePreview("guatemala");
    expect((await publicRoute.GET(unchangedRequest, context)).status).toBe(404);
    expect((await publicRoute.GET(get(), { params: Promise.resolve({ tripId: "guatemala", token: "0".repeat(64) }) })).status).toBe(404);
  });
  it("requires trip access to create, inspect or revoke a viewing link", async () => {
    expect((await previewRoute.POST(post({}), ctx())).status).toBe(401);
    expect((await previewRoute.GET(get(), ctx())).status).toBe(401);
    expect((await previewRoute.DELETE(new Request("http://localhost/api", { method: "DELETE" }), ctx())).status).toBe(401);
  });

  it("opens without a session, grants no editing access, and can be revoked and replaced", async () => {
    await join();
    expect(await (await previewRoute.GET(get(), ctx())).json()).toEqual({ path: null });
    const response = await previewRoute.POST(post({}), ctx());
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const { path } = await response.json();
    const token = path.split("/").at(-1);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await (await previewRoute.POST(post({}), ctx())).json()).toEqual({ path });
    const session = [...jar];
    jar.clear();
    expect((await previewTrip("guatemala", token))?.trip.id).toBe("guatemala");
    expect(jar.size).toBe(0);
    expect((await tripRoute.GET(get(), ctx())).status).toBe(401);
    expect((await opsRoute.POST(post({ ops: [] }), ctx())).status).toBe(401);
    expect(await previewTrip("guatemala", "0".repeat(64))).toBeNull();
    expect(await previewTrip("another-trip", token)).toBeNull();
    expect(await previewTrip("guatemala", "invalid")).toBeNull();
    session.forEach(([name, value]) => jar.set(name, value));
    await previewRoute.DELETE(new Request("http://localhost/api", { method: "DELETE" }), ctx());
    expect(await previewTrip("guatemala", token)).toBeNull();
    const replacement = await (await previewRoute.POST(post({}), ctx())).json();
    expect(replacement.path).not.toBe(path);
  });

  it("shows what a traveller needs on the road, and none of the group's private details", async () => {
    await join();
    const { trip } = await (await tripRoute.GET(get(), ctx())).json();
    const [first] = trip.items;
    const stay = trip.items.find((i: { kind: string }) => i.kind === "stay");
    const other = trip.items.find((i: { id: string; kind: string }) => i.id !== first.id && i.id !== stay.id);
    const changed = await opsRoute.POST(post({ confirmed: true, ops: [
      { op: "trip.update", set: { notes: "PRIVATE-TRIP-NOTE" } },
      { op: "item.update", id: first.id, set: {
        notes: "Door code PRIVATE-DOOR-CODE",
        who: "Privwho",
        contact: { phone: "+502 5555 0199", email: "private-host@example.com", whatsapp: "+502 5555 0198" },
        // The manage link carries the confirmation: whoever has it can change the booking.
        booking: { state: "booked", confirmation: "PRIVATE-CONFIRMATION", by: "Privbooker", price: { amount: 987, currency: "USD" }, note: "PRIVATE-BOOKING-NOTE", url: "https://example.com/manage/PRIVATE-CONFIRMATION" },
      } },
      { op: "item.update", id: stay.id, set: {
        notes: "PRIVATE-STAY-NOTE",
        contact: { phone: "+502 4444 0101", whatsapp: "+502 4444 0102", email: "host-private@example.com", website: "https://example.com/casa" },
        booking: { state: "booked", confirmation: "PRIVATE-STAY-CODE", by: "Privbooker", price: { amount: 987, currency: "USD" }, url: "https://example.com/casa/stay" },
      } },
      { op: "link.add", itemId: other.id, link: { id: "l1", url: "https://example.com/PRIVATE-LINK", kind: "booking", title: "PRIVATE-LINK-TITLE", addedBy: "Privlinker", addedAt: 1 } },
      { op: "link.add", itemId: stay.id, link: { id: "l2", url: "https://www.tiktok.com/@lake/video/7300000000000000001", kind: "tiktok", title: "Sunset from the dock", addedBy: "Privlinker", addedAt: 1 } },
      { op: "check.add", itemId: first.id, check: { id: "c1", text: "PRIVATE-CHECKLIST", done: false } },
      { op: "todo.add", todo: { id: "t1", text: "PRIVATE-TODO", done: false, who: "Privtodo" } },
    ] }), ctx());
    expect(changed.status).toBe(200);
    const { path } = await (await previewRoute.POST(post({}), ctx())).json();
    jar.clear();
    const shown = await previewTrip("guatemala", path.split("/").at(-1));
    const text = JSON.stringify(shown);
    for (const secret of ["PRIVATE-", "Privwho", "Privbooker", "Privlinker", "Privtodo", "Sam", "private-host", "host-private", "987"]) expect(text).not.toContain(secret);
    expect(shown!.trip.people).toEqual([]);
    expect(shown!.trip.todos).toEqual([]);
    expect(shown!.travelers).toBe(1);
    const item = shown!.trip.items.find((i) => i.id === first.id)!;
    expect(item.title).toBe(first.title);
    expect(item.start).toEqual(first.start);
    // A flight's contact is the group's own, not a business's; its manage link carries the confirmation.
    expect(item.contact).toBeUndefined();
    expect(item.booking).toEqual({ state: "booked" });
    // A stay's host: phone, WhatsApp and website to tap, never the email; its booking page; its saved TikTok.
    const shownStay = shown!.trip.items.find((i) => i.id === stay.id)!;
    expect(shownStay.contact).toEqual({ phone: "+502 4444 0101", whatsapp: "+502 4444 0102", website: "https://example.com/casa" });
    expect(shownStay.booking).toEqual({ state: "booked", url: "https://example.com/casa/stay" });
    expect(shownStay.links).toEqual([{ id: "l2", url: "https://www.tiktok.com/@lake/video/7300000000000000001", kind: "tiktok", title: "Sunset from the dock", addedAt: 0 }]);
    expect(shown!.trip.items.find((i) => i.id === other.id)!.links).toBeUndefined();
    expect(Object.keys(item).sort()).toEqual(Object.keys(publicTrip({ ...trip, items: [first] }).items[0]).sort());
  });

  it("blocks cross-site link creation and revocation", async () => {
    await join();
    expect((await previewRoute.POST(post({}, { "sec-fetch-site": "cross-site" }), ctx())).status).toBe(403);
    expect((await previewRoute.DELETE(new Request("http://localhost/api", { method: "DELETE", headers: { "sec-fetch-site": "cross-site" } }), ctx())).status).toBe(403);
  });
});

describe("joining", () => {
  it("keeps the trip private until joined", async () => {
    expect((await tripRoute.GET(get(), ctx())).status).toBe(401);
  });

  it("lets the first person set the passcode, then checks it", async () => {
    const first = await join("Sam", "volcano");
    expect(first.status).toBe(200);
    expect((await first.json()).passcodeSet).toBe(true);
    const res = await tripRoute.GET(get(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trip.schema).toBe(2);
    expect(body.me).toBe("Sam");

    jar.clear();
    expect((await join("Ana", "wrong")).status).toBe(403);
    expect((await join("Ana", "volcano")).status).toBe(200);
  });

  it("refuses a full name", async () => {
    expect((await join("Sam Smith")).status).toBe(400);
  });

  it("slows down passcode guessing", async () => {
    await join("Sam", "volcano");
    jar.clear();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await join("Eve", `guess${i}`)).status);
    expect(codes.at(-1)).toBe(429);
  });

  it("ignores a forged cookie", async () => {
    await join();
    const [name, value] = [...jar][0];
    jar.set(name, value.replace(/.$/, (c) => (c === "A" ? "B" : "A")));
    expect((await tripRoute.GET(get(), ctx())).status).toBe(401);
  });
});

describe("editing", () => {
  beforeEach(async () => {
    await join();
  });

  it("applies two edits made from the same old version", async () => {
    const a = await opsRoute.POST(post({ ops: [{ op: "item.update", id: "activity-zipline", set: { notes: "11 AM slot" } }] }), ctx());
    const b = await opsRoute.POST(post({ ops: [{ op: "todo.add", todo: { id: "t_sun", text: "Sunscreen", done: false } }] }), ctx());
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const { trip, version } = await (await tripRoute.GET(get(), ctx())).json();
    // Joining added Sam to the group (version 2), then the two edits.
    expect(trip.people).toContain("Sam");
    expect(version).toBe(4);
    expect(trip.todos.some((t: { id: string }) => t.id === "t_sun")).toBe(true);
  });

  it("asks before deleting something booked", async () => {
    const res = await opsRoute.POST(post({ ops: [{ op: "item.remove", id: "lodging-atitlan" }] }), ctx());
    expect(res.status).toBe(428);
    expect((await res.json()).needsConfirmation).toBe(true);
    const ok = await opsRoute.POST(post({ ops: [{ op: "item.remove", id: "lodging-atitlan" }], confirmed: true }), ctx());
    expect(ok.status).toBe(200);
  });

  it("doesn't apply a resend twice", async () => {
    const body = { ops: [{ op: "todo.add", todo: { id: "t_once", text: "Once", done: false } }], key: "k_12345678" };
    expect((await opsRoute.POST(post(body), ctx())).status).toBe(200);
    const again = await opsRoute.POST(post(body), ctx());
    expect(again.status).toBe(200);
    expect((await again.json()).replayed).toBe(true);
  });

  it("undoes a change after someone else's", async () => {
    const mine = await (await opsRoute.POST(post({ ops: [{ op: "item.update", id: "activity-zipline", set: { title: "Zipline!" } }] }), ctx())).json();
    await opsRoute.POST(post({ ops: [{ op: "todo.add", todo: { id: "t_other", text: "Other", done: false } }] }), ctx());
    const res = await undoRoute.POST(post({ entryId: mine.entry.id }), ctx());
    expect(res.status).toBe(200);
    const { trip } = await res.json();
    expect(trip.items.find((i: { id: string }) => i.id === "activity-zipline").title).toBe("Zip lining");
    expect(trip.todos.some((t: { id: string }) => t.id === "t_other")).toBe(true);
  });

  it("refuses writes from another site", async () => {
    const res = await opsRoute.POST(post({ ops: [] }, { origin: "https://evil.example", host: "localhost" }), ctx());
    expect(res.status).toBe(403);
  });
});

describe("creating a trip", () => {
  it("keeps the trip name, destination and home settings separate", async () => {
    const res = await tripsRoute.POST(post({ name: "Birthday getaway", destination: "Oaxaca, Mexico", startDate: "2027-03-01", endDate: "2027-03-04", tz: "America/Mexico_City", homeTz: "Europe/London", currency: "mxn", homeCurrency: "gbp", passcode: "abcd", me: "Ana" }));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const { trip } = await (await tripRoute.GET(get(), ctx(id))).json();
    expect(trip).toMatchObject({ name: "Birthday getaway", destination: "Oaxaca, Mexico", homeTz: "Europe/London", currency: "MXN", homeCurrency: "GBP", items: [] });
  });

  it.each([
    ["2027-02-30", "2027-03-04"],
    ["2027-03-04", "2027-03-01"],
  ])("rejects invalid trip dates %s to %s without creating a trip", async (startDate, endDate) => {
    const res = await tripsRoute.POST(post({ name: "Oaxaca", startDate, endDate, tz: "America/Mexico_City", passcode: "abcd", me: "Ana" }));
    expect(res.status).toBe(400);
    expect((await (await tripsRoute.GET()).json()).trips).toEqual([]);
  });

  it("creates, joins and lists it", async () => {
    const res = await tripsRoute.POST(
      post({ name: "Peru", startDate: "2027-03-01", endDate: "2027-03-10", tz: "America/Lima", currency: "pen", passcode: "llama", me: "Ana" }),
    );
    expect(res.status).toBe(200);
    const { id } = await res.json();
    expect(id).toMatch(/^peru-[a-z2-9]{8}$/);
    const list = await (await tripsRoute.GET()).json();
    expect(list.trips.map((t: { id: string }) => t.id)).toEqual([id]);
    const t = await (await tripRoute.GET(get(), ctx(id))).json();
    expect(t.trip.currency).toBe("PEN");
  });

  it("rejects an unknown time zone", async () => {
    const res = await tripsRoute.POST(post({ name: "X", startDate: "2027-03-01", endDate: "2027-03-02", tz: "Mars/Base", passcode: "abcd", me: "Ana" }));
    expect(res.status).toBe(400);
  });
});

describe("joining from one address", () => {
  it("lets a whole group join from the same wifi", async () => {
    await join("Sam", "volcano");
    for (let i = 0; i < 15; i++) {
      jar.clear();
      expect((await join(`Friend${String.fromCharCode(97 + i)}`, "volcano")).status).toBe(200);
    }
  });
});

describe("changing the passcode", () => {
  const change = (body: Record<string, unknown>) => meRoute.POST(post(body), ctx());

  it("needs the current passcode, even from a Google member who didn't make the trip", async () => {
    await join("Sam", "volcano");
    expect((await change({ newPasscode: "lava-rocks" })).status).toBe(403);
    expect((await change({ passcode: "wrong", newPasscode: "lava-rocks" })).status).toBe(403);
    expect((await change({ passcode: "volcano", newPasscode: "lava-rocks" })).status).toBe(200);
    jar.clear();
    expect((await join("Ana", "volcano")).status).toBe(403);
    expect((await join("Ana", "lava-rocks")).status).toBe(200);
  });

  it("stops guessing the current passcode", async () => {
    await join("Sam", "volcano");
    for (let i = 0; i < 10; i++) expect((await change({ passcode: `guess${i}`, newPasscode: "lava-rocks" })).status).toBe(403);
    expect((await change({ passcode: "volcano", newPasscode: "lava-rocks" })).status).toBe(429);
  });

  it("lets the Google account that made the trip change it without the old one", async () => {
    const store = getStore();
    const trip = { schema: 2 as const, id: "owned-trip", name: "Owned", destination: "Lima", startDate: "2027-03-01", endDate: "2027-03-03", tz: "America/Lima", currency: "PEN", people: ["Ana"], items: [], todos: [] };
    await store.create(trip, await hashPasscode("generated-pass"), "a".repeat(64));
    await store.rememberTrip("a".repeat(64), "owned-trip", "Ana");
    jar.set(ACCOUNT_COOKIE, seal("account", { id: "a".repeat(64), name: "Ana", email: "ana@example.com" }, 600));
    expect((await meRoute.POST(post({ newPasscode: "new-pass" }), ctx("owned-trip"))).status).toBe(200);
    jar.set(ACCOUNT_COOKIE, seal("account", { id: "b".repeat(64), name: "Bo", email: "bo@example.com" }, 600));
    await store.rememberTrip("b".repeat(64), "owned-trip", "Bo");
    expect((await meRoute.POST(post({ newPasscode: "bo-pass" }), ctx("owned-trip"))).status).toBe(403);
  });
});

describe("rate limits", () => {
  const from = (ip: string) => ({ "x-forwarded-for": ip });

  it("caps new trips per address", async () => {
    const body = { name: "Peru", startDate: "2027-03-01", endDate: "2027-03-10", tz: "America/Lima", currency: "pen", passcode: "llama", me: "Ana" };
    for (let i = 0; i < 20; i++) expect((await tripsRoute.POST(post(body, from("203.0.113.7")))).status).toBe(200);
    expect((await tripsRoute.POST(post(body, from("203.0.113.7")))).status).toBe(429);
    expect((await tripsRoute.POST(post(body, from("198.51.100.2")))).status).toBe(200);
  });

  it("caps link previews per address", async () => {
    await join();
    const who = await requester(new Request("http://localhost", { headers: from("203.0.113.9") }));
    for (let i = 0; i < 120; i++) await getStore().hit(`unfurl:${who}`, 3600);
    expect((await unfurlRoute.POST(post({ url: "https://example.com" }, from("203.0.113.9")), ctx())).status).toBe(429);
  });
});
