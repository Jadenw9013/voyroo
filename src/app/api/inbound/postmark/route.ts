import { NextResponse } from "next/server";
import { z } from "zod";
import { emailText, importBookingEmail, inboundConfig, tripMailbox, webhookAllowed } from "@/server/bookings";
import { getStore, jsonError, readJson } from "@/server/http";

export const maxDuration = 60;
const Payload = z.object({
  MessageID: z.string().min(1).max(200),
  MailboxHash: z.string().regex(/^[a-f0-9]{24}$/),
  OriginalRecipient: z.string().max(254),
  Subject: z.string().max(1000).optional(),
  TextBody: z.string().max(100_000).optional(),
  HtmlBody: z.string().max(500_000).optional(),
});

export async function POST(request: Request) {
  if (!inboundConfig()) return jsonError(503, "Email forwarding isn't configured.");
  if (!webhookAllowed(request)) return jsonError(401, "Unauthorized.");
  const parsed = await readJson(request, 4_000_000);
  if (!parsed.ok) return jsonError(403, "Invalid or oversized inbound message.");
  const payload = Payload.safeParse(parsed.body);
  // Postmark stops retries on 403; malformed/unknown recipients are permanent failures.
  if (!payload.success) return jsonError(403, "Invalid inbound message.");
  const store = getStore();
  const inbox = await store.getDocument(`inbox:${payload.data.MailboxHash}`);
  if (!inbox) return jsonError(403, "Unknown inbox.");
  const { tripId } = JSON.parse(inbox) as { tripId: string };
  if (payload.data.OriginalRecipient.toLowerCase() !== tripMailbox(tripId)?.address) return jsonError(403, "Wrong recipient.");
  const state = await store.get(tripId);
  if (!state) return jsonError(403, "Unknown trip.");
  if (await store.hit(`inbound:${tripId}`, 3600) > 60) return jsonError(429, "Too many emails. Retry later.");
  const text = emailText(payload.data);
  if (!text || text.length > 60_000) return jsonError(403, "Email must contain readable booking text, up to 60,000 characters.");
  try {
    const result = await importBookingEmail(store, state.trip, text, `postmark:${payload.data.MessageID}`, "Booking email");
    if (!result) return jsonError(503, "Email reading isn't configured.");
    return NextResponse.json(result);
  } catch {
    return jsonError(503, "Couldn't import the booking. Retry later.");
  }
}
