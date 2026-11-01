import { NextResponse } from "next/server";
import { jsonError, rateLimit, readJson, requireSession } from "@/server/http";
import { unfurl } from "@/server/unfurl";

/** Body: { url }. A title and picture for a pasted link, or just its kind when the site won't say. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const limited = await rateLimit(request, "unfurl", 120, 3600, "That's a lot of links this hour. They're saved; previews will come back in a little while.");
  if (limited) return limited;
  const parsed = await readJson(request, 4_000);
  if (!parsed.ok) return parsed.res;
  const { url } = parsed.body;
  if (typeof url !== "string" || url.length > 2000) return jsonError(400, "url is required");
  const preview = await unfurl(url);
  if (!preview) return jsonError(400, "That isn't a web link.");
  return NextResponse.json(preview);
}
