import "server-only";
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { assistantModel, isMock } from "./ai/models";
import { getStore } from "./db";
import { safeFetch } from "./unfurl";

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

/*
 * Finding a picture costs a model call, a Bing Images page and up to four
 * image downloads, so the route only lets people with trip access ask, and
 * each found (or not found) picture's address is cached in the trip store
 * for every server instance. Every fetch goes through unfurl's safeFetch:
 * public addresses only, each redirect checked, a timeout and a size cap.
 */

const BROWSER_ACCEPT = "text/html,application/json";
const IMAGE_ACCEPT = "image/avif,image/webp,image/jpeg,image/png,image/gif;q=0.8";
/** Raster formats only: an SVG served from this site could run script. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MIN_IMAGE_BYTES = 2500;
const MAX_IMAGE_BYTES = 6_000_000;
const FOUND_TTL_SECONDS = 7 * 24 * 60 * 60;
const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;

/**
 * Search Bing Images & Wikipedia for a real contextual photo matching `query`.
 */
async function searchWebPhotoUrls(query: string): Promise<string[]> {
  const urls: string[] = [];

  // 1. Bing Image Search async endpoint (returns unpadded full-bleed mm.bing.net CDN thumbnails + original murls)
  const bing = await safeFetch(`https://www.bing.com/images/async?q=${encodeURIComponent(query)}&first=1&count=8&adlt=strict`, { accept: BROWSER_ACCEPT, browser: true, maxBytes: 1_500_000 });
  if (bing?.ok) {
    const html = new TextDecoder().decode(bing.bytes);
    for (const match of html.matchAll(/turl&quot;:&quot;(https:\/\/[^&]+?)&amp;/g)) {
      urls.push(match[1]);
    }
    for (const match of html.matchAll(/murl&quot;:&quot;(https:\/\/[^&]+?\.(?:jpg|jpeg|png|webp))&quot;/gi)) {
      urls.push(match[1]);
    }
  }

  // 2. Wikipedia PageImages API fallback
  if (urls.length === 0) {
    const wiki = await safeFetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=900&format=json&origin=*`, { accept: "application/json" });
    if (wiki?.ok) {
      try {
        const data = JSON.parse(new TextDecoder().decode(wiki.bytes)) as {
          query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
        };
        for (const page of Object.values(data.query?.pages ?? {})) {
          if (page.thumbnail?.source) urls.push(page.thumbnail.source);
        }
      } catch {
        // Not JSON: no pictures from Wikipedia.
      }
    }
  }

  return urls;
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const res = await safeFetch(url, { accept: IMAGE_ACCEPT, browser: true, maxBytes: MAX_IMAGE_BYTES + 1 });
  if (!res?.ok) return null;
  const type = res.type.split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return null;
  if (res.bytes.byteLength < MIN_IMAGE_BYTES || res.bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { bytes: res.bytes, type };
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

function remember(cacheKey: string, entry: CachedPhoto) {
  if (photoCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = photoCache.keys().next().value;
    if (oldestKey) photoCache.delete(oldestKey);
  }
  photoCache.set(cacheKey, entry);
}

/**
 * Resolve and cache the image bytes for a contextual photo request.
 * `mayLookUp` is asked before anything costly (the model, Bing, Wikipedia)
 * and only when no server has cached an answer; false means "not now".
 */
export async function getContextualPhoto(params: PhotoParams, opts: { mayLookUp?: () => Promise<boolean> } = {}): Promise<CachedPhoto | null> {
  if (isMock()) return null;

  const baseQuery = cleanPhotoQuery(params);
  const cacheKey = `v2::${baseQuery}::${params.idx ?? 0}`;
  const hit = photoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PHOTO_TTL_MS) {
    return hit;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async (): Promise<CachedPhoto | null> => {
    try {
      const store = getStore();
      const sharedKey = `photo:${createHash("sha256").update(cacheKey).digest("hex")}`;
      const shared = await store.getCache(sharedKey);
      if (shared === "") return null;
      if (shared) {
        const img = await downloadImage(shared);
        if (img) {
          const entry: CachedPhoto = { ...img, url: shared, at: Date.now() };
          remember(cacheKey, entry);
          return entry;
        }
      }

      if (opts.mayLookUp && !(await opts.mayLookUp())) return null;
      const query = await refineQueryWithGemini(params, baseQuery);
      let candidates = await searchWebPhotoUrls(query);
      if (candidates.length === 0 && params.dest) {
        candidates = await searchWebPhotoUrls(`${params.dest} ${params.kind || "travel"}`);
      }

      for (const url of candidates.slice(0, 4)) {
        const img = await downloadImage(url);
        if (img) {
          const entry: CachedPhoto = { ...img, url, at: Date.now() };
          remember(cacheKey, entry);
          await store.setCache(sharedKey, url, FOUND_TTL_SECONDS);
          return entry;
        }
      }
      await store.setCache(sharedKey, "", NOT_FOUND_TTL_SECONDS);
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

/** Tests start each case with an empty per-instance cache, the way a fresh server would. */
export function forgetPhotosForTests() {
  photoCache.clear();
  queryCache.clear();
  inFlight.clear();
}
