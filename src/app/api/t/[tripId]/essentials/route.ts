import { NextResponse } from "next/server";
import { draftEssentials } from "@/server/ai/essentials";
import { isRetryable } from "@/server/ai/models";
import { todayIn } from "@/domain/time";
import { getStore, jsonError, readJson, requireSession } from "@/server/http";

export const maxDuration = 60;

/** Each search-grounded draft costs money; a group needs a handful, not dozens. */
const DRAFTS_PER_DAY = 10;

/**
 * Body: { nationality }. A first draft of the trip's essentials with its
 * sources. Nothing is saved here: the phone puts it in the trip as an
 * ordinary, undoable edit, so the group can correct it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const parsed = await readJson(request, 2_000);
  if (!parsed.ok) return parsed.res;
  const nationality = typeof parsed.body.nationality === "string" ? parsed.body.nationality.trim() : "";
  if (!/^[\p{L} .,'()-]{2,60}$/u.test(nationality)) return jsonError(400, "Say which passports the group travels on, like “United States”.");

  const store = getStore();
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  if ((await store.hit(`essentials:${tripId}`, 86_400)) > DRAFTS_PER_DAY) return jsonError(429, "That's a lot of drafts today. Edit the one you have, or try again tomorrow.");

  try {
    const draft = await draftEssentials(state.trip, nationality, request.signal);
    if (!draft) return jsonError(503, "Drafting needs the assistant, which isn't set up on this site. You can still type the essentials in yourself.");
    return NextResponse.json({ ...draft, draftedOn: todayIn(state.trip.tz) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("essentials draft failed", { message: String((e as Error)?.message ?? e).slice(0, 200) });
    return jsonError(502, isRetryable(e) ? "The search is busy right now. Try again in a moment." : "The draft didn't work. Try again in a moment, or type the essentials in yourself.");
  }
}
