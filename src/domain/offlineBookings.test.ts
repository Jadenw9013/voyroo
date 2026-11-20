import { describe, expect, it } from "vitest";
import { offlineBookings } from "./offlineBookings";
import { TripSchema } from "./schema";
import { applyOp } from "./ops";
import type { Trip } from "./types";

const trip: Trip = { schema: 2, id: "trip", name: "Holiday", destination: "Paris", startDate: "2026-12-01", endDate: "2026-12-05", tz: "Europe/Paris", currency: "EUR", people: ["Sam"], todos: [], items: [{ id: "hotel", kind: "stay", title: '<script>alert("x")</script>', start: { date: "2026-12-01", time: "15:00" }, end: { date: "2026-12-05" }, booking: { state: "booked", source: "Expedia.com", confirmation: "REF123", note: "Free cancellation", price: { amount: 400, currency: "EUR" } } }] };

describe("offline bookings", () => {
  it("includes booking details in a standalone, escaped document", () => {
    const html = offlineBookings(trip, "2026-11-20");
    for (const text of ["Expedia.com", "REF123", "15:00", "Europe/Paris", "Free cancellation", "400 EUR", "2026-11-20"]) expect(html).toContain(text);
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/<img|<link|src=/);
    expect(html).toContain("&lt;script&gt;");
  });
  it("retains source and receipt references through serialization, editing and undo", () => {
    const changed = applyOp(trip, { op: "item.update", id: "hotel", set: { booking: { source: "Direct" } } });
    expect(TripSchema.parse(JSON.parse(JSON.stringify(changed.trip))).items[0].booking?.source).toBe("Direct");
    expect(applyOp(changed.trip, changed.inverse[0]).trip).toEqual(trip);
    const withReceipt = applyOp(trip, { op: "expense.add", expense: { id: "e", title: "Dinner", amount: 20, currency: "EUR", paidBy: "Sam", date: "2026-12-01", split: { how: "equal", among: ["Sam"] }, addedAt: 0, receiptId: "r-test" } });
    expect(TripSchema.parse(JSON.parse(JSON.stringify(withReceipt.trip))).expenses?.[0].receiptId).toBe("r-test");
  });
});
