"use client";

import { useEffect, useState } from "react";
import { newId } from "@/domain/ids";
import type { Op } from "@/domain/ops";
import { CATEGORY_LABEL, guessCategory, isPacked, PACK_CATEGORIES, parsePackLine, suggestionEntry, visiblePacking, type PackDraft, type PackSuggestion } from "@/domain/packing";
import { formatDay } from "@/domain/time";
import type { PackCategory, PackEntry, PackKind } from "@/domain/types";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Avatar } from "@/ui/badges";
import { Icon, KIND_ICON } from "@/ui/Icon";
import { btn, field, label as labelCls } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";

/*
 * Packing: who brings what for the group, and your own list. Your own list
 * shows only to you here, but it's saved in the trip with everything else,
 * so the screen says it isn't a place for secrets.
 */

const PRIVACY = "Only you see your list here. It's saved with the trip like everything else, so don't put anything secret on it.";

const quote = (t: string) => `“${t}”`;

function usePeople() {
  const { trip, me } = useTrip();
  return [...new Set([me, ...trip.people])];
}

/** "Ben" typed in lowercase is still Ben. */
function matchPerson(people: string[], name: string): string {
  return people.find((p) => p.toLowerCase() === name.toLowerCase()) ?? name;
}

/** Names as the person reading sees them: "you and Ben". */
function names(list: string[], me: string): string {
  const out = [...list].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0)).map((n) => (n === me ? "you" : n));
  return out.length <= 2 ? out.join(" and ") : `${out.slice(0, -1).join(", ")} and ${out.at(-1)}`;
}

// ---------------------------------------------------------------------------

/** Whether this site can suggest from the plan (it needs the assistant). Asked once per trip per visit. */
const suggestOn = new Map<string, boolean>();

function useCanSuggest(tripId: string): boolean {
  const [on, setOn] = useState(() => suggestOn.get(tripId) ?? false);
  useEffect(() => {
    if (suggestOn.has(tripId)) return;
    let live = true;
    fetch(`/api/t/${tripId}/packing`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return;
        suggestOn.set(tripId, !!b.suggest);
        if (live) setOn(!!b.suggest);
      })
      .catch(() => {
        // Offline: no button this time; it's asked again next visit.
      });
    return () => {
      live = false;
    };
  }, [tripId]);
  return on;
}

export function Packing({ go }: { go: (v: View) => void }) {
  const { trip, me, online } = useTrip();
  const [list, setList] = useState<PackKind>("shared");
  const [suggesting, setSuggesting] = useState(false);
  const canSuggest = useCanSuggest(trip.id);
  const { shared, mine } = visiblePacking(trip, me);
  const entries = list === "shared" ? shared : mine;
  const open = entries.filter((e) => !isPacked(e));
  const packed = entries.filter(isPacked);
  const nobody = shared.filter((e) => !e.assignee && !isPacked(e)).length;
  const tabs: { id: PackKind; label: string; count: number }[] = [
    { id: "shared", label: "Shared", count: shared.filter((e) => !isPacked(e)).length },
    { id: "personal", label: "Mine", count: mine.filter((e) => !isPacked(e)).length },
  ];

  return (
    <section aria-labelledby="packing">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="packing" className="sr-only">
          Packing list
        </h2>
        {canSuggest &&
          (online ? (
            <button type="button" onClick={() => setSuggesting(true)} className={btn.secondary}>
              <Icon name="plan" className="size-4" />
              Suggest from our plan
            </button>
          ) : (
            <p className="text-sm text-muted">Suggestions need a connection.</p>
          ))}
      </div>

      <div role="tablist" aria-label="Which packing list" className="flex gap-1 rounded-xl bg-sunken p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`pack-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={list === t.id}
            aria-controls="pack-panel"
            onClick={() => setList(t.id)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-base font-semibold ${list === t.id ? "bg-surface font-bold text-ink shadow-lift ring-2 ring-accent" : "text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.count > 0 && <span className="tnum rounded-full bg-sunken px-2 py-0.5 text-sm">{t.count}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="pack-panel" aria-labelledby={`pack-tab-${list}`} className="flex flex-col gap-3 pt-3">
        <p className="text-sm text-muted">{list === "shared" ? "What the group needs one of. Say you'll bring something, so nobody packs two." : PRIVACY}</p>
        {entries.length > 0 && (
          <p className="text-base font-semibold">
            <span className="tnum">
              {packed.length} of {entries.length}
            </span>{" "}
            packed
            {list === "shared" && nobody > 0 && (
              <span className="font-normal text-todo">
                . <span className="tnum">{nobody}</span> {nobody === 1 ? "needs" : "need"} someone to bring {nobody === 1 ? "it" : "them"}
              </span>
            )}
          </p>
        )}
        {entries.length === 0 && (
          <p className="text-base text-muted">
            {list === "shared" ? "Nothing on the shared list yet: a speaker, a first-aid kit, a deck of cards." : "Your list is empty. Add what you'd hate to forget."}
          </p>
        )}

        {PACK_CATEGORIES.map((c) => {
          const rows = open.filter((e) => (e.category ?? "other") === c.id);
          if (!rows.length) return null;
          return (
            <div key={c.id}>
              <h3 className="pt-1 text-sm font-bold text-muted">{c.label}</h3>
              <ul className="flex flex-col divide-y divide-line">
                {rows.map((e) => (
                  <PackRow key={e.id} entry={e} go={go} />
                ))}
              </ul>
            </div>
          );
        })}

        <AddPack kind={list} />

        {packed.length > 0 && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-muted">Packed ({packed.length})</summary>
            <ul className="flex flex-col divide-y divide-line">
              {packed.map((e) => (
                <PackRow key={e.id} entry={e} go={go} />
              ))}
            </ul>
          </details>
        )}
      </div>

      {suggesting && <SuggestSheet onClose={() => setSuggesting(false)} onAdded={(k) => setList(k)} />}
    </section>
  );
}

function PackRow({ entry, go }: { entry: PackEntry; go: (v: View) => void }) {
  const { trip, me, apply, notify } = useTrip();
  const [editing, setEditing] = useState(false);
  const item = entry.itemId ? trip.items.find((i) => i.id === entry.itemId) : null;
  const packed = isPacked(entry);
  const shared = entry.kind === "shared";
  const run = async (ops: Op[], message?: string) => {
    const r = await apply(ops, message ? { message } : {});
    if (!r.ok) notify(r.error);
  };

  // Packing something nobody had taken means you're bringing it. There's one box per entry,
  // so unticking clears everyone's tick; each tick is still its own op, so two people packing at once both land.
  const tick = (on: boolean) =>
    run(
      on
        ? [...(shared && !entry.assignee ? [{ op: "pack.claim" as const, id: entry.id, who: me }] : []), { op: "pack.check", id: entry.id, who: me, packed: true }]
        : (entry.packedBy ?? []).map((who) => ({ op: "pack.check" as const, id: entry.id, who, packed: false })),
      `${on ? "Packed" : "Unpacked"} ${quote(entry.text)}`,
    );

  return (
    <li className="flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        checked={packed}
        onChange={(e) => void tick(e.target.checked)}
        aria-label={`Packed: ${entry.text}`}
        className="mt-1 size-6 shrink-0 accent-accent"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-base ${packed ? "text-muted line-through" : ""}`}>
          {entry.text}
          {entry.quantity && <span className="tnum text-muted"> ×{entry.quantity}</span>}
        </p>
        {shared && (
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            {packed ? (
              <span>Packed by {names(entry.packedBy ?? [], me)}</span>
            ) : entry.assignee ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={entry.assignee} size="sm" />
                  {entry.assignee === me ? "You're bringing it" : `${entry.assignee} is bringing it`}
                </span>
                {entry.assignee === me && (
                  <button type="button" onClick={() => void run([{ op: "pack.claim", id: entry.id, who: null }], `Nobody's bringing ${quote(entry.text)} now`)} className="min-h-10 rounded-lg px-2 font-semibold text-accent hover:bg-sunken">
                    Not me
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-todo">Nobody&apos;s bringing it yet</span>
                <button type="button" onClick={() => void run([{ op: "pack.claim", id: entry.id, who: me }], `You're bringing ${quote(entry.text)}`)} className={`${btn.secondary} my-1 px-3 text-sm`}>
                  I&apos;ll bring it
                </button>
              </>
            )}
          </div>
        )}
        {item && (
          <button type="button" onClick={() => go({ tab: "item", itemId: item.id })} className="flex min-h-11 items-center gap-1.5 text-left text-sm font-semibold text-accent">
            <Icon name={KIND_ICON[item.kind]} className="mt-0.5 size-3.5 shrink-0" />
            {item.title}
          </button>
        )}
      </div>
      <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${entry.text}`} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken">
        <Icon name="pencil" className="size-4" />
      </button>
      {editing && <EditPack entry={entry} onClose={() => setEditing(false)} />}
    </li>
  );
}

/** Typed straight onto a list: "speaker - Ben" and "2 dry bags" work here too. */
function AddPack({ kind }: { kind: PackKind }) {
  const { apply, me } = useTrip();
  const people = usePeople();
  const [text, setText] = useState("");
  const label = kind === "shared" ? "Add to the shared list" : "Add to your list";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        const d = parsePackLine(`${kind === "shared" ? "bring" : "pack"} ${t}`);
        const who = kind === "shared" ? (d?.self ? me : d?.assignee ? matchPerson(people, d.assignee) : null) : null;
        const entry: PackEntry = {
          id: newId("p"),
          text: d?.text ?? t.slice(0, 300),
          kind,
          ...(kind === "personal" ? { owner: me } : {}),
          ...(who ? { assignee: who } : {}),
          ...(d?.quantity ? { quantity: d.quantity } : {}),
          category: d?.category ?? guessCategory(t),
        };
        const r = await apply([{ op: "pack.add", entry }], kind === "personal" ? { message: `Added ${quote(entry.text)} to your list` } : {});
        if (r.ok) setText("");
      }}
      className="flex flex-col gap-1"
    >
      {/* The label stays visible; the example says how to put someone down for it. */}
      <label htmlFor={`pack-add-${kind}`} className="text-sm font-semibold text-muted">
        {label}
        {kind === "shared" && <span className="font-normal">. Add “- Ben” to say who brings it.</span>}
      </label>
      <div className="flex gap-2">
        <input id={`pack-add-${kind}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "shared" ? "Speaker - Ben" : "Charger, swimsuit…"} maxLength={300} className={field} />
        <button type="submit" disabled={!text.trim()} className={btn.secondary}>
          Add
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

/** Person pills with their initial: tap one to pick, tap again (or "Nobody") to clear. */
export function PeoplePicker({ legend, value, onChange, none }: { legend: string; value: string | null; onChange: (v: string | null) => void; none: string }) {
  const { me } = useTrip();
  // Someone not (or no longer) in the group, set by the assistant or before a rename, stays visible.
  const people = [...new Set([...usePeople(), ...(value ? [value] : [])])];
  const pill =(on: boolean) => `inline-flex min-h-11 items-center gap-2 rounded-full py-1 text-base font-semibold ${on ? "bg-ink text-canvas" : "border border-line text-ink hover:bg-sunken"}`;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1 text-sm font-semibold text-muted">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={!value} onClick={() => onChange(null)} className={`${pill(!value)} px-4`}>
          {none}
        </button>
        {people.map((p) => (
          <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(value === p ? null : p)} className={`${pill(value === p)} pr-4 pl-1.5`}>
            <Avatar name={p} />
            {p === me ? `${p} (you)` : p}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ListChoice({ value, onChange }: { value: PackKind; onChange: (k: PackKind) => void }) {
  const seg = (on: boolean) => `min-h-11 flex-1 rounded-lg px-2 text-base font-semibold ${on ? "bg-surface font-bold text-ink shadow-lift ring-2 ring-accent" : "text-muted"}`;
  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label="Which list" className="flex gap-1 rounded-xl bg-sunken p-1">
        {(["shared", "personal"] as PackKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={seg(value === k)}>
            {k === "shared" ? "Shared list" : "Only my list"}
          </button>
        ))}
      </div>
      {value === "personal" && <p className="text-sm text-muted">{PRIVACY}</p>}
    </div>
  );
}

function EditPack({ entry, onClose }: { entry: PackEntry; onClose: () => void }) {
  const { trip, me, apply } = useTrip();
  const [text, setText] = useState(entry.text);
  const [qty, setQty] = useState(entry.quantity ? String(entry.quantity) : "");
  const [category, setCategory] = useState<PackCategory>(entry.category ?? "other");
  const [itemId, setItemId] = useState(entry.itemId ?? "");
  const [kind, setKind] = useState<PackKind>(entry.kind);
  const [assignee, setAssignee] = useState<string | null>(entry.assignee ?? null);
  const [error, setError] = useState<string | null>(null);
  const dated = trip.items.filter((i) => i.start).sort((a, b) => a.start!.date.localeCompare(b.start!.date));
  const ideas = trip.items.filter((i) => !i.start);
  const personal = entry.kind === "personal";

  async function save() {
    const set: Record<string, unknown> = {};
    const t = text.trim();
    if (!t) return setError("Say what to pack.");
    if (t !== entry.text) set.text = t;
    const q = qty ? Math.round(Number(qty)) : 1;
    if (!(q >= 1 && q <= 99)) return setError("How many: a number from 1 to 99.");
    if ((q >= 2 ? q : null) !== (entry.quantity ?? null)) set.quantity = q >= 2 ? q : null;
    if (category !== (entry.category ?? "other")) set.category = category;
    if ((itemId || null) !== (entry.itemId ?? null)) set.itemId = itemId || null;
    if (kind !== entry.kind) {
      Object.assign(
        set,
        kind === "personal"
          ? { kind, owner: me, assignee: null, packedBy: entry.packedBy?.includes(me) ? [me] : null }
          : { kind, owner: null, ...(assignee ? { assignee } : {}) },
      );
    } else if (kind === "shared" && assignee !== (entry.assignee ?? null)) set.assignee = assignee;
    if (!Object.keys(set).length) return onClose();
    const r = await apply([{ op: "pack.update", id: entry.id, set } as Op], personal && kind === "personal" ? { message: `Saved ${quote(t)}` } : {});
    if (r.ok) onClose();
    else setError(r.error);
  }

  async function remove() {
    const r = await apply([{ op: "pack.remove", id: entry.id }], personal ? { message: `Removed ${quote(entry.text)} from your list` } : {});
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <Sheet open onClose={onClose} title={`Edit ${entry.text}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4 pt-1"
      >
        <label className={labelCls}>
          What to pack
          <input data-autofocus value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className={field} />
        </label>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <label className={labelCls}>
            How many
            <input type="number" inputMode="numeric" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" className={`${field} tnum`} />
          </label>
          <label className={labelCls}>
            Kind of thing
            <select value={category} onChange={(e) => setCategory(e.target.value as PackCategory)} className={field}>
              {PACK_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={labelCls}>
          For
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={field}>
            <option value="">The whole trip</option>
            {dated.length > 0 && (
              <optgroup label="On the plan">
                {dated.map((i) => (
                  <option key={i.id} value={i.id}>
                    {formatDay(i.start!.date)}: {i.title}
                  </option>
                ))}
              </optgroup>
            )}
            {ideas.length > 0 && (
              <optgroup label="Ideas">
                {ideas.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <ListChoice value={kind} onChange={setKind} />
        {kind === "shared" && <PeoplePicker legend="Who's bringing it" value={assignee} onChange={setAssignee} none="Nobody yet" />}
        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="submit" className={btn.primary}>
            <Icon name="check" />
            Save
          </button>
          <button type="button" onClick={() => void remove()} className={btn.danger}>
            <Icon name="trash" />
            Remove from the list
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; suggestions: PackSuggestion[] };

/** Ideas from the plan, to pick from. Nothing is added until "Add". */
function SuggestSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (k: PackKind) => void }) {
  const { trip, me, apply } = useTrip();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/t/${trip.id}/packing`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok && Array.isArray(b.suggestions)) setLoaded({ state: "ready", suggestions: b.suggestions });
        else setLoaded({ state: "error", message: b.error ?? "That didn't work. Try again in a moment." });
      })
      .catch(() => live && setLoaded({ state: "error", message: "Suggestions need a connection." }));
    return () => {
      live = false;
    };
    // Once per try; the trip changing underneath doesn't re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const all = loaded.state === "ready" ? loaded.suggestions : [];
  const toggle = (i: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  async function add() {
    const chosen = all.filter((_, i) => picked.has(i));
    if (!chosen.length) return;
    const ops: Op[] = chosen.map((s) => ({ op: "pack.add", entry: suggestionEntry(s, newId("p"), me) }));
    const r = await apply(ops, { message: chosen.length === 1 ? `Added ${quote(chosen[0].text)}` : `Added ${chosen.length} things to pack` });
    if (!r.ok) return setError(r.error);
    onAdded(chosen.every((s) => s.kind === "personal") ? "personal" : "shared");
    onClose();
  }

  const groups: { kind: PackKind; title: string }[] = [
    { kind: "shared", title: "For the group" },
    { kind: "personal", title: "For your own list" },
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      title="Suggestions from your plan"
      wide
      footer={
        loaded.state === "ready" && all.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void add()} disabled={!picked.size} className={btn.primary}>
              <Icon name="plus" />
              {picked.size ? `Add ${picked.size} to the list` : "Pick what to add"}
            </button>
            <button type="button" onClick={() => setPicked(picked.size === all.length ? new Set() : new Set(all.map((_, i) => i)))} className={btn.quiet}>
              {picked.size === all.length ? "Clear all" : "Pick all"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        {loaded.state === "loading" && (
          <p role="status" className="flex items-center gap-2 text-base text-muted">
            <Icon name="clock" className="size-4" />
            Reading your plan…
          </p>
        )}
        {loaded.state === "error" && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-base font-semibold text-danger">
              {loaded.message}
            </p>
            <button
              type="button"
              onClick={() => {
                setLoaded({ state: "loading" });
                setAttempt((a) => a + 1);
              }}
              className={btn.secondary}
            >
              Try again
            </button>
          </div>
        )}
        {loaded.state === "ready" && all.length === 0 && <p className="text-base text-muted">Nothing new to suggest: your lists already cover the plan.</p>}
        {loaded.state === "ready" && all.length > 0 && <p className="text-sm text-muted">Nothing is added until you pick it. Check anything about weather or rules before you rely on it.</p>}
        {groups.map((g) => {
          const rows = all.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === g.kind);
          if (!rows.length) return null;
          return (
            <fieldset key={g.kind} className="flex flex-col">
              <legend className="pb-1 text-base font-bold">{g.title}</legend>
              <ul className="flex flex-col divide-y divide-line">
                {rows.map(({ s, i }) => {
                  const item = s.itemId ? trip.items.find((x) => x.id === s.itemId) : null;
                  return (
                    <li key={i}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                        <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} className="mt-1 size-6 shrink-0 accent-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold">
                            {s.text}
                            {s.quantity && <span className="tnum font-normal text-muted"> ×{s.quantity}</span>}
                            <span className="font-normal text-muted"> · {CATEGORY_LABEL[s.category]}</span>
                          </span>
                          {(s.why || item) && <span className="block text-sm text-muted">{s.why ?? `For ${item!.title}`}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

/** The composer's preview for "pack sunscreen" or "bring speaker - Ben": the guess, shown and changeable. */
export function PackPreview({ draft, onDone, onPlan }: { draft: PackDraft; onDone: () => void; onPlan: () => void }) {
  const { me, apply } = useTrip();
  const people = usePeople();
  const guessedWho = draft.self ? me : draft.assignee ? matchPerson(people, draft.assignee) : null;
  const [textEdit, setText] = useState<string>();
  const [kindEdit, setKind] = useState<PackKind>();
  const [whoEdit, setWho] = useState<string | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = textEdit ?? draft.text;
  const kind = kindEdit ?? draft.kind;
  const who = kind === "shared" ? (whoEdit === undefined ? guessedWho : whoEdit) : null;

  async function add() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const entry: PackEntry = {
      id: newId("p"),
      text: t.slice(0, 300),
      kind,
      ...(kind === "personal" ? { owner: me } : {}),
      ...(who ? { assignee: who } : {}),
      ...(draft.quantity ? { quantity: draft.quantity } : {}),
      category: textEdit === undefined ? draft.category : guessCategory(t),
    };
    const message = kind === "personal" ? `Added ${quote(entry.text)} to your packing list` : who === me ? `You're bringing ${quote(entry.text)}` : undefined;
    const r = await apply([{ op: "pack.add", entry }], message ? { message } : {});
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-4">
      <div className="flex items-start gap-3">
        <span className="chip flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" title="Packing list">
          <Icon name="backpack" />
        </span>
        <div className="min-w-0 flex-1">
          <label className={labelCls}>
            What to pack
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className={field} />
          </label>
          <p className="text-base text-muted">
            {kind === "personal" ? "On your own packing list" : who === me ? "On the shared list, and you're bringing it" : who ? `On the shared list, and ${who} is bringing it` : "On the shared list. Nobody's bringing it yet"}
            {draft.quantity ? <span className="tnum">, ×{draft.quantity}</span> : null}
          </p>
        </div>
      </div>
      <ListChoice value={kind} onChange={setKind} />
      {kind === "shared" && <PeoplePicker legend="Who's bringing it" value={who} onChange={setWho} none="Nobody yet" />}
      {error && (
        <p role="alert" className="text-base font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button id="composer-primary" type="button" onClick={() => void add()} disabled={!text.trim() || busy} className={btn.primary}>
          <Icon name="plus" />
          Add to packing list
        </button>
        <button type="button" onClick={onPlan} className={btn.quiet}>
          Add to the plan instead
        </button>
      </div>
    </div>
  );
}
