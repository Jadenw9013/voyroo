import "server-only";
import { timingSafeEqual } from "node:crypto";
import { isPost } from "@/domain/links";
import { defaultTempUnit, type TempUnit } from "@/domain/weather";
import type { Essentials, Item, Link, Trip, TripState } from "@/domain/types";
import { getStore } from "./db";
import { TRIP_ID } from "./http";

/** Whether `token` is the trip's current viewing token. It authorizes reads only; it never creates a trip session. */
export async function previewAllowed(tripId: string, token: string): Promise<boolean> {
  if (!TRIP_ID.test(tripId) || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = await getStore().getPreview(tripId);
  return !!expected && expected.length === token.length && timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/**
 * What a viewing link may show: what a traveller needs on the road. Times,
 * places and addresses, whether each thing is booked, the booking link (unless
 * it carries the confirmation), a business's phone, WhatsApp, website and
 * Instagram (stays, tours and transport), saved TikToks, Reels and videos,
 * and the trip's essentials. Never notes (door codes, wifi), confirmation
 * numbers, prices, emails, who booked or runs what, expenses, packing, votes,
 * comments, to-dos, checklists or the group's names. Built field by field,
 * so a new field stays private until it's added here.
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
    ...(trip.essentials ? { essentials: publicEssentials(trip.essentials) } : {}),
    people: [],
    items: trip.items.map(publicItem),
    todos: [],
  };
}

/** The essentials as written, with when they were checked but not by whom. */
function publicEssentials(e: Essentials): Essentials {
  const text = (["nationality", "emergency", "embassy", "entry", "money", "tipping", "plugs", "water", "draftedOn", "checkedOn"] as const).flatMap((k) => (e[k] ? [[k, e[k]] as const] : []));
  return {
    ...Object.fromEntries(text),
    ...(e.sources?.length ? { sources: e.sources.map((s) => ({ url: s.url, ...(s.title ? { title: s.title } : {}) })) } : {}),
  };
}

/** The kinds of thing whose contact is a business's: a host, a tour operator, a driver. */
const BUSINESS: ReadonlySet<Item["kind"]> = new Set(["stay", "activity", "transport"]);

function publicItem(item: Item): Item {
  const place = item.place && {
    ...(item.place.name ? { name: item.place.name } : {}),
    ...(item.place.address ? { address: item.place.address } : {}),
    ...(item.place.mapsUrl ? { mapsUrl: item.place.mapsUrl } : {}),
    ...(typeof item.place.lat === "number" ? { lat: item.place.lat } : {}),
    ...(typeof item.place.lng === "number" ? { lng: item.place.lng } : {}),
  };
  const c = BUSINESS.has(item.kind) ? item.contact : undefined;
  const contact = c && {
    ...(c.phone ? { phone: c.phone } : {}),
    ...(c.whatsapp ? { whatsapp: c.whatsapp } : {}),
    ...(c.website && webUrl(c.website) ? { website: c.website } : {}),
    ...(c.instagram ? { instagram: c.instagram } : {}),
  };
  const bookingUrl = item.booking?.url ? safeBookingUrl(item.booking.url, item.booking.confirmation) : null;
  const posts = (item.links ?? []).filter((l) => isPost(l.kind) && webUrl(l.url)).map((l): Link => ({ id: l.id, url: l.url, kind: l.kind, ...(l.title ? { title: l.title } : {}), ...(l.site ? { site: l.site } : {}), addedAt: 0 }));
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    ...(item.start ? { start: item.start } : {}),
    ...(item.end ? { end: item.end } : {}),
    ...(place ? { place } : {}),
    ...(contact && Object.keys(contact).length ? { contact } : {}),
    ...(item.booking ? { booking: { state: item.booking.state, ...(bookingUrl ? { url: bookingUrl } : {}) } } : {}),
    ...(posts.length ? { links: posts } : {}),
    ...(item.maybe ? { maybe: true } : {}),
    ...(item.sleepsHere ? { sleepsHere: true } : {}),
    ...(typeof item.peakM === "number" ? { peakM: item.peakM } : {}),
  };
}

const webUrl = (url: string) => /^https?:\/\//i.test(url);

/** Query and fragment names that hold a key to someone's booking, not where to find it. */
const SECRET_PARAM = /conf|code|pin|token|email|mail|^last|lastname|surname|pnr|ref|resv|reservation|booking|itinerary|ticket|auth|key|sig|session|access|hash|otp|pass|secret|guest|phone/i;

/**
 * A booking link that's safe to share, or null. Booking sites put the
 * confirmation or a sign-in token in the address ("…/reservation/HMX4Q2",
 * "?conf=…&lastName=…"), and anyone holding it can change the booking.
 */
export function safeBookingUrl(url: string, confirmation?: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const fragment = new URLSearchParams(u.hash.replace(/^#/, ""));
  for (const name of [...u.searchParams.keys(), ...fragment.keys()]) if (SECRET_PARAM.test(name)) return null;
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const code = confirmation ? squash(confirmation) : "";
  let plain = u.href;
  try {
    plain = decodeURIComponent(u.href);
  } catch {
    // Malformed escapes: check the address as it is.
  }
  if (code.length >= 4 && squash(plain).includes(code)) return null;
  // A long opaque path segment is usually a signed link or a booking id.
  if (u.pathname.split("/").some((seg) => seg.length >= 24 && /\d/.test(seg) && /[a-z]/i.test(seg) && !seg.includes("-"))) return null;
  return u.href;
}

/** Whether a request carries the trip's current viewing token (`?token=`): read-only access for the link's page. */
export async function previewRequest(request: Request, tripId: string): Promise<boolean> {
  const token = new URL(request.url).searchParams.get("token");
  return !!token && (await previewAllowed(tripId, token));
}

/**
 * The trip as a viewing link shows it (with how many are going, not who, the
 * group's usual temperature unit and when it was read, for "now" and "next"),
 * or null when the token isn't (or is no longer) valid.
 */
export async function previewTrip(tripId: string, token: string): Promise<(TripState & { travelers: number; tempUnit: TempUnit; readAt: number }) | null> {
  if (!(await previewAllowed(tripId, token))) return null;
  const state = await getStore().get(tripId);
  return state && { trip: publicTrip(state.trip), version: state.version, travelers: state.trip.people.length, tempUnit: defaultTempUnit(state.trip), readAt: Date.now() };
}
