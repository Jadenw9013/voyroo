import { afterEach, describe, expect, it, vi } from "vitest";
import type { Rates } from "@/domain/expenses";
import type { Trip } from "@/domain/types";
import { seedTrip, SEED_TRIP_ID } from "../seed";
import { MemoryBackend, TripStore } from "../store";
import { importScreenshot } from "./importShot";
import { buildTools, type ChangeResult } from "./tools";

const rates: Rates = { base: "USD", date: "2026-11-01", rates: { GTQ: 8, EUR: 0.9 } };

/** The assistant's tools on a fresh copy of the seed trip, with a group of four. */
async function setup() {
  const store = new TripStore(new MemoryBackend());
  await store.get(SEED_TRIP_ID);
  await store.apply(SEED_TRIP_ID, [{ op: "trip.update", set: { people: ["Jaden", "Ana", "Ben", "Cy"] } }], { author: "Jaden" });
  const trip = async () => (await store.get(SEED_TRIP_ID))!.trip;
  const tools = buildTools({ store, tripId: SEED_TRIP_ID, me: "Jaden", trip, rates: async () => rates });
  const run = async (input: unknown) => (await (tools.add_expenses.execute as (i: unknown, o: unknown) => Promise<ChangeResult>)(input, { toolCallId: "t", messages: [] })) as ChangeResult;
  return { store, run, trip };
}

describe("assistant: add_expenses", () => {
  it("logs what the person paid, split with everyone, with today's rate locked in", async () => {
    const { run, trip } = await setup();
    const r = await run({ expenses: [{ title: "Dinner at Sabe Rico", amount: 420 }] });
    expect(r.ok).toBe(true);
    const [e] = (await trip()).expenses!;
    expect(e).toMatchObject({ title: "Dinner at Sabe Rico", amount: 420, currency: "GTQ", paidBy: "Jaden", split: { how: "equal", among: ["Jaden", "Ana", "Ben", "Cy"] }, addedBy: "Jaden" });
    expect(e.fx).toEqual({ to: "USD", rate: 0.125, on: "2026-11-01" });
    expect(r.ok && "summary" in r && r.summary).toEqual(["logged “Dinner at Sabe Rico”, Q420 paid by Jaden"]);
  });

  it("uses who paid and who shares it, matching names from the group", async () => {
    const { run, trip } = await setup();
    await run({ expenses: [{ title: "Taxi", amount: 80.555, paidBy: "ana", splitAmong: ["ana", "BEN"], currency: "usd", date: "2026-11-27" }] });
    expect((await trip()).expenses![0]).toMatchObject({ amount: 80.56, currency: "USD", paidBy: "Ana", split: { how: "equal", among: ["Ana", "Ben"] }, date: "2026-11-27" });
  });

  it("refuses a payer who isn't in the group, and changes nothing", async () => {
    const { run, trip } = await setup();
    const r = await run({ expenses: [{ title: "Boat", amount: 300, paidBy: "Lucía" }] });
    expect(r).toEqual({ ok: false, error: "Lucía isn't in the group (Jaden, Ana, Ben, Cy)." });
    expect((await trip()).expenses).toBeUndefined();
  });

  it("refuses set amounts that don't add up", async () => {
    const { run } = await setup();
    const r = await run({ expenses: [{ title: "Hotel", amount: 900, exactAmounts: [{ name: "Ana", amount: 500 }, { name: "Ben", amount: 300 }] }] });
    expect(r.ok).toBe(false);
    expect("error" in r && r.error).toContain("The split adds up to Q800, not Q900");
  });

  it("can be undone like any other change", async () => {
    const { store, run, trip } = await setup();
    const r = await run({ expenses: [{ title: "Park fees", amount: 400 }] });
    if (!r.ok || !("entryId" in r)) throw new Error("not applied");
    const entry = (await store.history(SEED_TRIP_ID)).find((x) => x.id === r.entryId)!;
    expect(entry.author).toBe("Jaden via assistant");
    await store.undo(SEED_TRIP_ID, r.entryId, "Jaden");
    expect("expenses" in (await trip())).toBe(false);
  });
});

describe("screenshot import with receipts as expenses", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("logs a paid receipt as an expense, without the card number", async () => {
    vi.stubEnv("CHAT_MOCK", "1");
    vi.stubEnv("RATES_MOCK", "1");
    const { store, trip } = await setup();
    const r = await importScreenshot({ store, tripId: SEED_TRIP_ID, me: "Jaden", image: { data: "iVBORw0KGgo=", mediaType: "image/png" }, index: 1, total: 1, expenses: true });
    expect(r?.results.some((x) => x.ok)).toBe(true);
    const [e] = (await trip()).expenses!;
    expect(e).toMatchObject({ title: "Test receipt 1", amount: 150, paidBy: "Jaden" });
    expect(e.note).toBe("Paid by card [card number removed]");
  });

  it("records only the booking when receipts are off", async () => {
    vi.stubEnv("CHAT_MOCK", "1");
    const { store, trip } = await setup();
    await importScreenshot({ store, tripId: SEED_TRIP_ID, me: "Jaden", image: { data: "iVBORw0KGgo=", mediaType: "image/png" }, index: 1, total: 1 });
    const t = await trip();
    expect(t.expenses).toBeUndefined();
    expect(t.items.some((i) => i.title === "Test Posada 1")).toBe(true);
  });
});

describe("trips stored before expenses", () => {
  it("load, take an expense, and undo back to exactly what was stored", async () => {
    const backend = new MemoryBackend();
    const old: Trip = { ...seedTrip("old-trip"), people: ["Ana", "Ben"] };
    await backend.init("old-trip", JSON.stringify({ ...old, expenses: [] }));
    const store = new TripStore(backend);
    expect("expenses" in (await store.get("old-trip"))!.trip).toBe(false);
    const expense = { id: "e_first", title: "Coffee", amount: 60, currency: "GTQ", paidBy: "Ana", split: { how: "equal" as const, among: ["Ana", "Ben"] }, date: "2026-11-25", addedAt: 1 };
    const r = await store.apply("old-trip", [{ op: "expense.add", expense }], { author: "Ana" });
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.trip.expenses).toEqual([expense]);
    await store.undo("old-trip", r.entry.id, "Ana");
    expect((await store.get("old-trip"))!.trip).toEqual(old);
  });
});
