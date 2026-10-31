import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import { prepareChange, tripProblems, type ChangeMeta } from "./change";
import { actorOf, commentMark, deleteComment, editComment, forbidden, heartOp, liveComments, mostWanted, newComment, tally, tallyLabel, unread, voteOp, withoutDiscussion } from "./discuss";
import { migrateV1, type V1Trip } from "./migrate";
import { applyOp, describeOp, itemsTouched, type Op } from "./ops";
import { OpSchema, TripSchema } from "./schema";
import type { Comment, Item, Trip, TripState } from "./types";

const base: Trip = { ...seedTrip(), people: ["Ana", "Ben", "Cara", "Dee"] };
const state = (trip: Trip = base, version = 1): TripState => ({ trip, version });
const ZIP = "activity-zipline";
const item = (trip: Trip, id = ZIP) => trip.items.find((i) => i.id === id)!;

/** Applies ops as `author`, failing the test if they don't apply. */
function run(trip: Trip, ops: Op[], author = "Ana", extra: Partial<ChangeMeta> = {}): { trip: Trip; inverse: Op[]; summary: string[] } {
  const r = prepareChange(state(trip), ops, { author, ...extra });
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join(" "));
  return { trip: r.trip, inverse: r.entry.inverse, summary: r.entry.summary };
}

/** The first problem with `ops` as `author`, if any. */
function refusal(trip: Trip, ops: Op[], author: string, extra: Partial<ChangeMeta> = {}) {
  const r = prepareChange(state(trip), ops, { author, ...extra });
  return r.ok ? null : r.issues[0];
}

const comment = (by: string, text: string, id = `m_${by.toLowerCase()}`, at = 1000): Comment => ({ id, by, text, at });

describe("reactions", () => {
  it("records a vote, changes it, and takes it back", () => {
    let t = run(base, [voteOp(item(base), "Ana", "in")]).trip;
    expect(item(t).reactions).toEqual([{ by: "Ana", vote: "in" }]);
    t = run(t, [voteOp(item(t), "Ana", "maybe")]).trip;
    expect(item(t).reactions).toEqual([{ by: "Ana", vote: "maybe" }]);
    // Tapping your answer again clears it, and an empty list goes away.
    t = run(t, [voteOp(item(t), "Ana", "maybe")]).trip;
    expect(item(t).reactions).toBeUndefined();
  });

  it("keeps the heart separate from the vote", () => {
    let t = run(base, [voteOp(item(base), "Ana", "out")]).trip;
    t = run(t, [heartOp(item(t), "Ana")]).trip;
    expect(item(t).reactions).toEqual([{ by: "Ana", vote: "out", heart: true }]);
    t = run(t, [voteOp(item(t), "Ana", "out")]).trip;
    expect(item(t).reactions).toEqual([{ by: "Ana", heart: true }]);
  });

  it("undoes every kind of change exactly", () => {
    const steps: ((t: Trip) => Op)[] = [
      (t) => voteOp(item(t), "Ana", "in"),
      (t) => heartOp(item(t), "Ana"),
      (t) => voteOp(item(t), "Ana", "out"),
      (t) => voteOp(item(t), "Ana", "out"),
      (t) => heartOp(item(t), "Ana"),
    ];
    let t = run(base, [voteOp(item(base), "Ben", "in")], "Ben").trip;
    for (const step of steps) {
      const before = t;
      const r = run(before, [step(before)]);
      const back = run(r.trip, r.inverse);
      expect(item(back.trip).reactions).toEqual(item(before).reactions);
      t = r.trip;
    }
  });

  it("refuses a reaction that changes nothing", () => {
    expect(() => applyOp(base, { op: "reaction.set", itemId: ZIP, by: "Ana" })).toThrow("Nothing to change");
  });

  it("says what happened in the history", () => {
    expect(describeOp(base, voteOp(item(base), "Ana", "in"))).toBe("is in for “Zip lining”");
    expect(describeOp(base, voteOp(item(base), "Ana", "maybe"))).toBe("is a maybe for “Zip lining”");
    expect(describeOp(base, voteOp(item(base), "Ana", "out"))).toBe("passed on “Zip lining”");
    expect(describeOp(base, { op: "reaction.set", itemId: ZIP, by: "Ana", vote: null })).toBe("took back their vote on “Zip lining”");
    expect(describeOp(base, heartOp(item(base), "Ana"))).toBe("hearted “Zip lining”");
    expect(itemsTouched(voteOp(item(base), "Ana", "in"))).toEqual([ZIP]);
  });
});

describe("comments", () => {
  it("posts, edits, deletes and removes, each undone exactly", () => {
    const post = newComment(ZIP, "Ana", "  Morning slot?  ", 1000);
    const posted = run(base, [post]);
    const c = item(posted.trip).comments![0];
    expect(c).toMatchObject({ by: "Ana", text: "Morning slot?", at: 1000 });
    expect(posted.summary).toEqual(["commented on “Zip lining”"]);
    expect(item(run(posted.trip, posted.inverse).trip).comments).toBeUndefined();

    const edited = run(posted.trip, [editComment(ZIP, c, "Morning slot, 9 AM?", 2000)]);
    expect(item(edited.trip).comments![0]).toMatchObject({ text: "Morning slot, 9 AM?", editedAt: 2000 });
    expect(edited.summary).toEqual(["edited a comment on “Zip lining”"]);
    expect(item(run(edited.trip, edited.inverse).trip).comments).toEqual(item(posted.trip).comments);

    const deleted = run(edited.trip, [deleteComment(ZIP, item(edited.trip).comments![0], 3000)]);
    expect(item(deleted.trip).comments![0]).toMatchObject({ text: "", deletedAt: 3000 });
    expect(deleted.summary).toEqual(["deleted a comment on “Zip lining”"]);
    expect(liveComments(item(deleted.trip))).toEqual([]);
    expect(item(run(deleted.trip, deleted.inverse).trip).comments).toEqual(item(edited.trip).comments);

    const removed = run(deleted.trip, [{ op: "comment.remove", itemId: ZIP, commentId: c.id }]);
    expect(item(removed.trip).comments).toBeUndefined();
    expect(item(run(removed.trip, removed.inverse).trip).comments).toEqual(item(deleted.trip).comments);
  });

  it("keeps the thread's order when a removal is undone", () => {
    const t = run(base, [newComment(ZIP, "Ana", "one", 1), newComment(ZIP, "Ana", "two", 2), newComment(ZIP, "Ana", "three", 3)]).trip;
    const middle = item(t).comments![1];
    const r = run(t, [{ op: "comment.remove", itemId: ZIP, commentId: middle.id }]);
    expect(item(run(r.trip, r.inverse).trip).comments!.map((c) => c.text)).toEqual(["one", "two", "three"]);
  });

  it("needs words, unless it's deleted, and then has none", () => {
    const t = run(base, [newComment(ZIP, "Ana", "hi", 1)]).trip;
    const c = item(t).comments![0];
    expect(refusal(t, [{ op: "comment.update", itemId: ZIP, commentId: c.id, set: { text: "" } }], "Ana")?.message).toBe("A comment needs some words.");
    expect(refusal(t, [{ op: "comment.update", itemId: ZIP, commentId: c.id, set: { deletedAt: 5 } }], "Ana")?.message).toBe("A deleted comment keeps no words.");
    expect(OpSchema.safeParse(newComment(ZIP, "Ana", "   ", 1)).success).toBe(false);
  });

  it("says when the comment is gone", () => {
    expect(refusal(base, [{ op: "comment.update", itemId: ZIP, commentId: "m_gone", set: { text: "x" } }], "Ana")).toMatchObject({ code: "missing" });
    expect(refusal(base, [newComment("no-such-item", "Ana", "x")], "Ana")).toMatchObject({ code: "missing" });
  });

  it("refuses the same comment twice", () => {
    const op = newComment(ZIP, "Ana", "once", 1);
    expect(refusal(run(base, [op]).trip, [op], "Ana")).toMatchObject({ code: "duplicate" });
  });
});

describe("only your own", () => {
  const withAna = run(base, [voteOp(item(base), "Ana", "in"), { op: "comment.add", itemId: ZIP, comment: comment("Ana", "I'm keen") }]).trip;
  const anas = item(withAna).comments![0];

  it("knows a person from the assistant acting for them", () => {
    expect(actorOf("Ana")).toEqual({ name: "Ana", assistant: false });
    expect(actorOf("Ana via assistant")).toEqual({ name: "Ana", assistant: true });
  });

  it("lets nobody change someone else's vote", () => {
    expect(refusal(withAna, [{ op: "reaction.set", itemId: ZIP, by: "Ana", vote: null }], "Ben")).toEqual({ index: 0, code: "forbidden", message: "You can only change your own vote." });
    expect(item(run(withAna, [voteOp(item(withAna), "Ben", "out")], "Ben").trip).reactions).toHaveLength(2);
  });

  it("lets nobody comment as, edit or delete for someone else", () => {
    expect(refusal(withAna, [newComment(ZIP, "Ana", "Pretending")], "Ben")?.message).toBe("You can only comment as yourself.");
    expect(refusal(withAna, [editComment(ZIP, anas, "Changed")], "Ben")?.message).toBe("You can only edit or delete your own comments.");
    expect(refusal(withAna, [deleteComment(ZIP, anas)], "Ben")?.code).toBe("forbidden");
    expect(refusal(withAna, [{ op: "comment.remove", itemId: ZIP, commentId: anas.id }], "Ben")?.code).toBe("forbidden");
    expect(refusal(withAna, [editComment(ZIP, anas, "Changed")], "Ana")).toBeNull();
  });

  it("refuses a whole batch if any op isn't yours", () => {
    const r = refusal(withAna, [{ op: "item.update", id: ZIP, set: { notes: "fine" } }, deleteComment(ZIP, anas)], "Ben");
    expect(r).toMatchObject({ index: 1, code: "forbidden" });
  });

  it("doesn't let undo change someone else's vote or comment", () => {
    // Ana's vote, undone by Ben: the inverse sets Ana's reaction, so it's refused.
    const vote = run(base, [voteOp(item(base), "Ana", "in")]);
    expect(refusal(vote.trip, vote.inverse, "Ben", { undoOf: "e1", confirmed: true })?.code).toBe("forbidden");
    expect(refusal(vote.trip, vote.inverse, "Ana", { undoOf: "e1", confirmed: true })).toBeNull();
    const post = run(base, [newComment(ZIP, "Ana", "hi", 1)]);
    expect(refusal(post.trip, post.inverse, "Ben", { undoOf: "e2", confirmed: true })?.code).toBe("forbidden");
  });

  it("brings back everyone's votes and comments when a removed item is restored", () => {
    const removed = run(withAna, [{ op: "item.remove", id: ZIP }], "Ben");
    const restored = run(removed.trip, removed.inverse, "Ben", { undoOf: "e3", confirmed: true });
    expect(item(restored.trip)).toEqual(item(withAna));
  });

  it("doesn't let a new item arrive with other people's votes or comments", () => {
    const copy: Item = { ...item(withAna), id: "i_copy" };
    expect(refusal(withAna, [{ op: "item.add", item: copy }], "Ben")?.message).toBe("A new item can't bring other people's votes or comments.");
    expect(refusal(withAna, [{ op: "item.add", item: copy }], "Ana")).toBeNull();
  });

  it("lets the assistant post a marked comment for the person asking, and nothing else", () => {
    const via = "Ana via assistant";
    expect(refusal(base, [newComment(ZIP, "Ana", "Asked it to say hi", 1, true)], via)).toBeNull();
    expect(refusal(base, [newComment(ZIP, "Ana", "Unmarked", 1)], via)?.code).toBe("forbidden");
    expect(refusal(base, [newComment(ZIP, "Ben", "For Ben", 1, true)], via)?.code).toBe("forbidden");
    expect(refusal(base, [voteOp(item(base), "Ana", "in")], via)?.message).toMatch(/doesn't vote for anyone/);
    expect(refusal(withAna, [editComment(ZIP, anas, "x")], via)?.code).toBe("forbidden");
    expect(refusal(base, [{ op: "item.add", item: { id: "i_new", kind: "activity", title: "New", reactions: [{ by: "Ana", vote: "in" }] } }], via)?.code).toBe("forbidden");
    // A person can't pass their own words off as the assistant's.
    expect(refusal(base, [newComment(ZIP, "Ana", "Fake", 1, true)], "Ana")?.code).toBe("forbidden");
  });

  it("has every permission check agree with forbidden()", () => {
    expect(forbidden(withAna, { op: "todo.add", todo: { id: "t_x", text: "x", done: false } }, { author: "Ben" })).toBeNull();
  });
});

describe("tallies", () => {
  it("lists names in the group's order, then anyone else", () => {
    // Everyone votes for themselves, in any order.
    let t = base;
    for (const [by, vote] of [["Cara", "in"], ["Ana", "in"], ["Zed", "out"], ["Ben", "in"], ["Dee", "maybe"]] as const) t = run(t, [voteOp(item(t), by, vote)], by).trip;
    t = run(t, [heartOp(item(t), "Ana")]).trip;
    const counts = tally(item(t), base.people);
    expect(counts).toEqual({ in: ["Ana", "Ben", "Cara"], maybe: ["Dee"], out: ["Zed"], hearts: ["Ana"] });
    expect(tallyLabel(counts)).toBe("3 people are in: Ana, Ben, Cara. 1 says maybe: Dee. 1 says not for them: Zed. 1 heart: Ana.");
    expect(tallyLabel(tally(item(base)))).toBe("No votes yet.");
  });

  it("sorts most wanted first, ties in their saved order", () => {
    const mk = (id: string, reactions: Item["reactions"]): Item => ({ id, kind: "activity", title: id, ...(reactions ? { reactions } : {}) });
    const a = mk("a", undefined);
    const b = mk("b", [{ by: "Ana", vote: "in" }, { by: "Ben", vote: "in" }]);
    const c = mk("c", [{ by: "Ana", vote: "in", heart: true }, { by: "Ben", vote: "in" }]);
    const d = mk("d", [{ by: "Ana", vote: "out" }]);
    const e = mk("e", undefined);
    expect(mostWanted([a, b, c, d, e]).map((i) => i.id)).toEqual(["c", "b", "a", "e", "d"]);
  });
});

describe("what's new", () => {
  const t = run(base, [newComment(ZIP, "Ana", "first", 1)]).trip;
  const t2 = run(t, [newComment(ZIP, "Ben", "second", 2)], "Ben").trip;

  it("counts other people's comments this phone hasn't shown, by id", () => {
    const zip = item(t2);
    expect(unread(zip, "Ana", new Set()).map((c) => c.text)).toEqual(["second"]);
    expect(unread(zip, "Ana", new Set(zip.comments!.map(commentMark)))).toEqual([]);
  });

  it("shows an edited comment as new again, and never a deleted one", () => {
    const seen = new Set(item(t2).comments!.map(commentMark));
    const bens = item(t2).comments![1];
    const edited = run(t2, [editComment(ZIP, bens, "second, edited", 5)], "Ben").trip;
    expect(unread(item(edited), "Ana", seen).map((c) => c.text)).toEqual(["second, edited"]);
    const gone = run(edited, [deleteComment(ZIP, item(edited).comments![1], 6)], "Ben").trip;
    expect(unread(item(gone), "Cara", new Set()).map((c) => c.text)).toEqual(["first"]);
  });
});

describe("privacy and old trips", () => {
  it("strips every vote and comment for the view-only link", () => {
    const t = run(run(base, [voteOp(item(base), "Ana", "in"), newComment(ZIP, "Ana", "PRIVATE-COMMENT", 1)]).trip, [heartOp(item(base), "Ben")], "Ben").trip;
    const shown = withoutDiscussion(t);
    expect(JSON.stringify(shown)).not.toContain("PRIVATE-COMMENT");
    expect(shown.items.some((i) => i.reactions || i.comments)).toBe(false);
    expect(item(shown).title).toBe("Zip lining");
  });

  it("takes a trip stored before votes existed as it is", () => {
    const old = JSON.parse(JSON.stringify(seedTrip())) as Trip;
    expect(old.items.some((i) => "reactions" in i || "comments" in i)).toBe(false);
    expect(tripProblems(old)).toEqual([]);
    expect(item(run(old, [voteOp(item(old), "Ana", "in")]).trip).reactions).toEqual([{ by: "Ana", vote: "in" }]);
  });

  it("migrates a v1 trip to one that takes votes and comments", () => {
    const v1: V1Trip = {
      name: "Guatemala",
      firstDay: "2026-11-24",
      lastDay: "2026-11-30",
      homeAirport: "SEA",
      utcOffset: "-06:00",
      partySize: 4,
      segments: [{ id: "seg-1", kind: "activity", title: "Volcano hike", start: null, end: null, status: "undecided", location: "Antigua" }],
      openQuestions: [],
      todos: [],
    };
    const t = migrateV1(v1, "guatemala");
    expect(TripSchema.safeParse(t).success).toBe(true);
    const r = run(t, [voteOp(t.items[0], "Ana", "in"), newComment("seg-1", "Ana", "Sunrise?", 1)]);
    expect(item(r.trip, "seg-1")).toMatchObject({ reactions: [{ by: "Ana", vote: "in" }], comments: [{ text: "Sunrise?" }] });
  });
});
