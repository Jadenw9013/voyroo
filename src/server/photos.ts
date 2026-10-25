import "server-only";
import { generateText } from "ai";
import { assistantModel, isMock } from "./ai/models";

const PHOTO_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 400;

interface CachedPhoto {
  bytes: Uint8Array;
  type: string;
  url: string;
  at: number;
}

const photoCache = new Map<string, CachedPhoto>();
const queryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<CachedPhoto | null>>();

export interface PhotoParams {
  title?: string;
  place?: string;
  dest?: string;
  kind?: string;
  idx?: number;
}

const ACTION_PREFIX_RE =
  /^(?:stay at|check[- ]?in:?|check[- ]?out:?|arrive at|arrival at|depart from|departure from|transfer from|transfer to|flight to|fly to|visit|explore|dinner at|lunch at|breakfast at|brunch at|drinks at|coffee at|stop at|day trip to|tour of|excursion to)\s+/i;

const GENERIC_TITLE_RE =
  /\b(?:tbd|name tbd|optional|free time|free afternoon|free morning|rest|pack|check out| airport hotel or )\b/i;

/**
 * Deterministically clean an itinerary item's title + place + destination into
 * a specific, high-signal visual search query.
 */
export function cleanPhotoQuery({ title = "", place = "", dest = "", kind = "" }: PhotoParams): string {
  const cleanedTitle = title
    .replace(ACTION_PREFIX_RE, "")
    .replace(/\((?:name\s+)?tbd[^)]*\)/gi, "")
    .replace(/\(optional\)/gi, "")
    .replace(/[→↔]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedPlace = place
    .replace(/\((?:name\s+)?tbd[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedDest = dest.trim();

  // If this is a destination-level cover photo
  if (kind === "destination" || (!cleanedTitle && !cleanedPlace)) {
    return `${cleanedDest || cleanedTitle || "scenic travel destination"} scenic landmark travel photography`.trim();
  }

  // Deduplicate tokens across title, place, and destination while preserving order
  const combinedParts = [cleanedTitle, cleanedPlace, cleanedDest].filter(Boolean);
  const seenWords = new Set<string>();
  const words: string[] = [];

  for (const part of combinedParts) {
    for (const rawWord of part.split(/[\s,/|]+/)) {
      const w = rawWord.trim();
      if (!w) continue;
      const lower = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!lower || seenWords.has(lower)) continue;
      seenWords.add(lower);
      words.push(w);
    }
  }

  const kindSuffix =
    kind === "stay" && !/hotel|resort|hostel|villa|inn|lodge|airbnb/i.test(words.join(" "))
      ? "hotel resort"
      : kind === "food" && !/market|restaurant|cafe|bar|food|bistro|bakery/i.test(words.join(" "))
        ? "restaurant food"
        : kind === "flight" && !/airport|airlines|flight/i.test(words.join(" "))
          ? "airport"
          : "";

  return [...words, kindSuffix].filter(Boolean).join(" ").trim();
}

/**
 * Use Gemini API when available to turn vague/generic or complex itinerary items
 * into an accurate real-world photo search query for that destination.
 */
async function refineQueryWithGemini(params: PhotoParams, fallbackQuery: string): Promise<string> {
  if (isMock() || !process.env.GEMINI_API_KEY) return fallbackQuery;
  const key = JSON.stringify([params.title, params.place, params.dest, params.kind]);
  const cached = queryCache.get(key);
  if (cached) return cached;

  const needsAiRefinement =
    GENERIC_TITLE_RE.test(params.title || "") ||
    GENERIC_TITLE_RE.test(params.place || "") ||
    /[→]|\bvia\b/i.test(params.title || "") ||
    fallbackQuery.split(/\s+/).length <= 2;

  if (!needsAiRefinement) return fallbackQuery;

  try {
    const model = assistantModel();
    if (!model) return fallbackQuery;
    const res = await generateText({
      model,
      system:
        "You generate a concise 4 to 7 word web image search query to find a real, accurate photo for a travel itinerary item. Return ONLY the plain search query words, no quotes or punctuation.",
      prompt: `Trip destination: ${params.dest || "Unknown"}\nItem kind: ${params.kind || "activity"}\nItem title: ${params.title || ""}\nPlace: ${params.place || ""}\nSearch query:`,
      maxOutputTokens: 40,
      abortSignal: AbortSignal.timeout(2500),
    });
    const refined = res.text
      .replace(/["'`\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (refined.length >= 4 && refined.length <= 100) {
      if (queryCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = queryCache.keys().next().value;
        if (oldest) queryCache.delete(oldest);
      }
      queryCache.set(key, refined);
      return refined;
    }
  } catch {
    // Fall back to deterministic query if Gemini times out or is unavailable.
  }
  return fallbackQuery;
}

/**
 * Search Bing Images & Wikipedia for a real contextual photo matching `query`.
 */
async function searchWebPhotoUrls(query: string): Promise<string[]> {
  const urls: string[] = [];

  // 1. Bing Image Search async endpoint (returns high-res mm.bing.net CDN thumbnails + original murls)
  try {
    const bingUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=1&count=8&adlt=strict&qft=+filterui:aspect-wide+filterui:imagesize-large`;
    const res = await fetch(bingUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const html = await res.text();
      for (const match of html.matchAll(/turl&quot;:&quot;(https:\/\/[^&]+?)&amp;/g)) {
        urls.push(`${match[1]}&w=800&h=600&c=7`);
      }
      for (const match of html.matchAll(/murl&quot;:&quot;(https:\/\/[^&]+?\.(?:jpg|jpeg|png|webp))&quot;/gi)) {
        urls.push(match[1]);
      }
    }
  } catch {
    // Continue to Wikipedia fallback
  }

  // 2. Wikipedia PageImages API fallback
  if (urls.length === 0) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=900&format=json&origin=*`;
      const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = (await res.json()) as {
          query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
        };
        for (const page of Object.values(data.query?.pages ?? {})) {
          if (page.thumbnail?.source) urls.push(page.thumbnail.source);
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  return urls;
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/jpeg,image/png,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 2500 || buf.byteLength > 6_000_000) return null;
    return { bytes: buf, type };
  } catch {
    return null;
  }
}

/**
 * Resolve a real, contextually accurate photo URL (e.g. when saving a new trip cover).
 */
export async function resolveContextualPhotoUrl(params: PhotoParams): Promise<string | null> {
  if (isMock()) return null;
  const baseQuery = cleanPhotoQuery(params);
  const query = await refineQueryWithGemini(params, baseQuery);
  const urls = await searchWebPhotoUrls(query);
  return urls[0] ?? null;
}

/**
 * Resolve and cache the image bytes for a contextual photo request.
 */
export async function getContextualPhoto(params: PhotoParams): Promise<CachedPhoto | null> {
  if (isMock()) return null;

  const baseQuery = cleanPhotoQuery(params);
  const cacheKey = `${baseQuery}::${params.idx ?? 0}`;
  const hit = photoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PHOTO_TTL_MS) {
    return hit;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async (): Promise<CachedPhoto | null> => {
    try {
      const query = await refineQueryWithGemini(params, baseQuery);
      let candidates = await searchWebPhotoUrls(query);
      if (candidates.length === 0 && params.dest) {
        candidates = await searchWebPhotoUrls(`${params.dest} ${params.kind || "travel"}`);
      }

      for (const url of candidates.slice(0, 4)) {
        const img = await downloadImage(url);
        if (img) {
          const entry: CachedPhoto = { ...img, url, at: Date.now() };
          if (photoCache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = photoCache.keys().next().value;
            if (oldestKey) photoCache.delete(oldestKey);
          }
          photoCache.set(cacheKey, entry);
          return entry;
        }
      }
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}
