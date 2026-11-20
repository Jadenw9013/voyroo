import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, getAll: () => [...jar].map(([name, value]) => ({ name, value })) }) }));
vi.mock("./ai/documents", async (original) => ({ ...await original<typeof import("./ai/documents")>(), extractBookings: vi.fn(), extractReceipt: vi.fn() }));
import { extractBookings, extractReceipt } from "./ai/documents";
import { cookieName, encodeSession } from "./auth";
import { bookingAddress, emailText, importBookingEmail, sameBooking } from "./bookings";
import { setStoreForTests } from "./db";
import { MemoryBackend, TripStore } from "./store";
import { publicTrip } from "./preview";
import { POST as inbound } from "@/app/api/inbound/postmark/route";
import { POST as upload } from "@/app/api/t/[tripId]/receipts/route";
import { GET as receipt } from "@/app/api/t/[tripId]/receipts/[receiptId]/route";
import { GET as inbox, POST as paste } from "@/app/api/t/[tripId]/bookings/route";
import type { Trip } from "@/domain/types";

let store: TripStore;
const trip: Trip = { schema: 2, id: "test-trip", name: "Test trip", destination: "Paris", startDate: "2026-12-01", endDate: "2026-12-10", tz: "Europe/Paris", currency: "EUR", people: ["Sam", "Ana"], items: [], todos: [] };
const booking = { title: "Hotel One", kind: "stay" as const, start: { date: "2026-12-01" }, booking: { state: "booked" as const, source: "Expedia.com", confirmation: "ABC123" } };
const ctx = { params: Promise.resolve({ tripId: trip.id }) };
const post = (body: unknown, auth?: string) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
const get = () => new Request("http://localhost/api");
const secret = "test-booking-secret-01234567890123456789";
const auth = `Basic ${Buffer.from(`voyroo:${secret}`).toString("base64")}`;
function join(tripId = trip.id) { jar.set(cookieName(tripId), encodeSession({ tripId, name: "Sam" })); }

beforeEach(async () => {
  vi.stubEnv("BOOKING_EMAIL_SECRET", secret);
  vi.stubEnv("POSTMARK_INBOUND_ADDRESS", "testhash@inbound.postmarkapp.com");
  store = new TripStore(new MemoryBackend()); setStoreForTests(store); jar.clear();
  await store.create(trip, "unused");
  vi.mocked(extractBookings).mockReset().mockResolvedValue([booking]);
  vi.mocked(extractReceipt).mockReset().mockResolvedValue({ title: "Dinner", amount: 90, currency: "EUR" });
});
afterEach(() => { vi.unstubAllEnvs(); setStoreForTests(undefined); });

describe("booking email imports", () => {
  it("requires membership for address and paste; accepts only authenticated, correctly addressed webhooks", async () => {
    expect((await inbox(get(), ctx)).status).toBe(401);
    expect((await paste(post({ text: "confirmation" }), ctx)).status).toBe(401);
    const address = (await bookingAddress(store, trip.id))!;
    const payload = { MessageID: "message-1", MailboxHash: address.split("+")[1].split("@")[0], OriginalRecipient: address, TextBody: "Booking confirmed" };
    expect((await inbound(post(payload))).status).toBe(401);
    expect((await inbound(post({ ...payload, OriginalRecipient: "other@example.com" }, auth))).status).toBe(403);
    expect((await inbound(post(payload, auth))).status).toBe(200);
    expect((await store.get(trip.id))!.trip.items[0].booking).toEqual(booking.booking);
    expect((await inbound(post(payload, auth))).status).toBe(200);
    expect(extractBookings).toHaveBeenCalledTimes(1);
    expect((await store.get(trip.id))!.trip.items).toHaveLength(1);
    vi.stubEnv("BOOKING_EMAIL_SECRET", `${secret}-rotated`);
    const rotatedAuth = `Basic ${Buffer.from(`voyroo:${secret}-rotated`).toString("base64")}`;
    expect((await inbound(post(payload, rotatedAuth))).status).toBe(403);
  });
  it("keeps the original outcome when delivery is retried after an undo", async () => {
    await importBookingEmail(store, trip, "email", "same", "Sam");
    const entry = (await store.history(trip.id))[0];
    await store.undo(trip.id, entry.id, "Sam");
    const repeated = await importBookingEmail(store, trip, "email", "same", "Sam");
    expect(repeated).toMatchObject({ replayed: true });
    expect((await store.get(trip.id))!.trip.items).toHaveLength(0);
  });
  it("deduplicates reservations but preserves distinct flight legs sharing a reference", async () => {
    await importBookingEmail(store, trip, "email", "first", "Sam");
    expect(await importBookingEmail(store, trip, "email", "forwarded-again", "Sam")).toEqual({ added: 0, skipped: 1 });
    const a = { ...booking, id: "a", kind: "flight" as const };
    expect(sameBooking(a, { ...a, id: "b", start: { date: "2026-12-09" } })).toBe(false);
    expect(sameBooking(a, { ...a, booking: { ...a.booking, source: "Airline" } })).toBe(false);
  });
  it("deduplicates simultaneous independent forwards and replayed deliveries", async () => {
    const results = await Promise.all(["one", "two", "one"].map((key) => importBookingEmail(store, trip, "email", key, "Sam")));
    expect(results.filter((r) => r?.added === 1 && !("replayed" in r))).toHaveLength(1);
    expect((await store.get(trip.id))?.trip.items).toHaveLength(1);
    expect(await store.history(trip.id)).toHaveLength(1);
  });

  it("redacts payment details before model processing and stores only the validated trip change", async () => {
    const docWrites = vi.spyOn(store, "putDocument");
    const note = "CVV: 123";
    vi.mocked(extractBookings).mockResolvedValue([{ ...booking, booking: { ...booking.booking, note } }]);
    await importBookingEmail(store, trip, note, "sensitive", "Sam");
    expect(extractBookings).toHaveBeenCalledWith("CVV: [removed]", trip);
    expect((await store.get(trip.id))?.trip.items[0].booking?.note).toBe("CVV: [removed]");
    expect(JSON.stringify(docWrites.mock.calls)).not.toContain(note);
  });

  it("supports HTML-only bodies without rendering markup and handles empty/model failures", async () => {
    expect(emailText({ HtmlBody: "<style>bad</style><p>ABC &amp; 123</p><script>bad</script>" })).toBe("ABC & 123");
    expect(emailText({ Subject: "Reservation", HtmlBody: "<br>" })).toBe("");
    expect(emailText({ HtmlBody: '<a href="https://hotel.example/booking">Manage booking</a>' })).toContain("https://hotel.example/booking");
    vi.mocked(extractBookings).mockResolvedValue([]);
    expect(await importBookingEmail(store, trip, "unrelated", "empty", "Sam")).toEqual({ added: 0, skipped: 0 });
    vi.mocked(extractBookings).mockResolvedValue(null);
    join();
    expect((await paste(post({ text: "confirmation" }), ctx)).status).toBe(503);
    expect((await paste(post({ text: " " }), ctx)).status).toBe(400);
  });
  it("rejects malformed model data before applying it", async () => {
    vi.mocked(extractBookings).mockResolvedValue([{ ...booking, start: { date: "not-a-date" } }]);
    await expect(importBookingEmail(store, trip, "email", "invalid", "Sam")).rejects.toThrow();
    expect((await store.get(trip.id))!.trip.items).toHaveLength(0);
  });
});

describe("private receipt attachments", () => {
  it("keeps the image, suggests fields without creating expenses, and enforces trip-scoped reads", async () => {
    const image = `data:image/png;base64,${(await sharp({ create: { width: 30, height: 40, channels: 3, background: "white" } }).png().toBuffer()).toString("base64")}`;
    expect((await upload(post({ image }), ctx)).status).toBe(401);
    join();
    const res = await upload(post({ image }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.amount).toBe(90);
    expect((await store.get(trip.id))!.trip.expenses).toBeUndefined();
    const context = { params: Promise.resolve({ tripId: trip.id, receiptId: body.receiptId }) };
    const photo = await receipt(get(), context);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(photo.headers.get("cache-control")).toContain("no-store");
    expect((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).format).toBe("jpeg");
    join("other-trip");
    expect((await receipt(get(), { params: Promise.resolve({ tripId: "other-trip", receiptId: body.receiptId }) })).status).toBe(404);
    jar.clear(); expect((await receipt(get(), context)).status).toBe(401);
  });
  it("allows manual entry if OCR fails, deduplicates storage, rejects fake image data", async () => {
    join(); vi.mocked(extractReceipt).mockRejectedValue(new Error("unavailable"));
    const image = `data:image/png;base64,${(await sharp({ create: { width: 5, height: 5, channels: 3, background: "white" } }).png().toBuffer()).toString("base64")}`;
    const a = await (await upload(post({ image }), ctx)).json();
    const b = await (await upload(post({ image }), ctx)).json();
    expect(a.receiptId).toBe(b.receiptId);
    expect(a.warning).toContain("enter them below");
    expect((await upload(post({ image: "data:image/png;base64,YWJj" }), ctx)).status).toBe(400);
    expect(publicTrip({ ...trip, expenses: [{ id: "e", title: "Dinner", amount: 90, currency: "EUR", paidBy: "Sam", split: { how: "equal", among: ["Sam", "Ana"] }, date: "2026-12-01", receiptId: a.receiptId, addedAt: 0 }] }).expenses).toBeUndefined();
  });
});
