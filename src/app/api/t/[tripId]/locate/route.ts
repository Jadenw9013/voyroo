import { NextResponse } from "next/server";
import { geoDeps, locateTrip, mapsCanonical } from "@/server/geocode";
import { getStore, jsonError, requireSession } from "@/server/http";

const NO_STORE = { "Cache-Control": "no-store" };

/** Room for the backfill's budget (15 s) plus saving: asking Google Maps about an unfound place takes seconds. */
export const maxDuration = 30;

/**
 * The map's backfill: finds coordinates for items that have a place but no
 * pin yet (a few per call, within Nominatim's one-a-second limit) and saves
 * them as an ordinary change, so they sync and can be undone like any other.
 * Answers which items were placed, which couldn't be found, and how many are
 * still to try; the map calls again while some are left.
 *
 * Every map that opens asks, so once a version of the trip has nothing left
 * to place, that answer is kept and given straight back until the trip changes.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const store = getStore();
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  const done = `locate:done:${tripId}:${state.version}`;
  const known = await store.getCache(done);
  if (known) return NextResponse.json({ located: [], notFound: JSON.parse(known), pending: 0, version: state.version }, { headers: NO_STORE });
  if ((await store.hit(`locate:${tripId}`, 60)) > 20) return jsonError(429, "Placing pins is busy. Try again in a minute.");

  // The backfill has time for the last resort that saving a change doesn't: asking Google Maps what an unfound place is called.
  const found = await locateTrip(state.trip, geoDeps(store, { budgetMs: 15_000, maxLookups: 8, canonical: mapsCanonical(store) }));
  let version = state.version;
  let located: string[] = [];
  if (found.ops.length) {
    const r = await store.apply(tripId, found.ops, { author: `${auth.session.name} via map`, accountId: auth.session.accountId });
    if (r.ok) {
      version = r.state.version;
      located = found.ops.map((o) => o.id);
    }
  } else if (!found.pending) {
    await store.setCache(done, JSON.stringify(found.notFound), 24 * 3600);
  }
  return NextResponse.json({ located, notFound: found.notFound, pending: found.pending, version }, { headers: NO_STORE });
}
