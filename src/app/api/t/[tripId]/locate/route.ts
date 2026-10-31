import { NextResponse } from "next/server";
import { geoDeps, locateTrip } from "@/server/geocode";
import { getStore, jsonError, requireSession } from "@/server/http";

/**
 * The map's backfill: finds coordinates for items that have a place but no
 * pin yet (a few per call, within Nominatim's one-a-second limit) and saves
 * them as an ordinary change, so they sync and can be undone like any other.
 * Answers which items were placed, which couldn't be found, and how many are
 * still to try; the map calls again while some are left.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const store = getStore();
  if ((await store.hit(`locate:${tripId}`, 60)) > 20) return jsonError(429, "Placing pins is busy. Try again in a minute.");
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");

  const found = await locateTrip(state.trip, geoDeps(store, { budgetMs: 8000, maxLookups: 8 }));
  let version = state.version;
  let located: string[] = [];
  if (found.ops.length) {
    const r = await store.apply(tripId, found.ops, { author: `${auth.session.name} via map`, accountId: auth.session.accountId });
    if (r.ok) {
      version = r.state.version;
      located = found.ops.map((o) => o.id);
    }
  }
  return NextResponse.json({ located, notFound: found.notFound, pending: found.pending, version }, { headers: { "Cache-Control": "no-store" } });
}
