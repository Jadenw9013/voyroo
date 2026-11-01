import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/domain/types";
import type { ChangeResult } from "./ai/tools";

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
const tripRoute = await import("@/app/api/t/[tripId]/route");
const joinRoute = await import("@/app/api/t/[tripId]/join/route");
const opsRoute = await import("@/app/api/t/[tripId]/ops/route");
const undoRoute = await import("@/app/api/t/[tripId]/undo/route");
const previewRoute = await import("@/app/api/t/[tripId]/preview/route");
const { previewTrip } = await import("./preview");
const { buildTools } = await import("./ai/tools");
const { buildInstructions } = await import("./ai/prompt");

const ctx = { params: Promise.resolve({ tripId: "guatemala" }) };
const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ZIP = "activity-zipline";

/** Signs in as `name`; later requests are theirs until the next call. */
async function as(name: string) {
  jar.clear();
  expect((await joinRoute.POST(post({ name, passcode: "volcano" }), ctx)).status).toBe(200);
}
const send = async (ops: unknown[]) => opsRoute.POST(post({ ops }), ctx);
const zip = async () => ((await (await tripRoute.GET(new Request("http://localhost/api"), ctx)).json()).trip as Trip).items.find((i) => i.id === ZIP)!;

beforeEach(() => {
  jar.clear();
  setStoreForTests(new TripStore(new MemoryBackend()));
});

describe("votes and comments over the API", () => {
  it("lets each person change only their own", async () => {
    await as("Ana");
    const vote = await (await send([{ op: "reaction.set", itemId: ZIP, by: "Ana", vote: "in" }])).json();
    expect(vote.entry.summary).toEqual(["is in for “Zip lining”"]);
    const comment = { id: "m_ana1", by: "Ana", text: "Morning slot?", at: 1 };
    expect((await send([{ op: "comment.add", itemId: ZIP, comment }])).status).toBe(200);

    await as("Ben");
    const forged = await send([{ op: "reaction.set", itemId: ZIP, by: "Ana", vote: "out" }]);
    expect(forged.status).toBe(403);
    expect((await forged.json()).error).toBe("You can only change your own vote.");
    expect((await send([{ op: "comment.update", itemId: ZIP, commentId: "m_ana1", set: { text: "Ben was here", editedAt: 2 } }])).status).toBe(403);
    expect((await send([{ op: "comment.update", itemId: ZIP, commentId: "m_ana1", set: { text: "", deletedAt: 2 } }])).status).toBe(403);
    expect((await send([{ op: "comment.remove", itemId: ZIP, commentId: "m_ana1" }])).status).toBe(403);
    expect((await send([{ op: "comment.add", itemId: ZIP, comment: { id: "m_fake", by: "Ana", text: "Fake", at: 2 } }])).status).toBe(403);
    // Ben's own vote is fine, and nothing of Ana's moved.
    expect((await send([{ op: "reaction.set", itemId: ZIP, by: "Ben", vote: "maybe" }])).status).toBe(200);
    expect(await zip()).toMatchObject({ reactions: [{ by: "Ana", vote: "in" }, { by: "Ben", vote: "maybe" }], comments: [comment] });

    // Undo replays the inverse as whoever taps it: Ben can't undo Ana's vote, Ana can.
    expect((await undoRoute.POST(post({ entryId: vote.entry.id }), ctx)).status).toBe(403);
    await as("Ana");
    expect((await undoRoute.POST(post({ entryId: vote.entry.id }), ctx)).status).toBe(200);
    expect((await zip()).reactions).toEqual([{ by: "Ben", vote: "maybe" }]);
  });

  it("restores everyone's votes and comments when a removed item comes back", async () => {
    await as("Ana");
    await send([{ op: "reaction.set", itemId: ZIP, by: "Ana", heart: true }, { op: "comment.add", itemId: ZIP, comment: { id: "m_ana2", by: "Ana", text: "Love this", at: 1 } }]);
    await as("Ben");
    const removed = await (await send([{ op: "item.remove", id: ZIP }])).json();
    // Sending the item back by hand would forge Ana's words; undo restores it.
    const restored = removed.entry.inverse[0];
    expect((await send([restored])).status).toBe(403);
    expect((await undoRoute.POST(post({ entryId: removed.entry.id }), ctx)).status).toBe(200);
    expect(await zip()).toMatchObject({ reactions: [{ by: "Ana", heart: true }], comments: [{ by: "Ana", text: "Love this" }] });
  });

  it("keeps votes and comments off the view-only link", async () => {
    await as("Ana");
    await send([{ op: "reaction.set", itemId: ZIP, by: "Ana", vote: "in" }, { op: "comment.add", itemId: ZIP, comment: { id: "m_secret", by: "Ana", text: "PRIVATE-THREAD-TEXT", at: 1 } }]);
    const { path } = await (await previewRoute.POST(post({}), ctx)).json();
    jar.clear();
    const shown = await previewTrip("guatemala", path.split("/").at(-1));
    expect(shown?.trip.items.some((i) => i.id === ZIP)).toBe(true);
    expect(JSON.stringify(shown)).not.toContain("PRIVATE-THREAD-TEXT");
    expect(shown?.trip.items.some((i) => i.reactions || i.comments)).toBe(false);
    // The stored trip still has them.
    expect(JSON.stringify((await getStore().get("guatemala"))!.trip)).toContain("PRIVATE-THREAD-TEXT");
  });
});

describe("the assistant and group decisions", () => {
  async function setup() {
    const store = getStore();
    await store.get("guatemala");
    await store.apply("guatemala", [{ op: "reaction.set", itemId: ZIP, by: "Ana", vote: "in" }], { author: "Ana" });
    await store.apply("guatemala", [{ op: "reaction.set", itemId: ZIP, by: "Ben", vote: "out", heart: true }], { author: "Ben" });
    const tools = buildTools({ store, tripId: "guatemala", me: "Ana", trip: async () => (await store.get("guatemala"))!.trip });
    return { store, tools };
  }

  it("sees who's in, who's out and who hearted, and the open item's thread", async () => {
    const { store } = await setup();
    await store.apply("guatemala", [{ op: "comment.add", itemId: ZIP, comment: { id: "m_c1", by: "Ben", text: "Too pricey for me", at: 1 } }], { author: "Ben" });
    const trip = (await store.get("guatemala"))!.trip;
    const prompt = buildInstructions(trip, { me: "Ana", nowMs: Date.parse("2026-11-01T12:00:00Z"), day: null, itemId: ZIP });
    expect(prompt).toContain('"votes":{"in":["Ana"],"notForMe":["Ben"],"hearts":["Ben"]}');
    expect(prompt).toContain('"comments":["Ben: Too pricey for me"]');
    expect(prompt).toContain("Never vote or heart for anyone");
    const elsewhere = buildInstructions(trip, { me: "Ana", nowMs: Date.parse("2026-11-01T12:00:00Z"), day: null, itemId: null });
    expect(elsewhere).toContain('"comments":1');
    expect(elsewhere).not.toContain("Too pricey");
  });

  it("posts a comment for the person asking, marked as the assistant's, and has no way to vote", async () => {
    const { store, tools } = await setup();
    expect(Object.keys(tools).some((k) => /vote|react|heart/.test(k))).toBe(false);
    const run = tools.add_comment.execute as (i: unknown, o: unknown) => Promise<ChangeResult>;
    const r = await run({ itemId: ZIP, text: "Count me in for 9 AM" }, { toolCallId: "t", messages: [] });
    expect(r).toMatchObject({ ok: true, summary: ["commented on “Zip lining”"] });
    const item = (await store.get("guatemala"))!.trip.items.find((i) => i.id === ZIP)!;
    expect(item.comments?.at(-1)).toMatchObject({ by: "Ana", text: "Count me in for 9 AM", viaAssistant: true });
    expect((await store.history("guatemala", 1))[0].author).toBe("Ana via assistant");
    expect(await run({ itemId: "nope", text: "x" }, { toolCallId: "t", messages: [] })).toMatchObject({ ok: false });
  });

  it("can't vote even through a raw op", async () => {
    const { store } = await setup();
    const r = await store.apply("guatemala", [{ op: "reaction.set", itemId: ZIP, by: "Ana", vote: "maybe" }], { author: "Ana via assistant" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason === "invalid" && r.issues[0].code).toBe("forbidden");
  });
});
