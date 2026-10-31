import { newId } from "./ids";
import type { Op } from "./schema";
import type { Comment, Item, Reaction, Trip, Vote } from "./types";

/*
 * Deciding together: votes ("I'm in", "Maybe", "Not for me"), hearts and
 * comments on items. Everyone in the trip sees them; each person changes only
 * their own. The assistant reads the tallies and posts a comment when asked
 * to, but never votes for anyone. None of it is shown on the view-only link.
 */

export const VOTE_LABEL: Record<Vote, string> = { in: "I'm in", maybe: "Maybe", out: "Not for me" };

/** "Ana" for Ana, and for the assistant acting for her ("Ana via assistant"). */
export function actorOf(author: string): { name: string; assistant: boolean } {
  const m = /^(.+) via assistant$/.exec(author);
  return m ? { name: m[1], assistant: true } : { name: author, assistant: false };
}

/**
 * Why this author may not make this op, or null if they may. Checked on the
 * phone and again on the server before an op applies. Undo replays the
 * server's own inverse ops, so restoring a removed item brings back
 * everyone's votes and comments; nothing else may carry someone else's.
 */
export function forbidden(trip: Trip, op: Op, meta: { author: string; undoOf?: string }): string | null {
  const me = actorOf(meta.author);
  switch (op.op) {
    case "reaction.set":
      if (me.assistant) return "The assistant doesn't vote for anyone. Tap your own answer on the idea.";
      return op.by === me.name ? null : "You can only change your own vote.";
    case "comment.add":
      if (op.comment.by !== me.name) return "You can only comment as yourself.";
      if (me.assistant !== !!op.comment.viaAssistant && !meta.undoOf) return me.assistant ? "The assistant marks the comments it writes." : "Only the assistant marks a comment as written by it.";
      return null;
    case "comment.update":
    case "comment.remove": {
      if (me.assistant) return "The assistant can't change comments. Edit or delete it on the item.";
      const c = trip.items.find((i) => i.id === op.itemId)?.comments?.find((x) => x.id === op.commentId);
      // Gone already: applying it says so.
      if (!c) return null;
      return c.by === me.name ? null : "You can only edit or delete your own comments.";
    }
    case "item.add": {
      if (meta.undoOf) return null;
      const { reactions = [], comments = [] } = op.item;
      if (me.assistant && reactions.length) return "The assistant doesn't vote for anyone.";
      return [...reactions, ...comments].some((x) => x.by !== me.name) ? "A new item can't bring other people's votes or comments." : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reading

export interface Tally {
  in: string[];
  maybe: string[];
  out: string[];
  hearts: string[];
}

/** Who said what, in the group's order, then anyone else A to Z. */
export function tally(item: Item, people: readonly string[] = []): Tally {
  const rank = (n: string) => (people.includes(n) ? people.indexOf(n) : people.length);
  const rs = [...(item.reactions ?? [])].sort((a, b) => rank(a.by) - rank(b.by) || a.by.localeCompare(b.by));
  const by = (v: Vote) => rs.filter((r) => r.vote === v).map((r) => r.by);
  return { in: by("in"), maybe: by("maybe"), out: by("out"), hearts: rs.filter((r) => r.heart).map((r) => r.by) };
}

export const hasReactions = (t: Tally) => t.in.length + t.maybe.length + t.out.length + t.hearts.length > 0;

export const myReaction = (item: Item, me: string): Reaction | undefined => item.reactions?.find((r) => r.by === me);

/** Most people in first, then most hearts, most maybes, fewest passes. Ties keep their order. */
export function mostWanted(items: readonly Item[]): Item[] {
  const key = (i: Item) => {
    const t = tally(i);
    return [t.in.length, t.hearts.length, t.maybe.length, -t.out.length];
  };
  return items
    .map((item, n) => ({ item, n, k: key(item) }))
    .sort((a, b) => {
      for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return b.k[j] - a.k[j];
      return a.n - b.n;
    })
    .map((x) => x.item);
}

/** For screen readers and the assistant: "3 people are in: Ana, Ben, Cara. 1 says maybe: Dee." */
export function tallyLabel(t: Tally): string {
  const parts: string[] = [];
  const n = (list: string[], one: string, many: string) => `${list.length} ${list.length === 1 ? one : many}`;
  if (t.in.length) parts.push(`${n(t.in, "person is", "people are")} in: ${t.in.join(", ")}`);
  if (t.maybe.length) parts.push(`${n(t.maybe, "says", "say")} maybe: ${t.maybe.join(", ")}`);
  if (t.out.length) parts.push(`${n(t.out, "says", "say")} not for them: ${t.out.join(", ")}`);
  if (t.hearts.length) parts.push(`${n(t.hearts, "heart", "hearts")}: ${t.hearts.join(", ")}`);
  return parts.length ? `${parts.join(". ")}.` : "No votes yet.";
}

export const liveComments = (item: Item): Comment[] => (item.comments ?? []).filter((c) => c.deletedAt === undefined);

/** A comment's version: an edit makes it new again. */
export const commentMark = (c: Comment) => `${c.id}@${c.editedAt ?? c.at}`;

/** Other people's comments this phone hasn't shown yet. Ids, not clocks: phones' clocks disagree. */
export function unread(item: Item, me: string, seen: ReadonlySet<string>): Comment[] {
  return liveComments(item).filter((c) => c.by !== me && !seen.has(commentMark(c)));
}

/** The trip without votes or comments: what a view-only link may show. */
export function withoutDiscussion(trip: Trip): Trip {
  return {
    ...trip,
    items: trip.items.map((i) => {
      if (!i.reactions && !i.comments) return i;
      const rest = { ...i };
      delete rest.reactions;
      delete rest.comments;
      return rest;
    }),
  };
}

// ---------------------------------------------------------------------------
// Writing

/** Tapping your current answer again takes it back. */
export function voteOp(item: Item, me: string, vote: Vote): Op {
  return { op: "reaction.set", itemId: item.id, by: me, vote: myReaction(item, me)?.vote === vote ? null : vote };
}

export function heartOp(item: Item, me: string): Op {
  return { op: "reaction.set", itemId: item.id, by: me, heart: !myReaction(item, me)?.heart };
}

export function newComment(itemId: string, by: string, text: string, now = Date.now(), viaAssistant = false): Op {
  return { op: "comment.add", itemId, comment: { id: newId("m"), by, text: text.trim().slice(0, 2000), at: now, ...(viaAssistant ? { viaAssistant: true as const } : {}) } };
}

export const editComment = (itemId: string, c: Comment, text: string, now = Date.now()): Op => ({
  op: "comment.update",
  itemId,
  commentId: c.id,
  set: { text: text.trim().slice(0, 2000), editedAt: now },
});

export const deleteComment = (itemId: string, c: Comment, now = Date.now()): Op => ({ op: "comment.update", itemId, commentId: c.id, set: { text: "", deletedAt: now } });
