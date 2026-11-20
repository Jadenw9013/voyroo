import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { stripCards } from "@/domain/change";
import { ItemSchema } from "@/domain/schema";
import type { Item, Trip, When } from "@/domain/types";
import { extractBookings, type BookingDraft } from "./ai/documents";
import type { BookingImportResult, TripStore } from "./store";

export const digest = (text: string) => createHash("sha256").update(text).digest("hex");

export function inboundConfig() {
  const address = process.env.POSTMARK_INBOUND_ADDRESS?.trim().toLowerCase();
  const secret = process.env.BOOKING_EMAIL_SECRET;
  return address && /^[a-z0-9_-]{1,38}@[a-z0-9.-]+$/.test(address) && secret && secret.length >= 32 ? { address, secret } : null;
}

export function webhookAllowed(request: Request): boolean {
  const config = inboundConfig();
  if (!config) return false;
  const expected = Buffer.from(`Basic ${Buffer.from(`voyroo:${config.secret}`).toString("base64")}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Recomputed from the active secret, so rotating it invalidates old aliases. */
export function tripMailbox(tripId: string) {
  const config = inboundConfig();
  if (!config) return null;
  const token = createHmac("sha256", config.secret).update(`bookings:${tripId}`).digest("hex").slice(0, 24);
  const [local, domain] = config.address.split("@");
  return { token, address: `${local}+${token}@${domain}` };
}

export async function bookingAddress(store: TripStore, tripId: string): Promise<string | null> {
  const mailbox = tripMailbox(tripId);
  if (!mailbox) return null;
  await store.putDocument(`inbox:${mailbox.token}`, JSON.stringify({ tripId }));
  return mailbox.address;
}

const sameTime = (a?: When | null, b?: When | null) => a?.date === b?.date && a?.time === b?.time && a?.tz === b?.tz;

/** Same reservation and segment: round trips and multi-room stays must remain separate. */
export function sameBooking(a: Item, b: Item): boolean {
  const norm = (s?: string) => s?.trim().toLowerCase();
  return !!a.booking?.confirmation && !!a.booking.source &&
    norm(a.booking.confirmation) === norm(b.booking?.confirmation) && norm(a.booking.source) === norm(b.booking?.source) &&
    a.kind === b.kind && norm(a.title) === norm(b.title) &&
    sameTime(a.start, b.start) && sameTime(a.end, b.end);
}

export function bookingItems(drafts: BookingDraft[], key: string): Item[] {
  return drafts.map((draft, i) => ItemSchema.parse({ ...draft, id: `mail-${digest(`${key}:${i}`).slice(0, 40)}` }));
}

/** Store only the scrubbed itinerary change and its counts, never the raw email or an extraction snapshot. */
export async function importBookingEmail(store: TripStore, trip: Trip, text: string, messageKey: string, author: string) {
  const key = `booking-import:${trip.id}:${digest(messageKey)}:done`;
  const completed = await store.getDocument(key);
  if (completed) return { ...JSON.parse(completed) as BookingImportResult, replayed: true };
  const drafts = await extractBookings(stripCards(text), trip);
  if (drafts === null) return null;
  return store.applyBookingImport(trip.id, key, bookingItems(drafts, key), author, sameBooking);
}

/** Read text and link destinations from HTML mail without loading remote content. */
function htmlText(html: string): string {
  const fragments: string[] = [];
  let hidden = "";
  for (const match of html.matchAll(/<[^<>]*>|[^<>]+|[<>]/g)) {
    const part = match[0];
    if (part.startsWith("<")) {
      const tag = /^<(\/?)([a-z]+)\b/i.exec(part);
      if (!tag) continue;
      const name = tag[2].toLowerCase();
      if (hidden) {
        if (name === hidden && tag[1]) hidden = "";
      } else if (!tag[1] && (name === "script" || name === "style")) {
        hidden = name;
      } else if (!tag[1] && name === "a") {
        const url = /\shref\s*=\s*["'](https?:\/\/[^"'\s]{1,2000})["']/i.exec(part)?.[1];
        if (url) fragments.push(url);
      }
    } else if (!hidden) {
      fragments.push(part);
    }
  }
  return fragments.join(" ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

export function emailText(body: { Subject?: string; TextBody?: string; HtmlBody?: string }): string {
  const text = body.TextBody?.trim() || htmlText(body.HtmlBody ?? "").trim();
  return text ? `${body.Subject ?? ""}\n${text}`.trim() : "";
}
