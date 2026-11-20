import { NextResponse } from "next/server";
import { extractReceipt } from "@/server/ai/documents";
import { getStore, jsonError, rateLimit, readJson, requireSession } from "@/server/http";
import { MAX_RECEIPT_BYTES, normalizeReceipt, receiptIdFor } from "@/server/receipts";

export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const limited = await rateLimit(request, "receipt-upload", 30, 3600);
  if (limited) return limited;
  const store = getStore();
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  const parsed = await readJson(request, 2_000_000);
  if (!parsed.ok) return parsed.res;
  const image = await normalizeReceipt(parsed.body.image);
  if (!image) return jsonError(400, "Choose a readable JPEG, PNG or WebP receipt photo.");
  if (image.length > MAX_RECEIPT_BYTES) return jsonError(413, "That receipt is too large. Crop it and try again.");

  const receiptId = receiptIdFor(image);
  await store.stageReceipt(tripId, receiptId, image.toString("base64"));
  const duplicate = state.trip.expenses?.find((e) => e.receiptId === receiptId);
  let draft = null;
  try {
    draft = await extractReceipt(image);
  } catch {
    // Manual entry can use the uploaded photo even while the model is unavailable.
  }
  return NextResponse.json({
    receiptId,
    draft,
    duplicateTitle: duplicate?.title,
    warning: draft && Object.keys(draft).length ? null : "Photo attached. We couldn't read the details automatically; enter them below.",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
