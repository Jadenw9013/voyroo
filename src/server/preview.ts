import "server-only";
import { timingSafeEqual } from "node:crypto";
import { withoutDiscussion } from "@/domain/discuss";
import { getStore } from "./db";
import { TRIP_ID } from "./http";

/** A viewing token authorizes only this read; it never creates a trip session. Votes and comments stay with the group. */
export async function previewTrip(tripId: string, token: string) {
  if (!TRIP_ID.test(tripId) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const store = getStore();
  const expected = await store.getPreview(tripId);
  if (!expected || expected.length !== token.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return null;
  const state = await store.get(tripId);
  return state && { ...state, trip: withoutDiscussion(state.trip) };
}
