import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const historyRoute = await import("@/app/api/t/[tripId]/history/route");
const packingRoute = await import("@/app/api/t/[tripId]/packing/route");

const ctx = () => ({ params: Promise.resolve({ tripId: "guatemala" }) });
const post = (body: unknown = {}) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const get = (url = "http://localhost/api") => new Request(url);

async function joinAs(name: string) {
  jar.clear();
  return joinRoute.POST(post({ name, passcode: "volcano" }), ctx());
}

beforeEach(() => {
  jar.clear();
  setStoreForTests(new TripStore(new MemoryBackend()));
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("CHAT_MOCK", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("packing suggestions", () => {
  it("needs a session", async () => {
    expect((await packingRoute.GET(get(), ctx())).status).toBe(401);
    expect((await packingRoute.POST(post(), ctx())).status).toBe(401);
  });

  it("says suggestions are off, and refuses them, without the assistant", async () => {
    await joinAs("Sam");
    expect(await (await packingRoute.GET(get(), ctx())).json()).toEqual({ suggest: false });
    const res = await packingRoute.POST(post(), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/isn't set up/);
  });

  it("returns a list to review from the plan, and adds nothing", async () => {
    vi.stubEnv("CHAT_MOCK", "1");
    await joinAs("Sam");
    expect(await (await packingRoute.GET(get(), ctx())).json()).toEqual({ suggest: true });
    const before = await (await tripRoute.GET(get(), ctx())).json();
    const { suggestions } = await (await packingRoute.POST(post(), ctx())).json();
    expect(suggestions).toContainEqual(expect.objectContaining({ text: "Headlamp", kind: "personal", itemId: "hike-acatenango" }));
    expect(suggestions).toContainEqual(expect.objectContaining({ text: "Dry bag", kind: "shared", quantity: 2 }));
    const after = await (await tripRoute.GET(get(), ctx())).json();
    expect(after.version).toBe(before.version);
    expect(after.trip.packing).toBeUndefined();
  });

  it("skips what you already listed, but not what's on someone else's own list", async () => {
    vi.stubEnv("CHAT_MOCK", "1");
    await joinAs("Ben");
    await opsRoute.POST(post({ ops: [{ op: "pack.add", entry: { id: "p_ben_lamp", text: "Headlamp", kind: "personal", owner: "Ben" } }] }), ctx());
    const ben = await (await packingRoute.POST(post(), ctx())).json();
    expect(ben.suggestions.map((s: { text: string }) => s.text)).not.toContain("Headlamp");
    await joinAs("Sam");
    const sam = await (await packingRoute.POST(post(), ctx())).json();
    expect(sam.suggestions.map((s: { text: string }) => s.text)).toContain("Headlamp");
  });
});

describe("packing through the ops route", () => {
  it("saves, keeps personal text out of the history, and undoes", async () => {
    await joinAs("Sam");
    const add = await opsRoute.POST(
      post({
        ops: [
          { op: "pack.add", entry: { id: "p_inhaler", text: "Inhaler", kind: "personal", owner: "Sam", category: "health" } },
          { op: "pack.add", entry: { id: "p_speaker", text: "Speaker", kind: "shared", category: "tech" } },
        ],
      }),
      ctx(),
    );
    expect(add.status).toBe(200);
    const { entry } = await add.json();
    await joinAs("Ben");
    expect((await opsRoute.POST(post({ ops: [{ op: "pack.claim", id: "p_speaker", who: "Ben" }] }), ctx())).status).toBe(200);
    const { entries } = await (await historyRoute.GET(get("http://localhost/api?limit=10"), ctx())).json();
    const lines = entries.flatMap((e: { summary: string[] }) => e.summary);
    expect(lines).toContain("added to their own packing list");
    expect(lines).toContain("put Ben down to bring “Speaker”");
    expect(JSON.stringify(lines)).not.toContain("Inhaler");

    // Sam taking it now is refused: Ben said first.
    await joinAs("Sam");
    const late = await opsRoute.POST(post({ ops: [{ op: "pack.claim", id: "p_speaker", who: "Sam" }] }), ctx());
    expect(late.status).toBe(422);
    expect((await late.json()).error).toBe("Ben is already bringing “Speaker”.");

    // Undoing Sam's add removes both entries, and Ben's claim with the speaker.
    const undo = await undoRoute.POST(post({ entryId: entry.id }), ctx());
    expect(undo.status).toBe(200);
    expect((await undo.json()).trip.packing).toBeUndefined();
  });
});
