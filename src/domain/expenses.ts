import { fromMinor, minorDigits, toMinor } from "./money";
import type { Expense, Fx, Split, Trip } from "./types";

/*
 * Who owes whom. Worked out from the expenses, never stored: each expense
 * says who paid and who shares it; a person's balance is what they paid
 * minus their share. Positive gets money back, negative owes.
 *
 * Everything is in whole minor units (centavos) per currency, so a split
 * always adds up to what was paid and the balances add up to zero. Mixing
 * currencies only happens on request, converted with the rate each expense
 * locked in when it was logged.
 */

/** Everyone who can pay or share: you first, then the group, each once. */
export function everyone(trip: Pick<Trip, "people">, me: string): string[] {
  return [...new Set([me, ...trip.people].filter(Boolean))];
}

/** The currency totals combine into: home if the trip has one, else the local one. */
export const homeCurrency = (trip: Pick<Trip, "currency" | "homeCurrency">) => trip.homeCurrency ?? trip.currency;

/**
 * Splits whole minor units by weight. Each gets the floor of their part; the
 * cents left over go one each to the largest remainders, ties to whoever is
 * listed first. The parts always add up to `total` exactly.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length || !(sum > 0)) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - out[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length].i]++;
  return out;
}

/** Each person's share of one expense, in minor units of its currency. */
export function shares(e: Pick<Expense, "amount" | "currency" | "split">): { name: string; minor: number }[] {
  const total = toMinor(e.amount, e.currency);
  const s = e.split;
  if (s.how === "exact") return s.among.map((p) => ({ name: p.name, minor: toMinor(p.amount, e.currency) }));
  const names = s.how === "equal" ? s.among : s.among.map((p) => p.name);
  const parts = allocate(total, s.how === "equal" ? s.among.map(() => 1) : s.among.map((p) => p.shares));
  return names.map((name, i) => ({ name, minor: parts[i] }));
}

/** What `name` owes for one expense, in minor units (0 if they're not in it). */
export const shareOf = (e: Expense, name: string) => shares(e).find((s) => s.name === name)?.minor ?? 0;

/** Who an expense is shared among, by name. */
export const splitNames = (s: Split): string[] => (s.how === "equal" ? s.among : s.among.map((p) => p.name));

export interface PersonBalance {
  name: string;
  /** Paid for the group, settlements left out. */
  paid: number;
  /** Their share of what the group spent. */
  share: number;
  /** paid − share, after paying back: positive gets money back, negative owes. */
  net: number;
}

export interface Balances {
  currency: string;
  people: PersonBalance[];
  /** What the group spent, settlements left out. */
  spent: number;
  /** Expenses counted. */
  count: number;
}

function tally(names: string[]) {
  const by = new Map<string, PersonBalance>();
  const person = (name: string) => {
    let p = by.get(name);
    if (!p) by.set(name, (p = { name, paid: 0, share: 0, net: 0 }));
    return p;
  };
  names.forEach(person);
  return { by, person };
}

/** Everyone in a currency, biggest creditor first; people with nothing at stake last, by name. */
const ordered = (by: Map<string, PersonBalance>) => [...by.values()].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

/** Balances per currency: Q expenses settle in Q, $ in $. `names` are always listed, even at zero. */
export function balancesByCurrency(expenses: Expense[], names: string[] = []): Balances[] {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) groups.set(e.currency, [...(groups.get(e.currency) ?? []), e]);
  return [...groups].map(([currency, list]) => {
    const { by, person } = tally(names);
    let spent = 0;
    for (const e of list) {
      const total = toMinor(e.amount, e.currency);
      const payer = person(e.paidBy);
      payer.net += total;
      if (!e.settlement) {
        payer.paid += total;
        spent += total;
      }
      for (const s of shares(e)) {
        const p = person(s.name);
        p.net -= s.minor;
        if (!e.settlement) p.share += s.minor;
      }
    }
    return { currency, people: ordered(by), spent, count: list.filter((e) => !e.settlement).length };
  });
}

// ---------------------------------------------------------------------------
// Settling up

export interface Transfer {
  from: string;
  to: string;
  /** Minor units. */
  amount: number;
  currency: string;
}

/**
 * The few payments that square everyone up: "Ana pays Ben Q350". Exact
 * matches first (one payment settles both people), then the biggest debt
 * goes to the biggest creditor. Never more than one payment fewer than the
 * people involved.
 */
export function settleUp(people: Pick<PersonBalance, "name" | "net">[], currency: string): Transfer[] {
  const owed = people.filter((p) => p.net > 0).map((p) => ({ ...p })).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const owing = people.filter((p) => p.net < 0).map((p) => ({ ...p, net: -p.net })).sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const out: Transfer[] = [];
  for (const d of owing) {
    const c = owed.find((x) => x.net === d.net);
    if (!c) continue;
    out.push({ from: d.name, to: c.name, amount: d.net, currency });
    c.net = d.net = 0;
  }
  let i = 0;
  let j = 0;
  while (i < owing.length && j < owed.length) {
    const d = owing[i];
    const c = owed[j];
    if (d.net === 0) i++;
    else if (c.net === 0) j++;
    else {
      const amount = Math.min(d.net, c.net);
      out.push({ from: d.name, to: c.name, amount, currency });
      d.net -= amount;
      c.net -= amount;
    }
  }
  return out;
}

/** The expense that records a payment back. Tap "Mark settled" and this goes on the trip. */
export function settlement(t: Transfer, meta: { id: string; date: string; by: string; at: number; fx?: Fx }): Expense {
  const amount = fromMinor(t.amount, t.currency);
  return {
    id: meta.id,
    title: `${t.from} paid ${t.to} back`,
    amount,
    currency: t.currency,
    paidBy: t.from,
    split: { how: "exact", among: [{ name: t.to, amount }] },
    date: meta.date,
    settlement: true,
    ...(meta.fx ? { fx: meta.fx } : {}),
    addedBy: meta.by,
    addedAt: meta.at,
  };
}

// ---------------------------------------------------------------------------
// Currencies

/** Daily reference rates: one `base` buys `rates[c]` of currency c. */
export interface Rates {
  base: string;
  /** The day they're for, "YYYY-MM-DD". */
  date: string;
  rates: Record<string, number>;
}

/** Units of `to` for one unit of `from`, or null if either is unknown. */
export function rateBetween(rates: Rates | null | undefined, from: string, to: string): number | null {
  if (from === to) return 1;
  if (!rates) return null;
  const a = from === rates.base ? 1 : rates.rates[from];
  const b = to === rates.base ? 1 : rates.rates[to];
  return a > 0 && b > 0 ? b / a : null;
}

/** The rate to lock onto a new expense: none needed in the home currency, none known with no rates. */
export function fxFor(currency: string, home: string, rates: Rates | null | undefined): Fx | undefined {
  if (currency === home || !rates) return undefined;
  const rate = rateBetween(rates, currency, home);
  return rate ? { to: home, rate: Number(rate.toPrecision(8)), on: rates.date } : undefined;
}

/** How one expense converts to `to`: its locked rate when it has one, else today's (approximate). */
export function rateFor(e: Pick<Expense, "currency" | "fx">, to: string, rates: Rates | null | undefined): { rate: number; locked: boolean } | null {
  if (e.currency === to) return { rate: 1, locked: true };
  if (e.fx?.to === to) return { rate: e.fx.rate, locked: true };
  const today = rateBetween(rates, e.currency, to);
  return today ? { rate: today, locked: false } : null;
}

/**
 * Rounds amounts to whole minor units so they add up to the rounded total:
 * floors, then the shortfall goes to the largest remainders. Converted
 * balances stay at zero overall instead of leaving a stray cent.
 */
export function roundToSum(values: number[]): number[] {
  const target = Math.round(values.reduce((a, b) => a + b, 0));
  const out = values.map(Math.floor);
  let left = target - out.reduce((a, b) => a + b, 0);
  const order = values.map((v, i) => ({ i, frac: v - out[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k++, left--) out[order[k % order.length].i]++;
  return out;
}

export interface Combined extends Balances {
  /** Expenses converted at today's rate because they had none locked. */
  approximate: number;
  /** Expenses that couldn't be converted at all (no rate known): left out. */
  left: Expense[];
}

/** Every currency in one, converted to `to` with each expense's own rate. */
export function combinedBalances(expenses: Expense[], to: string, rates: Rates | null | undefined, names: string[] = []): Combined {
  const { by, person } = tally(names);
  const nets = new Map<string, number>();
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  let spent = 0;
  let approximate = 0;
  let count = 0;
  const left: Expense[] = [];
  for (const e of expenses) {
    const r = rateFor(e, to, rates);
    if (!r) {
      left.push(e);
      continue;
    }
    if (!r.locked) approximate++;
    // Minor units of the expense's currency → minor units of `to`, unrounded until the end.
    const k = (r.rate * 10 ** minorDigits(to)) / 10 ** minorDigits(e.currency);
    const total = toMinor(e.amount, e.currency) * k;
    person(e.paidBy);
    add(nets, e.paidBy, total);
    if (!e.settlement) {
      add(paid, e.paidBy, total);
      spent += total;
      count++;
    }
    for (const s of shares(e)) {
      person(s.name);
      add(nets, s.name, -s.minor * k);
      if (!e.settlement) add(share, s.name, s.minor * k);
    }
  }
  const people = [...by.keys()];
  const rounded = roundToSum(people.map((n) => nets.get(n) ?? 0));
  people.forEach((n, i) => {
    const p = by.get(n)!;
    p.net = rounded[i];
    p.paid = Math.round(paid.get(n) ?? 0);
    p.share = Math.round(share.get(n) ?? 0);
  });
  return { currency: to, people: ordered(by), spent: Math.round(spent), count, approximate, left };
}

// ---------------------------------------------------------------------------
// Lists

/** Newest first: by day, then by when it was logged. */
export function byDate(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.addedAt - a.addedAt);
}

export const expensesFor = (trip: Trip, itemId: string) => (trip.expenses ?? []).filter((e) => e.itemId === itemId);
