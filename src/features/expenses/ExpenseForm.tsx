"use client";

import { useState } from "react";
import { everyone, fxFor, homeCurrency, rateFor, shares } from "@/domain/expenses";
import { newId } from "@/domain/ids";
import { formatMoney, fromMinor, roundMoney, toMinor } from "@/domain/money";
import type { Op } from "@/domain/ops";
import { ExpenseSchema, type ExpensePatchT } from "@/domain/schema";
import { formatDay, todayIn } from "@/domain/time";
import type { Expense, Split } from "@/domain/types";
import { useRates } from "@/client/rates";
import { useTrip } from "@/client/store";
import { Avatar } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn, field, label } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";

/*
 * Logging or editing one expense: what, how much, who paid, who shares it.
 * Equal among everyone unless changed, so the usual case is two fields and
 * a tap. The same form opens from the Expenses screen, an item's page and
 * the + box (where what was typed fills it in, and edits here win).
 */

export interface ExpenseStart {
  title?: string;
  amount?: number;
  currency?: string;
  paidBy?: string;
  /** Equal among these. */
  among?: string[];
  date?: string;
  itemId?: string;
}

type How = Split["how"];

const HOW: [How, string][] = [
  ["equal", "Equally"],
  ["shares", "By shares"],
  ["exact", "Set amounts"],
];

const COMMON = ["USD", "EUR", "GBP", "CAD", "MXN", "AUD", "JPY"];

/** When it was logged; only ever called from Save. */
const now = () => Date.now();

const amountText = (n: number | undefined) => (n === undefined ? "" : String(n));
/** "1,200.50" → 1200.5; NaN when it isn't a number. */
const parseAmount = (s: string) => (s.trim() ? Number(s.replace(/[,\s]/g, "")) : NaN);

/** Logs a new expense (from `start`) or edits `expense`. */
export function ExpenseForm({ expense, start = {}, onDone, primaryId, autoFocus = true }: { expense?: Expense; start?: ExpenseStart; onDone: () => void; primaryId?: string; autoFocus?: boolean }) {
  const { trip, me, tripId, apply } = useTrip();
  const saved = useRates(tripId);
  const home = homeCurrency(trip);
  const group = everyone(trip, me);
  const base: Required<Omit<ExpenseStart, "itemId">> & { itemId: string; note: string; how: How; split?: Split } = {
    title: expense?.title ?? start.title ?? "",
    amount: expense?.amount ?? start.amount ?? NaN,
    currency: expense?.currency ?? start.currency ?? trip.currency,
    paidBy: expense?.paidBy ?? start.paidBy ?? me,
    among: expense ? splitPeople(expense.split) : (start.among ?? group),
    date: expense?.date ?? start.date ?? todayIn(trip.tz),
    itemId: expense?.itemId ?? start.itemId ?? "",
    note: expense?.note ?? "",
    how: expense?.split.how ?? "equal",
    split: expense?.split,
  };
  // Only what the person changed: the rest follows `start`, which changes as they type in the + box.
  const [edit, setEdit] = useState<Partial<Record<"title" | "amount" | "currency" | "paidBy" | "date" | "itemId" | "note", string>> & { how?: How }>({});
  const [among, setAmong] = useState<string[] | null>(null);
  const [weights, setWeights] = useState<Record<string, string>>(() => (base.split?.how === "shares" ? Object.fromEntries(base.split.among.map((p) => [p.name, String(p.shares)])) : {}));
  const [exact, setExact] = useState<Record<string, string>>(() => (base.split?.how === "exact" ? Object.fromEntries(base.split.among.map((p) => [p.name, String(p.amount)])) : {}));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = edit.title ?? base.title;
  const amountStr = edit.amount ?? amountText(Number.isNaN(base.amount) ? undefined : base.amount);
  const amount = parseAmount(amountStr);
  const currency = edit.currency ?? base.currency;
  const paidBy = edit.paidBy ?? base.paidBy;
  const date = edit.date ?? base.date;
  const itemId = edit.itemId ?? base.itemId;
  const note = edit.note ?? base.note;
  const how = edit.how ?? base.how;
  const chosen = among ?? base.among;
  const people = [...new Set([...group, ...base.among, paidBy])];
  const valid = amount > 0 && amount <= 10_000_000;

  const split: Split =
    how === "equal"
      ? { how, among: people.filter((p) => chosen.includes(p)) }
      : how === "shares"
        ? { how, among: people.map((name) => ({ name, shares: Number(weights[name] ?? (chosen.includes(name) ? "1" : "0")) })).filter((p) => p.shares > 0) }
        : { how, among: people.map((name) => ({ name, amount: roundMoney(parseAmount(exact[name] ?? "") || 0, currency) })).filter((p) => p.amount > 0) };
  const preview = valid && split.among.length ? shares({ amount: roundMoney(amount, currency), currency, split }) : [];
  const assigned = how === "exact" ? split.among.reduce((s, p) => s + toMinor((p as { amount: number }).amount, currency), 0) : 0;
  const leftover = valid ? toMinor(amount, currency) - assigned : 0;

  const currencies = [...new Set([trip.currency, home, currency, ...(trip.expenses ?? []).map((e) => e.currency), ...COMMON])];
  const rate = currency === home ? null : rateFor({ currency, fx: expense?.currency === currency ? expense.fx : undefined }, home, saved?.rates);
  const items = [...trip.items].sort((a, b) => (a.start?.date ?? "9999").localeCompare(b.start?.date ?? "9999") || a.title.localeCompare(b.title));

  /** Splitting set amounts: fill everyone in equally, to adjust from. */
  function switchTo(next: How) {
    setEdit((e) => ({ ...e, how: next }));
    if (next === "exact" && valid && !Object.keys(exact).length) {
      const parts = shares({ amount: roundMoney(amount, currency), currency, split: { how: "equal", among: people.filter((p) => chosen.includes(p)) } });
      setExact(Object.fromEntries(parts.map((p) => [p.name, String(fromMinor(p.minor, currency))])));
    }
  }

  async function save() {
    setError(null);
    if (!title.trim()) return setError("Say what it was for, like “Dinner”.");
    if (!valid) return setError("Enter the amount, like 420.");
    if (!split.among.length) return setError(how === "equal" ? "Pick at least one person to split it with." : "Give at least one person a share.");
    if (how === "exact" && leftover !== 0) return setError(leftover > 0 ? `${formatMoney(fromMinor(leftover, currency), currency)} still to assign.` : `That's ${formatMoney(fromMinor(-leftover, currency), currency)} more than was paid.`);
    const fx = expense && expense.currency === currency ? expense.fx : fxFor(currency, home, saved?.rates);
    const next: Expense = {
      id: expense?.id ?? newId("e"),
      title: title.trim().slice(0, 200),
      amount: roundMoney(amount, currency),
      currency,
      paidBy,
      split,
      date,
      ...(itemId ? { itemId } : {}),
      ...(note.trim() ? { note: note.trim().slice(0, 300) } : {}),
      ...(fx ? { fx } : {}),
      ...(expense?.settlement ? { settlement: true as const } : {}),
      addedBy: expense?.addedBy ?? me,
      addedAt: expense?.addedAt ?? now(),
    };
    const check = ExpenseSchema.safeParse(next);
    if (!check.success) return setError(check.error.issues[0].message);
    let ops: Op[];
    if (!expense) ops = [{ op: "expense.add", expense: next }];
    else {
      const set: Record<string, unknown> = {};
      for (const k of ["title", "amount", "currency", "paidBy", "split", "date", "itemId", "note", "fx"] as const) {
        if (JSON.stringify(expense[k]) !== JSON.stringify(next[k])) set[k] = next[k] ?? null;
      }
      if (!Object.keys(set).length) return onDone();
      ops = [{ op: "expense.update", id: expense.id, set: set as ExpensePatchT }];
    }
    setBusy(true);
    const r = await apply(ops);
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4"
    >
      <label className={label}>
        What for
        <input value={title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} maxLength={200} placeholder="Dinner, taxi, park fees" data-autofocus={autoFocus && !title ? true : undefined} className={field} />
      </label>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className={label}>
          Amount
          <input
            value={amountStr}
            onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
            inputMode="decimal"
            placeholder="420"
            data-autofocus={autoFocus && title ? true : undefined}
            className={`${field} tnum text-lg`}
          />
        </label>
        <label className={label}>
          Currency
          <select value={currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })} className={`${field} w-auto`}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      {valid && currency !== home && (
        <p className="-mt-2 text-sm text-muted">
          {rate
            ? `About ${formatMoney(roundMoney(amount * rate.rate, home), home)}${rate.locked ? " at the rate when it was logged" : ` at the rate on ${saved?.rates.date ? formatDay(saved.rates.date) : "the last day seen"}`}. The rate is saved with it, so the total won't change later.`
            : `It'll show in ${home} once the phone has exchange rates (it needs a connection once).`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Paid by
          <select value={paidBy} onChange={(e) => setEdit({ ...edit, paidBy: e.target.value })} className={field}>
            {people.map((p) => (
              <option key={p} value={p}>
                {p === me ? `${p} (you)` : p}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Day
          <input type="date" value={date} onChange={(e) => e.target.value && setEdit({ ...edit, date: e.target.value })} className={field} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-muted">Split</legend>
        <div role="radiogroup" aria-label="How to split it" className="grid grid-cols-3 gap-1 rounded-xl bg-sunken p-1">
          {HOW.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={how === v} onClick={() => how !== v && switchTo(v)} className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${how === v ? "bg-surface text-ink shadow-lift" : "text-muted"}`}>
              {l}
            </button>
          ))}
        </div>
        <ul className="flex flex-col divide-y divide-line">
          {people.map((p) => {
            const part = preview.find((s) => s.name === p);
            return (
              <li key={p} className="flex min-h-12 items-center gap-3 py-1">
                {how === "equal" ? (
                  <label className="flex min-h-11 flex-1 items-center gap-3 text-base">
                    <input
                      type="checkbox"
                      checked={chosen.includes(p)}
                      onChange={(e) => setAmong(e.target.checked ? [...chosen, p] : chosen.filter((x) => x !== p))}
                      className="size-6 shrink-0 accent-[var(--accent)]"
                    />
                    <Avatar name={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{p === me ? `${p} (you)` : p}</span>
                  </label>
                ) : (
                  <>
                    <Avatar name={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-base font-semibold">{p === me ? `${p} (you)` : p}</span>
                    {how === "shares" ? (
                      <input
                        aria-label={`Shares for ${p}`}
                        value={weights[p] ?? (chosen.includes(p) ? "1" : "0")}
                        onChange={(e) => setWeights({ ...weights, [p]: e.target.value.replace(/[^\d.]/g, "") })}
                        inputMode="decimal"
                        className={`${field} tnum w-20 text-right`}
                      />
                    ) : (
                      <input aria-label={`Amount for ${p}`} value={exact[p] ?? ""} onChange={(e) => setExact({ ...exact, [p]: e.target.value })} inputMode="decimal" placeholder="0" className={`${field} tnum w-28 text-right`} />
                    )}
                  </>
                )}
                <span className="tnum w-20 shrink-0 text-right text-sm text-muted">{part ? formatMoney(fromMinor(part.minor, currency), currency) : split.among.some((x) => (typeof x === "string" ? x : x.name) === p) ? "" : "Not in it"}</span>
              </li>
            );
          })}
        </ul>
        {how === "exact" && valid && leftover !== 0 && (
          <p className="text-sm font-semibold text-todo">
            {leftover > 0 ? `${formatMoney(fromMinor(leftover, currency), currency)} still to assign` : `${formatMoney(fromMinor(-leftover, currency), currency)} more than was paid`}
          </p>
        )}
      </fieldset>

      <details className="rounded-xl" open={!!(itemId || note)}>
        <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-accent">What it was for and a note</summary>
        <div className="flex flex-col gap-3 pt-1">
          <label className={label}>
            For
            <select value={itemId} onChange={(e) => setEdit({ ...edit, itemId: e.target.value })} className={field}>
              <option value="">Nothing on the plan</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.start ? `${formatDay(i.start.date)}: ` : ""}
                  {i.title}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Note
            <input value={note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} maxLength={300} placeholder="Tip included, cash" className={field} />
          </label>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-base font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button id={primaryId} type="submit" disabled={busy} className={btn.primary}>
          <Icon name={expense ? "check" : "receipt"} />
          {expense ? "Save changes" : "Log expense"}
        </button>
        {expense && (
          <button
            type="button"
            onClick={async () => {
              const r = await apply([{ op: "expense.remove", id: expense.id }]);
              if (r.ok) onDone();
              else setError(r.error);
            }}
            className={btn.danger}
          >
            <Icon name="trash" />
            {expense.settlement ? "Remove payment" : "Remove expense"}
          </button>
        )}
      </div>
    </form>
  );
}

function splitPeople(s: Split): string[] {
  return s.how === "equal" ? s.among : s.among.map((p) => p.name);
}

/** The form in a sheet: from the Expenses screen and an item's page. */
export function ExpenseSheet({ expense, start, onClose }: { expense?: Expense; start?: ExpenseStart; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={expense ? (expense.settlement ? "Payment" : "Edit expense") : "Log expense"}>
      <div className="pt-1">
        <ExpenseForm expense={expense} start={start} onDone={onClose} />
      </div>
    </Sheet>
  );
}
