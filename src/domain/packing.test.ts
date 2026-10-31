import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import { prepareChange, tripProblems } from "./change";
import { applyOp, describeOp, type Op } from "./ops";
import { cleanSuggestions, guessCategory, isPacked, parsePackLine, sameThing, suggestionEntry, visiblePacking } from "./packing";
import { parseLine } from "./parse";
import { TripSchema } from "./schema";
import type { PackEntry, Trip, TripState } from "./types";

const seed = seedTrip();
const speaker: PackEntry = { id: "p_speaker", text: "Speaker", kind: "shared", category: "tech" };
const socks: PackEntry = { id: "p_socks", text: "Wool socks", kind: "personal", owner: "Ben", category: "clothes" };
const withPacking = (packing: PackEntry[] = [speaker, socks]): Trip => ({ ...seed, people: ["Sam", "Ben"], packing });
const state = (trip: Trip, version = 1): TripState => ({ trip, version });

/** Applies ops the way the store does, then their inverse, and returns both trips. */
function roundTrip(trip: Trip, ops: Op[], author = "Sam") {
  const done = prepareChange(state(trip), ops, { author });
  if (!done.ok) throw new Error(done.issues.map((i) => i.message).join("; "));
  const undone = prepareChange(state(done.trip, 2), done.entry.inverse, { author, confirmed: true });
  if (!undone.ok) throw new Error(undone.issues.map((i) => i.message).join("; "));
  return { after: done.trip, undone: undone.trip, entry: done.entry };
}

describe("packing ops", () => {
  it("adds to a trip that had no list, and undo leaves it as it was", () => {
    const { after, undone } = roundTrip(seed, [{ op: "pack.add", entry: speaker }]);
    expect(after.packing).toEqual([speaker]);
    expect(undone).toEqual(seed);
    expect("packing" in undone).toBe(false);
  });

  it("puts a removed entry back in its place", () => {
    const trip = withPacking([speaker, socks, { id: "p_lamp", text: "Headlamp", kind: "shared" }]);
    const { after, undone } = roundTrip(trip, [{ op: "pack.remove", id: "p_socks" }]);
    expect(after.packing?.map((p) => p.id)).toEqual(["p_speaker", "p_lamp"]);
    expect(undone.packing).toEqual(trip.packing);
  });

  it("drops the list when the last entry goes", () => {
    const r = applyOp(withPacking([speaker]), { op: "pack.remove", id: "p_speaker" });
    expect("packing" in r.trip).toBe(false);
  });

  it("edits and undoes: null clears a field, undo puts it back", () => {
    const trip = withPacking([{ ...speaker, quantity: 2, itemId: "hike-acatenango" }]);
    const { after, undone } = roundTrip(trip, [{ op: "pack.update", id: "p_speaker", set: { text: "Bluetooth speaker", quantity: null, itemId: null } }]);
    expect(after.packing?.[0]).toEqual({ id: "p_speaker", text: "Bluetooth speaker", kind: "shared", category: "tech" });
    expect(undone).toEqual(trip);
  });

  it("moves an entry onto someone's own list and back", () => {
    const trip = withPacking([{ ...speaker, assignee: "Ben", packedBy: ["Ben"] }]);
    const move: Op = { op: "pack.update", id: "p_speaker", set: { kind: "personal", owner: "Sam", assignee: null, packedBy: null } };
    const { after, undone } = roundTrip(trip, [move]);
    expect(after.packing?.[0]).toMatchObject({ kind: "personal", owner: "Sam" });
    expect(after.packing?.[0].assignee).toBeUndefined();
    expect(undone).toEqual(trip);
  });

  it("refuses an entry that's both shared and someone's own", () => {
    const bad = prepareChange(state(withPacking()), [{ op: "pack.update", id: "p_speaker", set: { kind: "personal" } }], { author: "Sam" });
    expect(bad.ok).toBe(false);
    expect(tripProblems(withPacking([{ ...speaker, owner: "Sam" }]))).toContain("“Speaker” is on the shared list, so it isn't anyone's own.");
    expect(tripProblems(withPacking([{ ...socks, assignee: "Sam" }])).length).toBe(1);
  });

  it("claims something nobody's bringing, and undo frees it again", () => {
    const { after, undone } = roundTrip(withPacking(), [{ op: "pack.claim", id: "p_speaker", who: "Sam" }]);
    expect(after.packing?.[0].assignee).toBe("Sam");
    expect(undone.packing?.[0].assignee).toBeUndefined();
  });

  it("won't let a second person take what someone already said they'd bring", () => {
    const taken = withPacking([{ ...speaker, assignee: "Ben" }]);
    const r = prepareChange(state(taken), [{ op: "pack.claim", id: "p_speaker", who: "Sam" }], { author: "Sam" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].message).toBe("Ben is already bringing “Speaker”.");
    // Ben can say "Not me", and then Sam can take it.
    const freed = applyOp(taken, { op: "pack.claim", id: "p_speaker", who: null }).trip;
    expect(applyOp(freed, { op: "pack.claim", id: "p_speaker", who: "Sam" }).trip.packing?.[0].assignee).toBe("Sam");
  });

  it("an offline claim that lands after someone else's is refused, not overwritten", () => {
    // Both phones saw version 1 with nobody bringing it; Ben's reached the server first.
    const ben = prepareChange(state(withPacking()), [{ op: "pack.claim", id: "p_speaker", who: "Ben" }], { author: "Ben" });
    expect(ben.ok).toBe(true);
    if (!ben.ok) return;
    const sam = prepareChange(state(ben.trip, 2), [{ op: "pack.claim", id: "p_speaker", who: "Sam" }], { author: "Sam" });
    expect(sam.ok).toBe(false);
  });

  it("keeps two people's ticks made against the same version", () => {
    const trip = withPacking([{ ...speaker, quantity: 2 }]);
    const ben = prepareChange(state(trip), [{ op: "pack.check", id: "p_speaker", who: "Ben", packed: true }], { author: "Ben" });
    if (!ben.ok) throw new Error("ben");
    const sam = prepareChange(state(ben.trip, 2), [{ op: "pack.check", id: "p_speaker", who: "Sam", packed: true }], { author: "Sam" });
    if (!sam.ok) throw new Error("sam");
    expect(sam.trip.packing?.[0].packedBy).toEqual(["Ben", "Sam"]);
    // Undoing Ben's tick leaves Sam's.
    const undo = prepareChange(state(sam.trip, 3), ben.entry.inverse, { author: "Ben" });
    if (!undo.ok) throw new Error("undo");
    expect(undo.trip.packing?.[0].packedBy).toEqual(["Sam"]);
  });

  it("unticking the last tick drops packedBy; ticking twice is harmless", () => {
    const trip = withPacking([{ ...speaker, packedBy: ["Sam"] }]);
    expect(applyOp(trip, { op: "pack.check", id: "p_speaker", who: "Sam", packed: false }).trip.packing?.[0]).toEqual(speaker);
    const twice = applyOp(trip, { op: "pack.check", id: "p_speaker", who: "Sam", packed: true });
    expect(twice.trip.packing?.[0].packedBy).toEqual(["Sam"]);
    expect(twice.inverse).toEqual([{ op: "pack.check", id: "p_speaker", who: "Sam", packed: true }]);
  });

  it("only the owner ticks their own list", () => {
    expect(() => applyOp(withPacking(), { op: "pack.check", id: "p_socks", who: "Sam", packed: true })).toThrow(/Only its owner/);
    expect(isPacked(applyOp(withPacking(), { op: "pack.check", id: "p_socks", who: "Ben", packed: true }).trip.packing![1])).toBe(true);
  });

  it("says plainly when an entry is gone", () => {
    expect(() => applyOp(withPacking(), { op: "pack.check", id: "p_gone", who: "Sam", packed: true })).toThrow(/no longer on the packing list/);
    expect(() => applyOp(withPacking(), { op: "pack.add", entry: speaker })).toThrow(/already on the packing list/);
  });
});

describe("packing privacy", () => {
  it("shows the shared list to everyone and personal entries only to their owner", () => {
    const trip = withPacking([speaker, socks, { id: "p_meds", text: "Inhaler", kind: "personal", owner: "Sam" }]);
    expect(visiblePacking(trip, "Sam")).toEqual({ shared: [speaker], mine: [trip.packing![2]] });
    expect(visiblePacking(trip, "Ben").mine).toEqual([socks]);
    expect(visiblePacking(trip, "Cara")).toEqual({ shared: [speaker], mine: [] });
    expect(visiblePacking(seed, "Sam")).toEqual({ shared: [], mine: [] });
  });

  it("never puts what's on someone's own list in the group's history", () => {
    const trip = withPacking();
    const lines = [
      describeOp(trip, { op: "pack.add", entry: { ...socks, id: "p_new" } }),
      describeOp(trip, { op: "pack.update", id: "p_socks", set: { text: "Merino socks" } }),
      describeOp(trip, { op: "pack.check", id: "p_socks", who: "Ben", packed: true }),
      describeOp(trip, { op: "pack.remove", id: "p_socks" }),
    ];
    for (const l of lines) expect(l).not.toMatch(/socks/i);
    expect(lines[0]).toBe("added to their own packing list");
  });

  it("describes shared changes in plain words", () => {
    const trip = withPacking();
    expect(describeOp(trip, { op: "pack.add", entry: { ...speaker, id: "p_x", assignee: "Ben" } })).toBe("put Ben down to bring “Speaker”");
    expect(describeOp(trip, { op: "pack.claim", id: "p_speaker", who: "Sam" })).toBe("put Sam down to bring “Speaker”");
    expect(describeOp(trip, { op: "pack.check", id: "p_speaker", who: "Sam", packed: true })).toBe("packed “Speaker”");
    expect(describeOp(trip, { op: "pack.remove", id: "p_speaker" })).toBe("removed “Speaker” from the packing list");
  });
});

describe("trips from before the packing list", () => {
  it("still validate and read as an empty list", () => {
    expect("packing" in seed).toBe(false);
    expect(TripSchema.safeParse(seed).success).toBe(true);
    expect(tripProblems(seed)).toEqual([]);
    expect(visiblePacking(seed, "Sam").shared).toEqual([]);
  });

  it("validate with a list too", () => {
    expect(TripSchema.safeParse(withPacking()).success).toBe(true);
  });
});

describe("quick add", () => {
  it("reads 'pack sunscreen' as your own list", () => {
    expect(parsePackLine("pack sunscreen")).toEqual({ text: "Sunscreen", kind: "personal", category: "toiletries" });
    expect(parsePackLine("don't forget the passport")).toMatchObject({ text: "Passport", kind: "personal", category: "documents" });
  });

  it("reads 'bring speaker - Ben' as the group's, with Ben bringing it", () => {
    expect(parsePackLine("bring speaker - Ben")).toEqual({ text: "Speaker", kind: "shared", assignee: "Ben", category: "tech" });
    expect(parsePackLine("Ben brings the cards")).toMatchObject({ text: "Cards", kind: "shared", assignee: "Ben" });
    expect(parsePackLine("Ben'll bring a frisbee")).toMatchObject({ text: "Frisbee", assignee: "Ben" });
    expect(parsePackLine("bring first-aid kit")).toEqual({ text: "First-aid kit", kind: "shared", category: "health" });
  });

  it("knows 'I'll bring' means you, and a dash name moves it to the group", () => {
    expect(parsePackLine("I'll bring the speaker")).toMatchObject({ text: "Speaker", kind: "shared", self: true });
    expect(parsePackLine("bring speaker - me")).toMatchObject({ self: true });
    expect(parsePackLine("pack dry bag - Cara")).toMatchObject({ kind: "shared", assignee: "Cara" });
    expect(parsePackLine("bring snacks - someone")).toEqual({ text: "Snacks", kind: "shared", category: "snacks" });
  });

  it("reads how many", () => {
    expect(parsePackLine("bring 2 dry bags")).toMatchObject({ text: "Dry bags", quantity: 2, category: "gear" });
    expect(parsePackLine("pack headlamp x4")).toMatchObject({ text: "Headlamp", quantity: 4 });
    expect(parsePackLine("pack 1 towel")).toEqual({ text: "Towel", kind: "personal", category: "gear" });
  });

  it("leaves plans, questions and 'pack up' alone", () => {
    expect(parsePackLine("pack up and check out 10am")).toBeNull();
    expect(parsePackLine("dinner thu 7")).toBeNull();
    expect(parsePackLine("pack")).toBeNull();
    const ctx = { trip: seed, nowMs: Date.parse("2026-10-31T12:00:00Z") };
    expect(parseLine("pack sunscreen", ctx).type).toBe("pack");
    expect(parseLine("what should we pack?", ctx).type).toBe("ask");
    expect(parseLine("pack up and check out 10am", ctx).type).toBe("item");
  });

  it("guesses a category", () => {
    expect(guessCategory("Sunglasses")).toBe("gear");
    expect(guessCategory("Rain jacket")).toBe("clothes");
    expect(guessCategory("Power bank")).toBe("tech");
    expect(guessCategory("Bug spray")).toBe("toiletries");
    expect(guessCategory("Ukulele")).toBe("other");
  });
});

describe("suggestions", () => {
  it("keeps good ones, links only real items, and skips what's already listed", () => {
    const trip = withPacking([speaker, { id: "p_lamp", text: "Headlamp", kind: "personal", owner: "Sam" }]);
    const raw = [
      { text: "Headlamps", kind: "personal", category: "gear", itemId: "hike-acatenango" },
      { text: "Warm layers", kind: "personal", category: "clothes", itemId: "hike-acatenango", why: "Near freezing at the summit." },
      { text: "Dry bag", kind: "shared", category: "nonsense", itemId: "made-up-item", quantity: 2 },
      { text: "a speaker", kind: "shared" },
      { text: "dry-bag", kind: "shared" },
      { text: "", kind: "shared" },
      "not an object",
    ];
    expect(cleanSuggestions(raw, trip, "Sam")).toEqual([
      { text: "Warm layers", kind: "personal", category: "clothes", itemId: "hike-acatenango", why: "Near freezing at the summit." },
      { text: "Dry bag", kind: "shared", category: "gear", quantity: 2 },
    ]);
  });

  it("doesn't count someone else's own list as already listed", () => {
    const trip = withPacking([socks]);
    expect(cleanSuggestions([{ text: "Wool socks", kind: "personal" }], trip, "Sam")).toHaveLength(1);
    expect(cleanSuggestions([{ text: "Wool socks", kind: "personal" }], trip, "Ben")).toHaveLength(0);
  });

  it("caps how many come back", () => {
    const raw = Array.from({ length: 40 }, (_, i) => ({ text: `Thing ${i}`, kind: "shared" }));
    expect(cleanSuggestions(raw, seed, "Sam")).toHaveLength(20);
  });

  it("becomes an entry on the right list", () => {
    expect(suggestionEntry({ text: "Layers", kind: "personal", category: "clothes" }, "p_1", "Sam")).toEqual({ id: "p_1", text: "Layers", kind: "personal", owner: "Sam", category: "clothes" });
    expect(suggestionEntry({ text: "Dry bag", kind: "shared", category: "gear", itemId: "x" }, "p_2", "Sam")).toEqual({ id: "p_2", text: "Dry bag", kind: "shared", itemId: "x", category: "gear" });
  });

  it("treats spelling variants as the same thing", () => {
    expect(sameThing("Dry bags", "a dry-bag")).toBe(true);
    expect(sameThing("Sunscreen", "Sunglasses")).toBe(false);
  });
});
