import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/server/http";
import { getRates, RATES_SOURCE } from "@/server/rates";

/** Today's exchange rates, for showing expenses in the home currency. The phone keeps a copy for offline. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const rates = await getRates();
  if (!rates) return jsonError(503, "Exchange rates aren't available right now. Amounts still add up in each currency.");
  return NextResponse.json({ ...rates, source: RATES_SOURCE }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
