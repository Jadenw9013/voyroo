"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { missing, toBook } from "@/domain/derive";
import { newId } from "@/domain/ids";
import { isPacked, visiblePacking } from "@/domain/packing";
import { addDays, formatDay } from "@/domain/time";
import type { Item, Todo as TodoT } from "@/domain/types";
import { parseView, type TodoSection, type View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Avatar, KindChip, StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn, field, label as labelCls, SectionTitle } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";
import { useCompose } from "../composer/Composer";
import { SyncLine } from "../SyncLine";
import { Packing, PeoplePicker } from "./Packing";

/** To-do: what still needs booking, what's missing, and the group's list; and the packing list, at /todo/packing. */
export function Todo({ go }: { go: (v: View) => void }) {
  const { trip, me } = useTrip();
  const pathname = usePathname();
  const view = parseView(pathname);
  const section: TodoSection = view.tab === "todo" && view.section === "packing" ? "packing" : "list";
  const compose = useCompose();
  const book = toBook(trip);
  const gaps = missing(trip);
  const open = trip.todos.filter((t) => !t.done);
  const done = trip.todos.filter((t) => t.done);
  const { shared, mine } = visiblePacking(trip, me);
  const toPack = [...shared, ...mine].filter((p) => !isPacked(p)).length;
  const [marking, setMarking] = useState<Item | null>(null);
  const tabs: { id: TodoSection; label: string; count: number }[] = [
    { id: "list", label: "To-do", count: open.length + book.length },
    { id: "packing", label: "Packing", count: toPack },
  ];

  return (
    <div className="flex flex-col gap-6 px-3 pt-3 sm:px-4 md:px-0">
      <header className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-5 shadow-lift">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{section === "packing" ? "Packing" : "Bookings & To-do"}</h1>
          <p className="text-sm text-muted">{section === "packing" ? "Who brings what for the group, and your own list." : "Reservations to confirm, missing logistics, and your group checklist."}</p>
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-k-activity-soft text-k-activity">
          <Icon name={section === "packing" ? "backpack" : "ticket"} className="size-6" />
        </span>
      </header>

      <div role="tablist" aria-label="To-do" className="-mt-2 flex gap-2 border-b border-line px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={section === t.id}
            onClick={() => go(t.id === "packing" ? { tab: "todo", section: "packing" } : { tab: "todo" })}
            className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-base font-bold ${section === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
          >
            <Icon name={t.id === "packing" ? "backpack" : "todo"} className="size-4" />
            {t.label}
            {t.count > 0 && <span className="tnum rounded-full bg-sunken px-2 py-0.5 text-sm text-muted">{t.count}</span>}
          </button>
        ))}
      </div>

      {section === "packing" ? (
        <div className="lg:max-w-3xl">
          <Packing go={go} />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            {gaps.length > 0 && (
              <section aria-labelledby="missing" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
                <SectionTitle>
                  <span id="missing">Missing</span>
                </SectionTitle>
                <ul className="flex flex-col gap-2.5">
                  {gaps.map((g) => {
                    const label =
                      g.kind === "flight-home"
                        ? "No flight home yet"
                        : g.count === 1
                          ? `Nowhere to stay the night of ${formatDay(g.from)}`
                          : `Nowhere to stay ${formatDay(g.from)} to ${formatDay(addDays(g.to, 1))} (${g.count} nights)`;
                    const ask = g.kind === "flight-home" ? "Help us pick a flight home" : `Find us a place to stay the night of ${formatDay(g.from)}`;
                    return (
                      <li key={label} className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-todo bg-todo-soft p-4">
                        <p className="flex items-center gap-2 text-base font-bold text-todo">
                          <Icon name={g.kind === "flight-home" ? "plane" : "bed"} />
                          {label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => compose({ ask: true, text: ask, day: g.kind === "nights" ? g.from : null })} className={btn.secondary}>
                            <Icon name="sparkles" />
                            Find options
                          </button>
                          <button type="button" onClick={() => compose({ day: g.kind === "nights" ? g.from : trip.endDate, kind: g.kind === "nights" ? "stay" : "flight" })} className={btn.quiet}>
                            <Icon name="plus" />
                            Add it
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section aria-labelledby="to-book" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
              <SectionTitle>
                <span id="to-book">To book</span>
              </SectionTitle>
              {book.length === 0 ? (
                <p className="text-base text-muted">Nothing waiting to be booked.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {book.map((i) => (
                    <li key={i.id} className="flex items-start gap-3 py-3.5">
                      <KindChip kind={i.kind} />
                      <div className="min-w-0 flex-1">
                        <button type="button" onClick={() => go({ tab: "item", itemId: i.id })} className="block w-full text-left">
                          <span className="block text-base leading-snug font-bold">{i.title}</span>
                          <span className="block text-sm text-muted">
                            {i.start ? formatDay(i.start.date) : "No day yet"}
                            {i.booking?.by ? `. ${i.booking.by} is on it` : ""}
                          </span>
                        </button>
                        {/* The status, then what you can do about it: a status pill never doubles as a button. */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusPill status="todo" />
                          {i.booking?.url && (
                            <a href={i.booking.url} target="_blank" rel="noreferrer" className={`${btn.quiet} min-h-10 text-sm`}>
                              <Icon name="external" className="size-4" />
                              Book online
                            </a>
                          )}
                          <button type="button" onClick={() => setMarking(i)} className={`${btn.secondary} min-h-10 text-sm`}>
                            <Icon name="check" className="size-4" />
                            Mark as booked
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-labelledby="list" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
            <SectionTitle>
              <span id="list">List</span>
            </SectionTitle>
            <ul className="flex flex-col divide-y divide-line">
              {open.map((t) => (
                <TodoRow key={t.id} todo={t} onItem={(id) => go({ tab: "item", itemId: id })} />
              ))}
            </ul>
            <AddTodo />
            {done.length > 0 && (
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-muted">Done ({done.length})</summary>
                <ul className="flex flex-col divide-y divide-line">
                  {done.map((t) => (
                    <TodoRow key={t.id} todo={t} onItem={(id) => go({ tab: "item", itemId: id })} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      )}

      <SyncLine />
      {marking && <MarkBooked item={marking} onClose={() => setMarking(null)} />}
    </div>
  );
}

function TodoRow({ todo, onItem }: { todo: TodoT; onItem: (id: string) => void }) {
  const { apply, trip, me } = useTrip();
  const [editing, setEditing] = useState(false);
  const item = todo.itemId ? trip.items.find((i) => i.id === todo.itemId) : null;
  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={(e) => void apply([{ op: "todo.update", id: todo.id, set: { done: e.target.checked } }])}
        aria-label={todo.text}
        className="mt-1 size-6 shrink-0 accent-[var(--accent)]"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-base ${todo.done ? "text-muted line-through" : ""}`}>{todo.text}</p>
        {todo.note && <p className="text-sm text-muted">{todo.note}</p>}
        {(todo.who || item) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            {todo.who && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                <Avatar name={todo.who} size="sm" />
                {todo.who === me ? "You're on it" : `${todo.who} is on it`}
              </span>
            )}
            {item && (
              <button type="button" onClick={() => onItem(item.id)} className="text-sm font-semibold text-accent">
                {item.title}
              </button>
            )}
          </div>
        )}
      </div>
      <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${todo.text}`} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken">
        <Icon name="pencil" className="size-4" />
      </button>
      {editing && <EditTodo todo={todo} onClose={() => setEditing(false)} />}
      <button
        type="button"
        onClick={() => void apply([{ op: "todo.remove", id: todo.id }])}
        aria-label={`Remove ${todo.text}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken"
      >
        <Icon name="close" className="size-4" />
      </button>
    </li>
  );
}

/** Saves only what changed, so an edit never undoes someone else's tick. */
function EditTodo({ todo, onClose }: { todo: TodoT; onClose: () => void }) {
  const { apply } = useTrip();
  const [text, setText] = useState(todo.text);
  const [who, setWho] = useState<string | null>(todo.who ?? null);
  const [note, setNote] = useState(todo.note ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title="Edit to-do">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return setError("Say what needs doing.");
          const set: Record<string, unknown> = {};
          if (t !== todo.text) set.text = t;
          if (who !== (todo.who ?? null)) set.who = who;
          if ((note.trim() || null) !== (todo.note ?? null)) set.note = note.trim() || null;
          if (!Object.keys(set).length) return onClose();
          const r = await apply([{ op: "todo.update", id: todo.id, set }]);
          if (r.ok) onClose();
          else setError(r.error);
        }}
        className="flex flex-col gap-4 pt-1"
      >
        <label className={labelCls}>
          What needs doing
          <input data-autofocus value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className={field} />
        </label>
        <PeoplePicker legend="Who's on it" value={who} onChange={setWho} none="Nobody yet" />
        <label className={labelCls}>
          Note
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className={`${field} resize-none`} />
        </label>
        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="submit" className={`${btn.primary} self-start`}>
          <Icon name="check" />
          Save
        </button>
      </form>
    </Sheet>
  );
}

function AddTodo() {
  const { apply } = useTrip();
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        const r = await apply([{ op: "todo.add", todo: { id: newId("t"), text: t.slice(0, 300), done: false } }]);
        if (r.ok) setText("");
      }}
      className="mt-2 flex gap-2"
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add to the list" aria-label="Add to the list" maxLength={300} className={field} />
      <button type="submit" disabled={!text.trim()} className={btn.secondary}>
        Add
      </button>
    </form>
  );
}

/** Marking something booked asks for the one detail worth having on the road. */
export function MarkBooked({ item, onClose }: { item: Item; onClose: () => void }) {
  const { apply, me } = useTrip();
  const [conf, setConf] = useState(item.booking?.confirmation ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title={`Mark ${item.title} as booked`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await apply([
            { op: "item.update", id: item.id, set: { booking: { state: "booked", by: item.booking?.by ?? me, ...(conf.trim() ? { confirmation: conf.trim() } : {}) } } },
          ]);
          if (r.ok) onClose();
          else setError(r.error);
        }}
        className="flex flex-col gap-4 pt-1"
      >
        <label className="flex flex-col gap-1 text-sm font-semibold text-muted">
          Confirmation number (optional)
          <input data-autofocus value={conf} onChange={(e) => setConf(e.target.value)} maxLength={100} autoCapitalize="characters" className={`${field} tnum text-lg`} />
        </label>
        <p className="text-sm text-muted">It shows on the item and on Today, one tap to copy.</p>
        {error && <p className="text-base font-semibold text-danger">{error}</p>}
        <button type="submit" className={`${btn.primary} self-start`}>
          <Icon name="check" />
          Mark as booked
        </button>
      </form>
    </Sheet>
  );
}
