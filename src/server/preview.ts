import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Item, Trip, TripState } from "@/domain/types";
import { getStore } from "./db";
import { TRIP_ID } from "./http";

/** Whether `token` is the trip's current viewing token. It authorizes reads only; it never creates a trip session. */
export async function previewAllowed(tripId: string, token: string): Promise<boolean> {
  if (!TRIP_ID.test(tripId) || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = await getStore().getPreview(tripId);
  return !!expected && expected.length === token.length && timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/**
 * What a viewing link may show: where and when things are, and whether
 * they're booked. Not notes (door codes, wifi), contacts, saved links,
 * confirmation numbers, prices, who booked or runs what, to-dos, checklists
 * or the group's names. Built field by field, so a new field stays private
 * until it's added here.
 */
export function publicTrip(trip: Trip): Trip {
  return {
    schema: trip.schema,
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    tz: trip.tz,
    currency: trip.currency,
    ...(trip.cover ? { cover: trip.cover } : {}),
    people: [],
    items: trip.items.map(publicItem),
    todos: [],
  };
}

function publicItem(item: Item): Item {
  const place = item.place && {
    ...(item.place.name ? { name: item.place.name } : {}),
    ...(item.place.address ? { address: item.place.address } : {}),
    ...(item.place.mapsUrl ? { mapsUrl: item.place.mapsUrl } : {}),
    ...(typeof item.place.lat === "number" ? { lat: item.place.lat } : {}),
    ...(typeof item.place.lng === "number" ? { lng: item.place.lng } : {}),
  };
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    ...(item.start ? { start: item.start } : {}),
    ...(item.end ? { end: item.end } : {}),
    ...(place ? { place } : {}),
    ...(item.booking ? { booking: { state: item.booking.state } } : {}),
    ...(item.maybe ? { maybe: true } : {}),
    ...(item.sleepsHere ? { sleepsHere: true } : {}),
    ...(typeof item.peakM === "number" ? { peakM: item.peakM } : {}),
  };
}

/** The trip as a viewing link shows it (with how many are going, not who), or null when the token isn't (or is no longer) valid. */
export async function previewTrip(tripId: string, token: string): Promise<(TripState & { travelers: number }) | null> {
  if (!(await previewAllowed(tripId, token))) return null;
  const state = await getStore().get(tripId);
  return state && { trip: publicTrip(state.trip), version: state.version, travelers: state.trip.people.length };
}
