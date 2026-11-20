import { NextResponse } from "next/server";
import { bookingAddress, digest, importBookingEmail } from "@/server/bookings";
import { getStore, jsonError, rateLimit, readJson, requireSession } from "@/server/http";

export const maxDuration = 60;
type Context = { params: Promise<{ tripId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const store = getStore();
  if (!await store.get(tripId)) return jsonError(404, "No such trip.");
  return NextResponse.json({ address: await bookingAddress(store, tripId) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: Context) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const limited = await rateLimit(request, "booking-email", 30, 3600);
  if (limited) return limited;
  const parsed = await readJson(request, 100_000);
  if (!parsed.ok) return parsed.res;
  const text = parsed.body.text;
  if (typeof text !== "string" || !text.trim() || text.length > 60_000) return jsonError(400, "Paste an email up to 60,000 characters.");
  const store = getStore();
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  try {
    const result = await importBookingEmail(store, state.trip, text, `paste:${digest(text.trim())}`, `${auth.session.name} via email import`);
    if (!result) return jsonError(503, "Email reading isn't set up yet. You can still add booking details manually.");
    return NextResponse.json(result);
  } catch {
    return jsonError(502, "Couldn't read or save that email. Try again or add it manually.");
  }
}
