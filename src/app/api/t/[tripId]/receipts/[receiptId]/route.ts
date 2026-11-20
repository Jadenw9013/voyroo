import { getStore, jsonError, requireSession } from "@/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string; receiptId: string }> }) {
  const { tripId, receiptId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  if (!/^r-[a-f0-9]{48}$/.test(receiptId)) return jsonError(404, "No such receipt.");
  const image = await getStore().getReceipt(tripId, receiptId);
  if (!image) return jsonError(404, "No such receipt.");
  return new Response(Buffer.from(image, "base64"), { headers: {
    "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  } });
}
