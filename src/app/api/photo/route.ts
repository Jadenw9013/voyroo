import { NextResponse } from "next/server";
import { hasTripAccess } from "@/server/auth";
import { getStore, requester } from "@/server/http";
import { getContextualPhoto } from "@/server/photos";
import { previewAllowed } from "@/server/preview";

const FALLBACK_BY_KIND: Record<string, string> = {
  stay: "/hotel-room-night.jpg",
  flight: "/flight-sunset-wing.jpg",
  transport: "/flight-sunset-wing.jpg",
  food: "/antigua-hotel.jpg",
  activity: "/lake-atitlan-hero.jpg",
  destination: "/guatemala-hero-sunset.jpg",
};

/** New lookups (model + image search) per person or address per hour; cached pictures don't count. */
const LOOKUPS_PER_HOUR = 200;

/**
 * GET /api/photo?title=...&place=...&dest=...&kind=...&idx=...[&trip=...&token=...]
 * Returns a contextually accurate real-world photo for an itinerary item or destination.
 *
 * Only for people with a trip (a trip session or a Google sign-in) or a
 * valid viewing link (`trip` + `token`); anyone else gets the stock picture
 * for the kind, and nothing is looked up.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const title = (sp.get("title") || "").slice(0, 200);
  const place = (sp.get("place") || "").slice(0, 200);
  const dest = (sp.get("dest") || "").slice(0, 200);
  const kind = (sp.get("kind") || "activity").slice(0, 40);
  const idx = Math.max(0, Math.min(10, Number(sp.get("idx") || "0") || 0));

  const fallback = (cacheControl: string) => {
    const res = NextResponse.redirect(new URL(FALLBACK_BY_KIND[kind] || "/lake-atitlan-hero.jpg", request.url), 307);
    res.headers.set("Cache-Control", cacheControl);
    return res;
  };

  const viewer = sp.get("trip") && sp.get("token") ? await previewAllowed(sp.get("trip")!, sp.get("token")!) : false;
  if (!viewer && !(await hasTripAccess())) return fallback("no-store");

  const who = await requester(request);
  let limited = false;
  const photo = await getContextualPhoto(
    { title, place, dest, kind, idx },
    {
      mayLookUp: async () => {
        limited = (await getStore().hit(`photo:${who}`, 3600)) > LOOKUPS_PER_HOUR;
        return !limited;
      },
    },
  );
  if (photo) {
    return new Response(photo.bytes as BodyInit, {
      headers: {
        "Content-Type": photo.type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Over the limit: the real picture may come next time, so the stand-in isn't kept.
  return fallback(limited ? "no-store" : "public, max-age=3600");
}
