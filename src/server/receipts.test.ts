import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { normalizeReceipt } from "./receipts";
import { MemoryBackend, RECEIPT_DRAFT_SECONDS, RECEIPT_UNDO_SECONDS, TripStore } from "./store";
import type { Expense, Trip } from "@/domain/types";

const trip: Trip = { schema: 2, id: "trip-a", name: "Paris", destination: "Paris", startDate: "2026-12-01", endDate: "2026-12-04", tz: "Europe/Paris", currency: "EUR", people: ["Ana"], items: [], todos: [] };
const receiptId = `r-${"a".repeat(48)}`;
const expense: Expense = { id: "e1", date: trip.startDate, title: "Dinner", currency: "EUR", amount: 22, paidBy: "Ana", split: { how: "equal", among: ["Ana"] }, addedAt: 1, receiptId };
const meta = { author: "Ana" };

it("checks the actual raster format before decoding the image", async () => {
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  expect(await normalizeReceipt(`data:image/jpeg;base64,${bytes.toString("base64")}`)).toBeNull();
});

describe("receipt storage lifecycle", () => {
  let store: TripStore;
  const advance = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);
  beforeEach(async () => {
    vi.useFakeTimers();
    store = new TripStore(new MemoryBackend());
    await store.create(trip, "pass-hash");
  });
  afterEach(() => vi.useRealTimers());

  it("expires abandoned uploads, rejecting expired/cross-trip references without changing the expense ledger", async () => {
    await store.stageReceipt("other-trip", receiptId, "bytes");
    expect(await store.apply(trip.id, [{ op: "expense.add", expense }], meta)).toMatchObject({ ok: false, reason: "invalid" });
    await store.stageReceipt(trip.id, receiptId, "bytes");
    advance(RECEIPT_DRAFT_SECONDS + 1);
    expect(await store.getReceipt(trip.id, receiptId)).toBeNull();
    expect(await store.apply(trip.id, [{ op: "expense.add", expense }], meta)).toMatchObject({ ok: false, reason: "invalid" });
    expect((await store.get(trip.id))?.version).toBe(1);
    expect(await store.history(trip.id)).toHaveLength(0);
  });

  it("retains a shared photo, allows undo, and releases it after the last reference is removed", async () => {
    await store.stageReceipt(trip.id, receiptId, "bytes");
    const add = await store.apply(trip.id, [
      { op: "expense.add", expense },
      { op: "expense.add", expense: { ...expense, id: "e2" } },
    ], meta);
    expect(add.ok).toBe(true);
    await store.stageReceipt(trip.id, receiptId, "bytes");
    expect((await store.apply(trip.id, [{ op: "expense.remove", id: "e1" }], meta)).ok).toBe(true);
    advance(RECEIPT_UNDO_SECONDS + 1);
    expect(await store.getReceipt(trip.id, receiptId)).toBe("bytes");
    const removed = await store.apply(trip.id, [{ op: "expense.remove", id: "e2" }], meta);
    if (!removed.ok) throw new Error("Expense removal failed");
    advance(RECEIPT_UNDO_SECONDS - 1);
    expect((await store.undo(trip.id, removed.entry.id, "Ana")).ok).toBe(true);
    advance(RECEIPT_UNDO_SECONDS + 1);
    expect(await store.getReceipt(trip.id, receiptId)).toBe("bytes");
    expect((await store.apply(trip.id, [{ op: "expense.update", id: "e2", set: { receiptId: null } }], meta)).ok).toBe(true);
    advance(RECEIPT_UNDO_SECONDS + 1);
    expect(await store.getReceipt(trip.id, receiptId)).toBeNull();
  });
});
