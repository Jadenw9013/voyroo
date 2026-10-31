import { NextResponse } from "next/server";
import { errorMessage } from "@/server/ai/models";
import { importScreenshot } from "@/server/ai/importShot";
import { getStore, jsonError, rateLimit, readJson, requireSession } from "@/server/http";

export const maxDuration = 120;

const DATA_URL = /^data:(image\/(?:png|jpe?g|webp|gif|heic|heif));base64,([A-Za-z0-9+/=]+)$/;
const MAX_BODY = 4_000_000;

/** Body: { image: data URL, index, total, expenses? }. Reads one booking screenshot and records what it shows; with `expenses`, a paid receipt is logged as an expense too. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const limited = await rateLimit(request, "import", 60, 3600, "That's a lot of screenshots this hour. Try again in a little while, or add the rest by hand.");
  if (limited) return limited;
  const parsed = await readJson(request, MAX_BODY);
  if (!parsed.ok) return parsed.res;
  const { image, index, total, expenses } = parsed.body;
  const m = typeof image === "string" ? DATA_URL.exec(image) : null;
  if (!m) return jsonError(400, "That isn't a picture the app can read.");

  try {
    const r = await importScreenshot({
      store: getStore(),
      tripId,
      me: auth.session.name,
      image: { mediaType: m[1], data: m[2] },
      index: Number(index) || 1,
      total: Number(total) || 1,
      expenses: expenses === true,
    });
    if (!r) return jsonError(503, "The assistant isn't set up on this site yet, so screenshots can't be read.");
    return NextResponse.json(r);
  } catch (e) {
    console.error("import error", { message: String((e as Error)?.message ?? e).slice(0, 300) });
    return jsonError(502, errorMessage(e));
  }
}
