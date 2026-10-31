import { NextResponse } from "next/server";
import { assistantAvailable, errorMessage } from "@/server/ai/models";
import { suggestPacking } from "@/server/ai/packing";
import { getStore, jsonError, requireSession } from "@/server/http";

export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };
const PER_HOUR = 20;

/** Whether "Suggest from our plan" can work here: it needs the assistant. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  return NextResponse.json({ suggest: assistantAvailable() }, { headers: noStore });
}

/** Suggestions to review, from the plan. Adds nothing to the trip. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const store = getStore();
  if ((await store.hit(`packing:${tripId}:${auth.session.name}`, 3600)) > PER_HOUR) {
    return jsonError(429, "That's a lot of suggestions for one hour. Try again later.");
  }
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  try {
    const suggestions = await suggestPacking(state.trip, auth.session.name, request.signal);
    if (!suggestions) return jsonError(503, "Suggestions need the assistant, which isn't set up on this site yet. Everything else works.");
    return NextResponse.json({ suggestions }, { headers: noStore });
  } catch (e) {
    console.error("packing suggestions error", { message: String((e as Error)?.message ?? e).slice(0, 300) });
    return jsonError(502, errorMessage(e));
  }
}
