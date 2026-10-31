"use client";

import { useState } from "react";
import { costs } from "@/domain/derive";
import { balancesByCurrency, byDate, combinedBalances, everyone, fxFor, homeCurrency, settlement, settleUp, shareOf, splitNames, type Balances, type Transfer } from "@/domain/expenses";
import { newId } from "@/domain/ids";
import { formatMinor, formatMoney } from "@/domain/money";
import { formatDay, todayIn } from "@/domain/time";
import type { Expense, Trip } from "@/domain/types";
import type { View } from "@/client/router";
import { useRates } from "@/client/rates";
import { useTrip } from "@/client/store";
import { Avatar } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn, SectionTitle } from "@/ui/kit";
import { SyncLine } from "../SyncLine";
import { ExpenseSheet } from "./ExpenseForm";

/*
 * Expenses: who paid what, where everyone stands, and the few payments that
 * square the group up. Balances are per currency (quetzales settle in
 * quetzales) unless the group picks "All in USD", which converts each
 * expense with the rate it was logged at.
 */

type Editing = { expense?: Expense } | null;

export function Expenses({ go }: { go: (v: View) => void }) {
  const { trip, me, tripId } = useTrip();
  const saved = useRates(tripId);
  const [editing, setEditing] = useState<Editing>(null);
  const list = trip.expenses ?? [];
  const names = everyone(trip, me);
  const home = homeCurrency(trip);
  const perCurrency = balancesByCurrency(list, names);
  const mixed = perCurrency.length > 1 || (perCurrency.length === 1 && perCurrency[0].currency !== home);
  const combined = mixed ? combinedBalances(list, home, saved?.rates, names) : null;
  const views = [...(combined ? [`all`] : []), ...perCurrency.map((b) => b.currency)];
  const [picked, setPicked] = useState<string | null>(null);
  const shown = picked && views.includes(picked) ? picked : (views[0] ?? trip.currency);
  const current: Balances | null = shown === "all" ? combined : (perCurrency.find((b) => b.currency === shown) ?? null);
  const plan = current ? settleUp(current.people, current.currency) : [];

  return (
    <div className="flex flex-col gap-6 px-3 pt-3 sm:px-4 md:px-0">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-5 shadow-lift">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted">Who paid what, and who owes whom.</p>
        </div>
        <button type="button" onClick={() => setEditing({})} className={btn.primary}>
          <Icon name="plus" />
          Log expense
        </button>
      </header>

      {list.length === 0 ? (
        <section aria-labelledby="none-yet" className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5 shadow-lift">
          <h2 id="none-yet" className="text-lg font-bold">
            Nothing logged yet
          </h2>
          <p className="text-base text-muted">Log a dinner, a taxi or the park fees as you go, and this works out who owes whom, in quetzales, dollars or both.</p>
          <p className="text-base text-muted">
            Or type it in the + box: <span className="font-semibold text-ink">“dinner 420 {trip.currency} paid by {names[1] ?? me} split all”</span>.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            {views.length > 1 && (
              <div role="radiogroup" aria-label="Show balances in" className="flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1 shadow-lift">
                {views.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={shown === v}
                    onClick={() => setPicked(v)}
                    className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-semibold whitespace-nowrap ${shown === v ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken"}`}
                  >
                    {v === "all" ? `All in ${home}` : `In ${v}`}
                  </button>
                ))}
              </div>
            )}
            {current && <Standing balances={current} me={me} />}
            {current && <SettleUp plan={plan} trip={trip} />}
            {shown === "all" && combined && <ConvertNote combined={combined} source={saved?.source} />}
          </div>
          <ExpenseList expenses={list} me={me} trip={trip} onOpen={(expense) => setEditing({ expense })} go={go} />
        </div>
      )}

      <Totals trip={trip} perCurrency={perCurrency} combined={combined} />
      <SyncLine />
      {editing && <ExpenseSheet expense={editing.expense} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** "+Q315 gets back", "−Q105 owes", "✓ Square": a mark and words, never color alone. */
export function StandingWords({ net, currency, you }: { net: number; currency: string; you?: boolean }) {
  if (net > 0)
    return (
      <span className="inline-flex items-center gap-1 font-bold text-ok">
        <span aria-hidden="true">↑</span>
        {you ? "You get back" : "Gets back"} <span className="tnum">{formatMinor(net, currency)}</span>
      </span>
    );
  if (net < 0)
    return (
      <span className="inline-flex items-center gap-1 font-bold text-todo">
        <span aria-hidden="true">↓</span>
        {you ? "You owe" : "Owes"} <span className="tnum">{formatMinor(-net, currency)}</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-muted">
      <Icon name="check" className="size-4" />
      {you ? "You're square" : "Square"}
    </span>
  );
}

function Standing({ balances, me }: { balances: Balances; me: string }) {
  const you = balances.people.find((p) => p.name === me);
  return (
    <section aria-labelledby="balances" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
      <SectionTitle>
        <span id="balances">Balances</span>
      </SectionTitle>
      {you && (
        <p className="mb-3 text-xl">
          <StandingWords net={you.net} currency={balances.currency} you />
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {balances.people.map((p) => (
          <li key={p.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <Avatar name={p.name} />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold">{p.name === me ? `${p.name} (you)` : p.name}</span>
              <span className="tnum block text-sm text-muted">
                Paid {formatMinor(p.paid, balances.currency)}, share {formatMinor(p.share, balances.currency)}
              </span>
            </span>
            <span className="text-base">
              <StandingWords net={p.net} currency={balances.currency} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The payments that square everyone up, each with "Mark settled" for when it's been paid. */
function SettleUp({ plan, trip }: { plan: Transfer[]; trip: Trip }) {
  const { apply, me, tripId } = useTrip();
  const saved = useRates(tripId);
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-labelledby="settle-up" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
      <SectionTitle>
        <span id="settle-up">Settle up</span>
      </SectionTitle>
      {plan.length === 0 ? (
        <p className="flex items-center gap-2 text-base text-muted">
          <Icon name="check" className="size-4" />
          Everyone&apos;s square.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {plan.map((t) => (
            <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center gap-3 py-3">
              <p className="min-w-0 flex-1 text-base">
                <strong>{t.from === me ? "You" : t.from}</strong> {t.from === me ? "pay" : "pays"} <strong>{t.to === me ? "you" : t.to}</strong> <strong className="tnum">{formatMinor(t.amount, t.currency)}</strong>
              </p>
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  const fx = fxFor(t.currency, homeCurrency(trip), saved?.rates);
                  const r = await apply([{ op: "expense.add", expense: settlement(t, { id: newId("e"), date: todayIn(trip.tz), by: me, at: Date.now(), fx }) }]);
                  if (!r.ok) setError(r.error);
                }}
                className={`${btn.secondary} min-h-11 text-sm`}
              >
                <Icon name="check" className="size-4" />
                Mark settled
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base font-semibold text-danger">
          {error}
        </p>
      )}
      {plan.length > 0 && <p className="mt-2 text-sm text-muted">Paid it back? Mark it settled and it goes on the list, with Undo.</p>}
    </section>
  );
}

function ConvertNote({ combined, source }: { combined: ReturnType<typeof combinedBalances>; source?: { name: string; url: string } }) {
  return (
    <div className="flex flex-col gap-1 px-1 text-sm text-muted">
      <p>Each expense is converted at the rate saved when it was logged, so these don&apos;t move with the markets.</p>
      {combined.approximate > 0 && <p>{combined.approximate === 1 ? "One expense had no rate saved and uses" : `${combined.approximate} expenses had no rate saved and use`} today&apos;s.</p>}
      {combined.left.length > 0 && (
        <p className="font-semibold text-todo">
          {combined.left.length === 1 ? "One expense is" : `${combined.left.length} expenses are`} left out: there are no exchange rates on this phone yet. They&apos;re in the per-currency balances.
        </p>
      )}
      {source && (
        <p>
          Rates by{" "}
          <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-2">
            {source.name}
          </a>
          .
        </p>
      )}
    </div>
  );
}

function ExpenseList({ expenses, me, trip, onOpen, go }: { expenses: Expense[]; me: string; trip: Trip; onOpen: (e: Expense) => void; go: (v: View) => void }) {
  const sorted = byDate(expenses);
  const days = [...new Set(sorted.map((e) => e.date))];
  return (
    <section aria-labelledby="expense-list" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
      <SectionTitle>
        <span id="expense-list">Logged</span>
      </SectionTitle>
      <div className="flex flex-col gap-4">
        {days.map((d) => (
          <div key={d}>
            <h3 className="text-sm font-bold text-muted">{formatDay(d)}</h3>
            <ul className="flex flex-col divide-y divide-line">
              {sorted
                .filter((e) => e.date === d)
                .map((e) => (
                  <ExpenseRow key={e.id} expense={e} me={me} trip={trip} onOpen={() => onOpen(e)} go={go} />
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Ana paid, split 4 ways": how an expense is shared, in a few words. */
export function splitWords(e: Expense, me: string): string {
  const names = splitNames(e.split).map((n) => (n === me ? "you" : n));
  const payer = e.paidBy === me ? "You paid" : `${e.paidBy} paid`;
  if (e.settlement) return `${payer} ${names.join(" and ")} back`;
  if (names.length === 1) return `${payer}, for ${names[0]}`;
  if (e.split.how === "equal") return `${payer}, split ${names.length} ways`;
  return `${payer}, ${e.split.how === "shares" ? "split by shares" : "set amounts"}`;
}

function ExpenseRow({ expense: e, me, trip, onOpen, go }: { expense: Expense; me: string; trip: Trip; onOpen: () => void; go: (v: View) => void }) {
  const { justChanged } = useTrip();
  const mine = shareOf(e, me);
  const item = e.itemId ? trip.items.find((i) => i.id === e.itemId) : null;
  return (
    <li className={`flex items-start gap-1 py-1 ${justChanged.has(e.id) ? "just-changed rounded-xl" : ""}`}>
      <button type="button" onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-xl py-2 text-left hover:bg-sunken/60">
        <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${e.settlement ? "bg-ok-soft text-ok" : "bg-sunken text-muted"}`}>
          <Icon name={e.settlement ? "check" : "receipt"} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-bold">{e.settlement ? "Paid back" : e.title}</span>
          <span className="block text-sm text-muted">{splitWords(e, me)}</span>
          {e.note && <span className="block truncate text-sm text-muted">{e.note}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="tnum block text-base font-bold">{formatMoney(e.amount, e.currency)}</span>
          {!e.settlement && <span className="tnum block text-xs text-muted">{mine ? `Your share ${formatMinor(mine, e.currency)}` : "Not in it"}</span>}
        </span>
      </button>
      {item && (
        <button type="button" onClick={() => go({ tab: "item", itemId: item.id })} aria-label={`Open ${item.title}`} title={item.title} className="mt-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-accent hover:bg-sunken">
          <Icon name="link" className="size-4" />
        </button>
      )}
    </li>
  );
}

function Totals({ trip, perCurrency, combined }: { trip: Trip; perCurrency: Balances[]; combined: ReturnType<typeof combinedBalances> | null }) {
  const planned = costs(trip);
  if (!perCurrency.length && !planned.length) return null;
  return (
    <section aria-labelledby="totals" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
      <SectionTitle>
        <span id="totals">Totals</span>
      </SectionTitle>
      <dl className="flex flex-col gap-2 text-base">
        {perCurrency.length > 0 && (
          <div className="flex flex-wrap justify-between gap-x-3 rounded-xl bg-sunken/60 px-3.5 py-2.5">
            <dt className="font-bold text-muted">Spent so far</dt>
            <dd className="tnum text-right font-semibold">
              {perCurrency.map((b) => formatMinor(b.spent, b.currency)).join(" + ")}
              {combined && perCurrency.length > 1 && combined.left.length === 0 && <span className="text-muted"> = about {formatMinor(combined.spent, combined.currency)}</span>}
            </dd>
          </div>
        )}
        {planned.map((t) => (
          <div key={t.currency} className="flex flex-wrap justify-between gap-x-3 rounded-xl bg-sunken/60 px-3.5 py-2.5">
            <dt className="font-bold text-muted">Reservations ({t.currency})</dt>
            <dd className="tnum text-right font-semibold">
              {formatMoney(t.booked, t.currency)} booked
              {t.toBook > 0 && <span className="text-muted">, {formatMoney(t.toBook, t.currency)} still to book</span>}
            </dd>
          </div>
        ))}
      </dl>
      {planned.length > 0 && <p className="mt-2 text-sm text-muted">Reservation prices are what&apos;s planned. Log what&apos;s actually paid, and by whom, to split it.</p>}
    </section>
  );
}

/** A short summary for To-do and Trip: where you stand, and the way in. */
export function MoneyCard({ go }: { go: (v: View) => void }) {
  const { trip, me } = useTrip();
  const list = (trip.expenses ?? []).filter((e) => !e.settlement);
  const mine = balancesByCurrency(trip.expenses ?? [], [me]).map((b) => ({ currency: b.currency, net: b.people.find((p) => p.name === me)?.net ?? 0 }));
  return (
    <section aria-labelledby="money" className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
      <SectionTitle>
        <span id="money">Expenses</span>
      </SectionTitle>
      {list.length === 0 ? (
        <p className="text-base text-muted">Log what the group pays for and see who owes whom.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-base">
          {mine.map((m) => (
            <li key={m.currency}>
              <StandingWords net={m.net} currency={m.currency} you />
            </li>
          ))}
          <li className="text-sm text-muted">
            {list.length} {list.length === 1 ? "expense" : "expenses"} logged
          </li>
        </ul>
      )}
      <button type="button" onClick={() => go({ tab: "expenses" })} className={`${btn.secondary} mt-3`}>
        <Icon name="wallet" />
        Open expenses
      </button>
    </section>
  );
}
