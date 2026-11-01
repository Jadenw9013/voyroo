import { NextResponse } from "next/server";
import { getStore, jsonError, requireSession } from "@/server/http";
import { previewRequest } from "@/server/preview";
import { tripWeather, weatherService } from "@/server/weather";

/** Each trip's phones together: plenty for opening screens, not enough to run up the weather service's quota. */
const PER_TEN_MINUTES = 60;
/** Everyone holding the trip's viewing link, together: a smaller share of the same budget. */
const VIEWERS_PER_TEN_MINUTES = 30;

/**
 * The trip's weather, day by day: forecasts for the next 16 days, typical
 * weather after that. For the group, or (`?token=`) for the viewing link's page.
 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  const viewer = !auth.ok && (await previewRequest(request, tripId));
  if (!auth.ok && !viewer) return auth.res;
  const store = getStore();
  if (viewer && process.env.WEATHER !== "stub" && (await store.hit(`weather:view:${tripId}`, 600)) > VIEWERS_PER_TEN_MINUTES) return jsonError(429, "The weather was just checked. Try again in a few minutes.");
  // The stand-in (WEATHER=stub, end-to-end tests) has no quota to protect.
  if (process.env.WEATHER !== "stub" && (await store.hit(`weather:${tripId}`, 600)) > PER_TEN_MINUTES) return jsonError(429, "The weather was just checked. Try again in a few minutes.");
  const svc = weatherService();
  if (!svc) return jsonError(503, "Weather is switched off on this site.");
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  const report = await tripWeather(state.trip, svc);
  return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
}
