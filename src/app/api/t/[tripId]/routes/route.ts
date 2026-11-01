import { NextResponse } from "next/server";
import { routeKeys } from "@/domain/travel";
import { getStore, jsonError, requireSession } from "@/server/http";
import { getRouteCache, getRouter, lookupRoutes } from "@/server/routing";

/** Requests per trip per minute: phones ask on open and when the trip changes. */
const REQUESTS_PER_MINUTE = 30;
/** Router lookups per trip per hour, and for the whole site per day (openrouteservice's free day is 2,000). */
const LOOKUPS_PER_TRIP_HOUR = 150;
const LOOKUPS_PER_DAY = 1500;

/**
 * Road times for every leg between the trip's stops, worked out from the
 * stored trip (never from coordinates sent in), so this can't be used to
 * route anywhere else. { routes: { key: { s, m } | null }, pending, provider }
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const store = getStore();
  if ((await store.hit(`routes:req:${tripId}`, 60)) > REQUESTS_PER_MINUTE) return jsonError(429, "Too many route lookups. Try again in a minute.");
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  const answer = await lookupRoutes(routeKeys(state.trip), {
    cache: getRouteCache(),
    router: getRouter(),
    allow: async () => (await store.hit("routes:day", 86_400)) <= LOOKUPS_PER_DAY && (await store.hit(`routes:trip:${tripId}`, 3600)) <= LOOKUPS_PER_TRIP_HOUR,
  });
  return NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } });
}
