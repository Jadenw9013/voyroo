import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import { prepareChange } from "./change";
import { allocate, balancesByCurrency, combinedBalances, fxFor, rateBetween, roundToSum, settlement, settleUp, shares, type Rates } from "./expenses";
import { upgradeTrip } from "./migrate";
import { formatMoney, roundMoney, toMinor } from "./money";
import type { Op } from "./ops";
import { parseLine } from "./parse";
import { ExpenseSchema } from "./schema";
import type { Expense, Split, Trip, TripState } from "./types";

const base: Trip = { ...seedTrip(), people: ["Ana", "Ben", "Cy", "Dee"] };
const state = (trip: Trip = base, version = 1): TripState => ({ trip, version });

let n = 0;
function expense(amount: number, paidBy: string, split: Split | string[], extra: Partial<Expense> = {}): Expense {
  return {
    id: `e_test_${n++}`,
    title: "Dinner",
    amount,
    currency: "GTQ",
    paidBy,
    split: Array.isArray(split) ? { how: "equal", among: split } : split,
    date: "2026-11-27",
    addedAt: n,
    ...extra,
  };
}

const ALL = ["Ana", "Ben", "Cy", "Dee"];
const net = (b: { people: { name: string; net: number }[] }) => Object.fromEntries(b.people.map((p) => [p.name, p.net]));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A tiny repeatable random source, so the property tests are the same every run. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe("money", () => {
  it("counts in each currency's own minor units", () => {
    expect(toMinor(420.5, "GTQ")).toBe(42050);
    expect(toMinor(1200, "JPY")).toBe(1200);
    expect(toMinor(1.234, "KWD")).toBe(1234);
  });

  it("rounds half up without float drift", () => {
    expect(toMinor(1.005, "USD")).toBe(101);
    expect(toMinor(0.1 + 0.2, "USD")).toBe(30);
    expect(roundMoney(420.555, "GTQ")).toBe(420.56);
    expect(roundMoney(999.5, "JPY")).toBe(1000);
  });

  it("writes amounts the way people say them", () => {
    expect(formatMoney(420, "GTQ")).toBe("Q420");
    expect(formatMoney(54.5, "USD")).toBe("$54.50");
    expect(formatMoney(1200, "JPY")).toBe("¥1,200");
  });
});

describe("splitting", () => {
  it("gives leftover cents to the first people listed, and always adds up", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(allocate(10001, [1, 1, 1])).toEqual([3334, 3334, 3333]);
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocate(0, [1, 1])).toEqual([0, 0]);
  });

  it("splits by shares, leftover to the biggest remainder", () => {
    // Q100 in shares 2:1 → 66.666… and 33.333…: Ana's remainder is bigger.
    expect(allocate(10000, [2, 1])).toEqual([6667, 3333]);
    expect(allocate(1000, [1.5, 1, 0.5])).toEqual([500, 333, 167]);
  });

  it("splits equally in currencies with no cents", () => {
    expect(shares({ amount: 1000, currency: "JPY", split: { how: "equal", among: ["Ana", "Ben", "Cy"] } }).map((s) => s.minor)).toEqual([334, 333, 333]);
  });

  it("keeps exact amounts as given", () => {
    const s = shares({ amount: 420, currency: "GTQ", split: { how: "exact", among: [{ name: "Ana", amount: 300 }, { name: "Ben", amount: 120 }] } });
    expect(s).toEqual([{ name: "Ana", minor: 30000 }, { name: "Ben", minor: 12000 }]);
  });

  it("refuses exact amounts that don't add up to the total, saying by how much", () => {
    const bad = ExpenseSchema.safeParse(expense(420, "Ana", { how: "exact", among: [{ name: "Ana", amount: 300 }, { name: "Ben", amount: 100 }] }));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toBe("The split adds up to Q400, not Q420");
    // Half a centavo off is still the same amount once rounded.
    expect(ExpenseSchema.safeParse(expense(0.3, "Ana", { how: "exact", among: [{ name: "Ana", amount: 0.1 }, { name: "Ben", amount: 0.2 }] })).success).toBe(true);
  });

  it("refuses a split with someone listed twice, or nobody", () => {
    expect(ExpenseSchema.safeParse(expense(100, "Ana", ["Ana", "ana"])).success).toBe(false);
    expect(ExpenseSchema.safeParse(expense(100, "Ana", [])).success).toBe(false);
    expect(ExpenseSchema.safeParse(expense(0, "Ana", ["Ana"])).success).toBe(false);
  });

  it("every split adds up to exactly what was paid", () => {
    const r = rng(7);
    for (let i = 0; i < 500; i++) {
      const amount = Math.round(r() * 1_000_000) / 100;
      const people = ALL.slice(0, 1 + Math.floor(r() * 4));
      const split: Split = r() < 0.5 ? { how: "equal", among: people } : { how: "shares", among: people.map((name) => ({ name, shares: 1 + Math.floor(r() * 5) })) };
      expect(sum(shares({ amount, currency: "GTQ", split }).map((s) => s.minor))).toBe(toMinor(amount, "GTQ"));
    }
  });
});

describe("balances", () => {
  it("credits the payer and charges everyone their share", () => {
    const [b] = balancesByCurrency([expense(420, "Ana", ALL)]);
    expect(net(b)).toEqual({ Ana: 31500, Ben: -10500, Cy: -10500, Dee: -10500 });
    expect(b.spent).toBe(42000);
    expect(b.people.find((p) => p.name === "Ana")).toMatchObject({ paid: 42000, share: 10500 });
  });

  it("keeps each currency separate", () => {
    const list = [expense(420, "Ana", ALL), expense(40, "Ben", ["Ana", "Ben"], { currency: "USD" })];
    const by = Object.fromEntries(balancesByCurrency(list).map((b) => [b.currency, net(b)]));
    expect(by.GTQ.Ben).toBe(-10500);
    expect(by.USD).toEqual({ Ben: 2000, Ana: -2000 });
  });

  it("lists everyone given, even with nothing at stake", () => {
    const [b] = balancesByCurrency([expense(100, "Ana", ["Ana", "Ben"])], ALL);
    expect(net(b)).toEqual({ Ana: 5000, Ben: -5000, Cy: 0, Dee: 0 });
  });

  it("counts paying back in balances but not in what was spent", () => {
    const list = [expense(420, "Ana", ALL), settlement({ from: "Ben", to: "Ana", amount: 10500, currency: "GTQ" }, { id: "e_s", date: "2026-11-28", by: "Ben", at: 1 })];
    const [b] = balancesByCurrency(list);
    expect(net(b)).toEqual({ Ana: 21000, Ben: 0, Cy: -10500, Dee: -10500 });
    expect(b.spent).toBe(42000);
    expect(b.count).toBe(1);
    expect(b.people.find((p) => p.name === "Ben")).toMatchObject({ paid: 0, share: 10500 });
  });

  it("always adds up to zero", () => {
    const r = rng(42);
    const list = Array.from({ length: 200 }, () => {
      const people = ALL.filter(() => r() < 0.7);
      return expense(Math.round(r() * 100_000) / 100, ALL[Math.floor(r() * 4)], people.length ? people : ["Ana"]);
    });
    expect(sum(balancesByCurrency(list)[0].people.map((p) => p.net))).toBe(0);
  });
});

describe("settling up", () => {
  it("says who pays whom", () => {
    const [b] = balancesByCurrency([expense(420, "Ana", ALL)]);
    expect(settleUp(b.people, "GTQ")).toEqual([
      { from: "Ben", to: "Ana", amount: 10500, currency: "GTQ" },
      { from: "Cy", to: "Ana", amount: 10500, currency: "GTQ" },
      { from: "Dee", to: "Ana", amount: 10500, currency: "GTQ" },
    ]);
  });

  it("pairs exact matches first, so one payment squares two people", () => {
    const people = [
      { name: "Ana", net: 500 },
      { name: "Ben", net: 300 },
      { name: "Cy", net: -300 },
      { name: "Dee", net: -500 },
    ];
    expect(settleUp(people, "GTQ")).toEqual([
      { from: "Dee", to: "Ana", amount: 500, currency: "GTQ" },
      { from: "Cy", to: "Ben", amount: 300, currency: "GTQ" },
    ]);
  });

  it("needs at most one payment fewer than the people involved, and recording them squares everyone", () => {
    const r = rng(3);
    for (let round = 0; round < 50; round++) {
      const list = Array.from({ length: 12 }, () => expense(Math.round(r() * 50_000) / 100 + 1, ALL[Math.floor(r() * 4)], ALL.filter(() => r() < 0.8).concat("Ana").filter((p, i, a) => a.indexOf(p) === i)));
      const [b] = balancesByCurrency(list);
      const plan = settleUp(b.people, "GTQ");
      expect(plan.length).toBeLessThanOrEqual(b.people.filter((p) => p.net !== 0).length - 1);
      const after = balancesByCurrency([...list, ...plan.map((t, i) => settlement(t, { id: `e_p${i}`, date: "2026-11-30", by: "Ana", at: 1 }))]);
      expect(after[0].people.every((p) => p.net === 0)).toBe(true);
    }
  });

  it("has nothing to do when everyone is square", () => {
    expect(settleUp([{ name: "Ana", net: 0 }], "GTQ")).toEqual([]);
  });
});

describe("currencies", () => {
  const rates: Rates = { base: "USD", date: "2026-10-31", rates: { GTQ: 7.7, EUR: 0.9, JPY: 150 } };

  it("works out cross rates from one base", () => {
    expect(rateBetween(rates, "USD", "GTQ")).toBe(7.7);
    expect(rateBetween(rates, "GTQ", "USD")).toBeCloseTo(1 / 7.7, 12);
    expect(rateBetween(rates, "EUR", "GTQ")).toBeCloseTo(7.7 / 0.9, 12);
    expect(rateBetween(rates, "GTQ", "XXX")).toBeNull();
    expect(rateBetween(null, "GTQ", "GTQ")).toBe(1);
  });

  it("locks a rate onto an expense only when it needs converting", () => {
    expect(fxFor("USD", "USD", rates)).toBeUndefined();
    expect(fxFor("GTQ", "USD", null)).toBeUndefined();
    expect(fxFor("GTQ", "USD", rates)).toEqual({ to: "USD", rate: 0.12987013, on: "2026-10-31" });
  });

  it("converts with each expense's own locked rate, so totals don't drift when rates move", () => {
    const list = [expense(770, "Ana", ALL, { fx: { to: "USD", rate: 0.1, on: "2026-11-01" } }), expense(40, "Ben", ["Ana", "Ben"], { currency: "USD" })];
    const c = combinedBalances(list, "USD", rates);
    // Q770 at the locked 0.1 is $77 (today's rate would make it $100).
    expect(c.spent).toBe(7700 + 4000);
    expect(net(c)).toEqual({ Ana: 5775 - 2000, Ben: -1925 + 2000, Cy: -1925, Dee: -1925 });
    expect(c.approximate).toBe(0);
    expect(c.left).toEqual([]);
  });

  it("uses today's rate for an expense with none locked, and says so", () => {
    const c = combinedBalances([expense(77, "Ana", ["Ana", "Ben"])], "USD", rates);
    expect(c.approximate).toBe(1);
    expect(net(c)).toEqual({ Ana: 500, Ben: -500 });
  });

  it("leaves out what can't be converted with no rates at all", () => {
    const e = expense(77, "Ana", ["Ana", "Ben"]);
    const c = combinedBalances([e, expense(10, "Ben", ["Ana", "Ben"], { currency: "USD" })], "USD", null);
    expect(c.left).toEqual([e]);
    expect(net(c)).toEqual({ Ben: 500, Ana: -500 });
  });

  it("rounds converted balances so they still add up to zero", () => {
    // Q100 among three at 1/7.7: $4.329… each. Rounded separately the cents wouldn't balance.
    const c = combinedBalances([expense(100, "Ana", ["Ana", "Ben", "Cy"]), expense(100, "Ben", ["Ana", "Ben", "Cy"])], "USD", rates);
    expect(sum(c.people.map((p) => p.net))).toBe(0);
    expect(roundToSum([1.4, 1.4, -2.8])).toEqual([2, 1, -3]);
    expect(sum(roundToSum([0.333, 0.333, 0.334]))).toBe(1);
  });

  it("converts between currencies with different decimals", () => {
    const c = combinedBalances([expense(1500, "Ana", ["Ana", "Ben"], { currency: "JPY" })], "USD", rates);
    expect(net(c)).toEqual({ Ana: 500, Ben: -500 });
  });
});

describe("expense ops", () => {
  const add = (e: Expense): Op => ({ op: "expense.add", expense: e });

  it("logs, edits and removes, and each undo puts the trip back exactly", () => {
    const e = expense(420, "Ana", ALL, { note: "Tip included" });
    const added = prepareChange(state(), [add(e)], { author: "Ana" });
    if (!added.ok) throw new Error(added.issues[0].message);
    expect(added.trip.expenses).toEqual([e]);
    expect(added.entry.summary).toEqual(["logged “Dinner”, Q420 paid by Ana"]);

    const edited = prepareChange(state(added.trip, 2), [{ op: "expense.update", id: e.id, set: { amount: 480, note: null, split: { how: "equal", among: ["Ana", "Ben"] } } }], { author: "Ben" });
    if (!edited.ok) throw new Error(edited.issues[0].message);
    expect(edited.trip.expenses![0]).toMatchObject({ amount: 480, split: { how: "equal", among: ["Ana", "Ben"] } });
    expect(edited.trip.expenses![0].note).toBeUndefined();
    expect(edited.entry.summary).toEqual(["edited the expense “Dinner”"]);

    const undoEdit = prepareChange(state(edited.trip, 3), edited.entry.inverse, { author: "Ben" });
    expect(undoEdit.ok && undoEdit.trip).toEqual(added.trip);

    const removed = prepareChange(state(added.trip, 2), [{ op: "expense.remove", id: e.id }], { author: "Ana" });
    if (!removed.ok) throw new Error(removed.issues[0].message);
    // The last one gone: no list at all, the same as a trip from before expenses.
    expect("expenses" in removed.trip).toBe(false);
    expect(removed.trip).toEqual(base);
    const undoRemove = prepareChange(state(removed.trip, 3), removed.entry.inverse, { author: "Ana" });
    expect(undoRemove.ok && undoRemove.trip).toEqual(added.trip);
  });

  it("describes paying back in words", () => {
    const s = settlement({ from: "Ben", to: "Ana", amount: 35000, currency: "GTQ" }, { id: "e_s1", date: "2026-11-28", by: "Ben", at: 1 });
    const r = prepareChange(state(), [add(s)], { author: "Ben" });
    expect(r.ok && r.entry.summary).toEqual(["recorded Ben paid Ana Q350"]);
    if (!r.ok) return;
    const gone = prepareChange(state(r.trip, 2), [{ op: "expense.remove", id: s.id }], { author: "Ben" });
    expect(gone.ok && gone.entry.summary).toEqual(["removed the payment from Ben to Ana"]);
  });

  it("refuses an edit that would make set amounts stop adding up", () => {
    const e = expense(420, "Ana", { how: "exact", among: [{ name: "Ana", amount: 300 }, { name: "Ben", amount: 120 }] });
    const added = prepareChange(state(), [add(e)], { author: "Ana" });
    if (!added.ok) throw new Error();
    const r = prepareChange(state(added.trip, 2), [{ op: "expense.update", id: e.id, set: { amount: 500 } }], { author: "Ana" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0].message).toContain("The split adds up to Q420, not Q500");
  });

  it("never stores a card number, even in a receipt's note", () => {
    const r = prepareChange(state(), [add(expense(420, "Ana", ALL, { title: "Dinner 4111 1111 1111 1111", note: "Visa 4111-1111-1111-1111 cvv 123" }))], { author: "Ana" });
    if (!r.ok) throw new Error(r.issues[0].message);
    expect(r.trip.expenses![0].title).toBe("Dinner [card number removed]");
    expect(r.trip.expenses![0].note).toBe("Visa [card number removed] cvv [removed]");
  });

  it("keeps working after someone who paid leaves the group", () => {
    const added = prepareChange(state(), [add(expense(420, "Dee", ALL))], { author: "Dee" });
    if (!added.ok) throw new Error();
    const r = prepareChange(state(added.trip, 2), [{ op: "trip.update", set: { people: ["Ana", "Ben", "Cy"] } }], { author: "Ana" });
    expect(r.ok).toBe(true);
  });

  it("refuses a second expense with the same id", () => {
    const e = expense(10, "Ana", ["Ana"]);
    const r = prepareChange(state(), [add(e), add(e)], { author: "Ana" });
    expect(!r.ok && r.issues[0].code).toBe("duplicate");
  });

  it("can't edit an expense someone already removed", () => {
    const r = prepareChange(state(), [{ op: "expense.update", id: "e_gone", set: { title: "Lunch" } }], { author: "Ana" });
    expect(!r.ok && r.issues[0].code).toBe("missing");
  });
});

describe("existing trips", () => {
  it("need nothing filled in: a trip saved before expenses has none", () => {
    expect(upgradeTrip(base)).toBe(base);
    expect("expenses" in upgradeTrip({ ...base, expenses: [] })).toBe(false);
    const withOne = { ...base, expenses: [expense(1, "Ana", ["Ana"])] };
    expect(upgradeTrip(withOne)).toBe(withOne);
  });
});

describe("reading an expense from one line", () => {
  // Thu Nov 26 at noon in Antigua, during the trip.
  const ctx = { trip: base, nowMs: Date.parse("2026-11-26T18:00:00Z"), me: "Sam" };
  const read = (line: string, c: Partial<typeof ctx & { day: string }> = {}) => {
    const p = parseLine(line, { ...ctx, ...c });
    if (p.type !== "expense") throw new Error(`${line} → ${p.type}`);
    return p.draft;
  };
  const group = ["Sam", "Ana", "Ben", "Cy", "Dee"];

  it("reads the composer's example", () => {
    expect(read("dinner 420 GTQ paid by Ana split all")).toEqual({ title: "Dinner", amount: 420, currency: "GTQ", paidBy: "Ana", among: group, date: "2026-11-26", unknown: [] });
  });

  it("reads symbols, codes and the trip's own currency", () => {
    expect(read("taxi Q80 split all")).toMatchObject({ title: "Taxi", amount: 80, currency: "GTQ", paidBy: "Sam" });
    expect(read("groceries $54.50 paid by ben")).toMatchObject({ title: "Groceries", amount: 54.5, currency: "USD", paidBy: "Ben" });
    expect(read("tuk tuk 1,200 split")).toMatchObject({ title: "Tuk tuk", amount: 1200, currency: "GTQ" });
    expect(read("museum 20 usd split")).toMatchObject({ title: "Museum", amount: 20, currency: "USD" });
    expect(read("souvenirs €15.255 paid by Cy")).toMatchObject({ amount: 15.26, currency: "EUR" });
    expect(read("boat MX$300 split")).toMatchObject({ currency: "MXN", amount: 300 });
  });

  it("knows who paid from how people say it", () => {
    expect(read("I paid 420 for dinner")).toMatchObject({ title: "Dinner", paidBy: "Sam" });
    expect(read("Ana paid 120 for coffee")).toMatchObject({ title: "Coffee", paidBy: "Ana" });
    expect(read("spent 80 on a taxi")).toMatchObject({ title: "A taxi", paidBy: "Sam" });
    expect(read("we paid 300 for the boat")).toMatchObject({ title: "The boat", paidBy: "Sam" });
  });

  it("knows who shares it", () => {
    expect(read("taxi Q80 split with Ben").among).toEqual(["Sam", "Ben"]);
    expect(read("lunch 200 paid by Ana split with Ben").among).toEqual(["Ana", "Ben"]);
    expect(read("lunch 200 split Ana Ben").among).toEqual(["Ana", "Ben"]);
    expect(read("lunch 200 split between ana, ben and me").among).toEqual(["Ana", "Ben", "Sam"]);
    expect(read("lunch 200 split it 3 ways").among).toEqual(group);
    expect(read("split dinner 300").among).toEqual(group);
  });

  it("points out names that aren't in the group", () => {
    expect(read("lunch 200 paid by Zoe split Ana")).toMatchObject({ paidBy: "Sam", among: ["Ana"], unknown: ["Zoe"] });
  });

  it("uses the day said, the day on screen, or today", () => {
    expect(read("dinner 300 paid by Ana yesterday").date).toBe("2026-11-25");
    expect(read("dinner 300 paid by Ana", { day: "2026-11-28" }).date).toBe("2026-11-28");
    expect(read("dinner 300 paid by Ana").title).toBe("Dinner");
  });

  it("doesn't mistake times, dates or words for amounts and currencies", () => {
    expect(read("dinner 7pm 420 paid by Ana")).toMatchObject({ amount: 420, title: "Dinner 7pm" });
    expect(read("dinner for 4 paid 420")).toMatchObject({ amount: 420 });
    // "all" next to a number is a word, not Albanian lek.
    expect(read("drinks 40 all split")).toMatchObject({ amount: 40, currency: "GTQ" });
  });

  it("leaves plans, prices and questions alone", () => {
    expect(parseLine("dinner thu 7 at sabe rico", ctx).type).toBe("item");
    expect(parseLine("zipline Q450", ctx).type).toBe("item");
    expect(parseLine("who paid for dinner?", ctx).type).toBe("ask");
    expect(parseLine("paid", ctx).type).toBe("item");
    // Without who's typing (the old composer), no expenses.
    expect(parseLine("taxi Q80 split all", { trip: base, nowMs: ctx.nowMs }).type).toBe("item");
  });
});
