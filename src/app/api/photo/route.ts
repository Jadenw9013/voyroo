import { NextResponse } from "next/server";
import { getContextualPhoto } from "@/server/photos";

const FALLBACK_BY_KIND: Record<string, string> = {
  stay: "/hotel-room-night.jpg",
  flight: "/flight-sunset-wing.jpg",
  transport: "/flight-sunset-wing.jpg",
  food: "/antigua-hotel.jpg",
  activity: "/lake-atitlan-hero.jpg",
  destination: "/guatemala-hero-sunset.jpg",
};

/**
 * GET /api/photo?title=...&place=...&dest=...&kind=...&idx=...
 * Returns a contextually accurate real-world photo for an itinerary item or destination.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const title = (sp.get("title") || "").slice(0, 200);
  const place = (sp.get("place") || "").slice(0, 200);
  const dest = (sp.get("dest") || "").slice(0, 200);
  const kind = (sp.get("kind") || "activity").slice(0, 40);
  const idx = Math.max(0, Math.min(10, Number(sp.get("idx") || "0") || 0));

  const photo = await getContextualPhoto({ title, place, dest, kind, idx });
  if (photo) {
    return new Response(photo.bytes as BodyInit, {
      headers: {
        "Content-Type": photo.type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const fallbackPath = FALLBACK_BY_KIND[kind] || "/lake-atitlan-hero.jpg";
  return NextResponse.redirect(new URL(fallbackPath, request.url), 307);
}
