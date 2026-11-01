"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { commentMark, deleteComment, editComment, heartOp, liveComments, myReaction, newComment, tally, tallyLabel, unread, voteOp, VOTE_LABEL, type Tally } from "@/domain/discuss";
import { formatDay } from "@/domain/time";
import type { Comment, Item, Vote } from "@/domain/types";
import { useClock } from "@/client/hooks";
import { useTrip } from "@/client/store";
import { Avatar } from "@/ui/badges";
import { Icon, type IconName } from "@/ui/Icon";
import { btn, field } from "@/ui/kit";

/*
 * Deciding together, on the phone: one tap to say you're in, a maybe, or
 * not for you, a heart, and a thread per item. What's new since this phone
 * last opened an item is remembered here, per device.
 */

const VOTES: { vote: Vote; icon: IconName }[] = [
  { vote: "in", icon: "thumbsUp" },
  { vote: "maybe", icon: "question" },
  { vote: "out", icon: "thumbsDown" },
];

const quote = (t: string) => `“${t}”`;

function voteMessage(vote: Vote | null, title: string): string {
  if (vote === "in") return `You're in for ${quote(title)}`;
  if (vote === "maybe") return `You said maybe to ${quote(title)}`;
  if (vote === "out") return `You passed on ${quote(title)}`;
  return `Took back your vote on ${quote(title)}`;
}

// ---------------------------------------------------------------------------
// What this phone has seen: { itemId: comment marks } in localStorage.

const SEEN_EVENT = "trip-seen-change";
const seenKey = (tripId: string) => `trip:${tripId}:seen`;
type Seen = Record<string, string[]>;

let cache: { raw: string | null; value: Seen } = { raw: null, value: {} };

function readSeen(tripId: string): Seen {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(seenKey(tripId));
  } catch {
    // Blocked storage: nothing remembered, nothing marked new.
  }
  if (raw !== cache.raw) {
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      cache = { raw, value: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {} };
    } catch {
      cache = { raw, value: {} };
    }
  }
  return cache.value;
}

function markSeen(tripId: string, itemId: string, marks: string[]) {
  const all = readSeen(tripId);
  const before = all[itemId] ?? [];
  if (before.length === marks.length && marks.every((m, i) => m === before[i])) return;
  try {
    localStorage.setItem(seenKey(tripId), JSON.stringify({ ...all, [itemId]: marks }));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(SEEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SEEN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** What this phone has seen, or null while the page is still coming from the server. */
function useSeen(tripId: string): Seen | null {
  return useSyncExternalStore(
    subscribe,
    () => readSeen(tripId),
    () => null,
  );
}

/** Other people's comments on an item that this phone hasn't shown yet. */
export function useUnread(item: Item): Comment[] {
  const { tripId, me } = useTrip();
  const seen = useSeen(tripId);
  return useMemo(() => (seen ? unread(item, me, new Set(seen[item.id] ?? [])) : []), [seen, item, me]);
}

// ---------------------------------------------------------------------------
// Votes

function VoteButton({ item, vote, icon, count, pressed }: { item: Item; vote: Vote; icon: IconName; count: number; pressed: boolean }) {
  const { me, apply } = useTrip();
  const label = VOTE_LABEL[vote];
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={count ? `${label} (${count})` : label}
      title={label}
      onClick={() => {
        const op = voteOp(item, me, vote);
        void apply([op], { message: voteMessage(op.op === "reaction.set" ? (op.vote ?? null) : null, item.title) });
      }}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${pressed ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink hover:bg-sunken"}`}
    >
      <Icon name={icon} className="size-4" />
      {/* Always in words: a thumb and a question mark alone don't say "I'm in" or "Maybe". */}
      <span>{label}</span>
      {count > 0 && <span className="tnum">{count}</span>}
    </button>
  );
}

function HeartButton({ item, count, pressed }: { item: Item; count: number; pressed: boolean }) {
  const { me, apply } = useTrip();
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={count ? `Heart (${count})` : "Heart"}
      title="Heart"
      onClick={() => void apply([heartOp(item, me)], { message: pressed ? `Took back your heart on ${quote(item.title)}` : `Hearted ${quote(item.title)}` })}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${pressed ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink hover:bg-sunken"}`}
    >
      <Icon name="heart" className={`size-4 ${pressed ? "fill-current" : ""}`} />
      {count > 0 && <span className="tnum">{count}</span>}
    </button>
  );
}

/** Up to four faces of the people who are in, then "+2". The words are in the label next to it. */
function Faces({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <span aria-hidden="true" className="flex items-center -space-x-1.5">
      {names.slice(0, 4).map((n) => (
        <span key={n} className="rounded-full ring-2 ring-surface">
          <Avatar name={n} size="sm" />
        </span>
      ))}
      {names.length > 4 && <span className="pl-2.5 text-sm font-semibold text-muted">+{names.length - 4}</span>}
    </span>
  );
}

/** The one-tap answers: I'm in, Maybe, Not for me, and a heart. */
export function Reactions({ item, compact = false }: { item: Item; compact?: boolean }) {
  const { trip, me } = useTrip();
  const t = tally(item, trip.people);
  const mine = myReaction(item, me);
  return (
    <div role="group" aria-label={`Votes on ${item.title}`} className="flex flex-wrap items-center gap-1.5">
      {VOTES.map((v) => (
        <VoteButton key={v.vote} item={item} vote={v.vote} icon={v.icon} count={t[v.vote].length} pressed={mine?.vote === v.vote} />
      ))}
      <HeartButton item={item} count={t.hearts.length} pressed={!!mine?.heart} />
      {compact && <Faces names={t.in} />}
      <span className="sr-only">{tallyLabel(t)}</span>
    </div>
  );
}

/** Under an idea in the list: the answers, and comments new to you (the row already says how many there are). */
export function IdeaFooter({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const fresh = useUnread(item).length;
  const count = liveComments(item).length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 pt-1.5 pb-2">
      <Reactions item={item} compact />
      <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-accent hover:bg-sunken">
        <Icon name="message" className="size-4" />
        {count ? `${count} ${count === 1 ? "comment" : "comments"}` : "Comment"}
        {fresh > 0 && <NewPill label={`${fresh} new`} />}
      </button>
    </div>
  );
}

export type IdeaOrder = "added" | "wanted";

/** Ideas in the order they were saved, or the ones most people are in for first. */
export function IdeaSort({ value, onChange }: { value: IdeaOrder; onChange: (v: IdeaOrder) => void }) {
  const opts: [IdeaOrder, string][] = [
    ["added", "Order added"],
    ["wanted", "Most wanted"],
  ];
  return (
    <div role="radiogroup" aria-label="Sort ideas" className="mb-2 inline-grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1">
      {opts.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${value === v ? "bg-surface font-bold text-ink shadow-lift ring-2 ring-accent" : "text-muted"}`}
        >
          {value === v && <Icon name="check" className="size-4" />}
          {l}
        </button>
      ))}
    </div>
  );
}

function NewPill({ label = "New" }: { label?: string }) {
  return (
    <span className="chip inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-sm font-bold text-accent">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function WhoSaid({ t, people }: { t: Tally; people: string[] }) {
  const voted = new Set([...t.in, ...t.maybe, ...t.out]);
  const waiting = people.filter((p) => !voted.has(p));
  const rows: [string, IconName, string[]][] = [
    ["In", "thumbsUp", t.in],
    ["Maybe", "question", t.maybe],
    ["Not for them", "thumbsDown", t.out],
    ["Hearted by", "heart", t.hearts],
  ];
  return (
    <dl className="mt-3 flex flex-col gap-2 text-base">
      {rows
        .filter(([, , names]) => names.length)
        .map(([title, icon, names]) => (
          <div key={title} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <dt className="inline-flex min-w-28 items-center gap-1.5 font-semibold text-muted">
              <Icon name={icon} className="size-4" />
              {title}
            </dt>
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {names.map((n) => (
                <span key={n} className="inline-flex items-center gap-1.5">
                  <Avatar name={n} size="sm" />
                  {n}
                </span>
              ))}
            </dd>
          </div>
        ))}
      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <dt className="min-w-28 font-semibold text-muted">Not voted yet</dt>
          <dd className="text-muted">{waiting.join(", ")}</dd>
        </div>
      )}
    </dl>
  );
}

/** On the item page: everyone's answers, with names. */
export function GroupVotes({ item }: { item: Item }) {
  const { trip, me } = useTrip();
  const t = tally(item, trip.people);
  const people = [...new Set([...trip.people, me])];
  return (
    <section aria-labelledby="votes-title">
      <h2 id="votes-title" className="mb-3 scroll-mt-20 text-lg font-bold">
        What everyone thinks
      </h2>
      <Reactions item={item} />
      <WhoSaid t={t} people={people} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comments

/** "just now", "5 min ago", "3 h ago", else the day. */
function ago(at: number, now: number): string {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return formatDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

function CommentRow({ item, c, fresh, now }: { item: Item; c: Comment; fresh: boolean; now: number }) {
  const { me, apply } = useTrip();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.text);
  const [error, setError] = useState<string | null>(null);
  const mine = c.by === me;
  const id = `comment-${c.id}`;

  if (c.deletedAt !== undefined) {
    return (
      <li className="flex items-center gap-3 py-2 text-sm text-muted italic">
        <Avatar name={c.by} size="sm" />
        {mine ? "You deleted a comment." : `${c.by} deleted a comment.`}
      </li>
    );
  }

  async function save() {
    const t = text.trim();
    if (!t) return setError("Write something, or delete the comment.");
    if (t === c.text) return setEditing(false);
    const r = await apply([editComment(item.id, c, t)], { message: "Comment edited" });
    if (r.ok) setEditing(false);
    else setError(r.error);
  }

  return (
    <li id={id} className="flex gap-3 py-3">
      <Avatar name={c.by} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-bold text-ink">{mine ? `${c.by} (you)` : c.by}</span>
          {c.viaAssistant && <span className="text-muted">via assistant</span>}
          <time dateTime={new Date(c.at).toISOString()} className="text-muted">
            {ago(c.at, now)}
          </time>
          {c.editedAt !== undefined && <span className="text-muted">(edited)</span>}
          {fresh && <NewPill />}
        </p>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-2"
          >
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} aria-label="Edit your comment" className={`${field} resize-y`} autoFocus />
            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className={btn.primary}>
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setText(c.text);
                  setError(null);
                }}
                className={btn.secondary}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="text-base break-words whitespace-pre-wrap">{c.text}</p>
        )}
        {mine && !editing && (
          <div className="-ml-3 flex gap-1">
            <button
              type="button"
              onClick={() => {
                setText(c.text);
                setEditing(true);
              }}
              aria-label="Edit your comment"
              className={`${btn.quiet} text-sm`}
            >
              <Icon name="pencil" className="size-4" />
              Edit
            </button>
            <button type="button" onClick={() => void apply([deleteComment(item.id, c)], { message: "Comment deleted" })} aria-label="Delete your comment" className={`${btn.danger} text-sm`}>
              <Icon name="trash" className="size-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function Composer({ item }: { item: Item }) {
  const { me, apply, online } = useTrip();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function post() {
    const t = text.trim();
    if (!t) return;
    const r = await apply([newComment(item.id, me, t)], { message: "Comment posted" });
    if (r.ok) {
      setText("");
      setError(null);
    } else setError(r.error);
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void post();
      }}
      className="flex flex-col gap-2 pt-3"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void post();
          }
        }}
        rows={2}
        maxLength={2000}
        placeholder="Ask the group, or say what you think"
        aria-label="Write a comment"
        className={`${field} resize-y`}
      />
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">{online ? `Posting as ${me}` : "Offline: it posts when you're back online."}</span>
        <button type="submit" disabled={!text.trim()} className={btn.primary}>
          <Icon name="send" className="size-4" />
          Post
        </button>
      </div>
    </form>
  );
}

/**
 * The thread on an item page. What was new when the page opened stays marked
 * while it's open; this phone then counts all of it as seen.
 */
export function Comments({ item }: { item: Item }) {
  const { tripId, me, syncedAt } = useTrip();
  // The first sync time is the server's clock, so "5 min ago" matches while hydrating.
  const now = useClock(syncedAt);
  const seen = useSeen(tripId);
  const [before, setBefore] = useState<Set<string> | null>(null);
  // Captured once per visit, after the page is on this phone (storage isn't there on the server).
  if (before === null && seen !== null) setBefore(new Set(seen[item.id] ?? []));
  const all = item.comments ?? [];
  const marks = liveComments(item).map(commentMark);
  const marksKey = marks.join(" ");
  useEffect(() => {
    if (before) markSeen(tripId, item.id, marksKey ? marksKey.split(" ") : []);
  }, [before, tripId, item.id, marksKey]);
  const isNew = (c: Comment) => !!before && c.by !== me && c.deletedAt === undefined && !before.has(commentMark(c));
  const fresh = all.filter(isNew).length;
  const count = marks.length;

  return (
    <section aria-labelledby="comments-title">
      <h2 id="comments-title" className="flex flex-wrap items-center gap-2 text-lg font-bold">
        Comments {count > 0 && <span className="tnum">{count}</span>}
        {fresh > 0 && <NewPill label={`${fresh} new since you last looked`} />}
      </h2>
      {all.length ? (
        <ul className="divide-y divide-line">
          {all.map((c) => (
            <CommentRow key={c.id} item={item} c={c} fresh={isNew(c)} now={now} />
          ))}
        </ul>
      ) : (
        <p className="pt-2 text-base text-muted">No comments yet. Start the conversation: what would make this worth it?</p>
      )}
      <Composer item={item} />
    </section>
  );
}
