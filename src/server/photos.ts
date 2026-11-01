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
 * Finding a picture costs up to three searches of each source, image
 * downloads and a look by the model at each candidate (more with the
 * destination fallback), so the route only lets people with trip access ask, and
 * each found (or not found) picture's address is cached in the trip store
 * for every server instance. Every fetch goes through unfurl's safeFetch:
 * public addresses only, each redirect checked, a timeout and a size cap.
 */

const IMAGE_ACCEPT = "image/avif,image/webp,image/jpeg,image/png,image/gif;q=0.8";
/** Raster formats only: an SVG served from this site could run script. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const MIN_IMAGE_BYTES = 2500;
const MAX_IMAGE_BYTES = 6_000_000;
const FOUND_TTL_SECONDS = 7 * 24 * 60 * 60;
const NOT_FOUND_TTL_SECONDS = 24 * 60 * 60;
/** Bumped when the rules for an acceptable picture change, so old picks are found again. */
const PICK_VERSION = "v3";
/** Candidates downloaded, and how many of those the model looks at, per search. */
const MAX_DOWNLOADS = 6;
const MAX_CHECKS = 4;

/*
 * Flights and transfers get the stock plane picture: an image search for
 * "SEA to TPE" or an airline finds logos, seat maps and worse, never
 * something that helps on the day.
 */
const NO_SEARCH_KINDS = new Set(["flight", "transport"]);

const KIND_WORDS: Record<string, string> = {
  stay: "a place to stay (its building, a room, or its view)",
  food: "a place to eat or drink (the place itself or its food)",
  activity: "an activity or sight (the landmark, the scenery, or the activity)",
  destination: "the destination itself (a well-known view, street or landmark there)",
};

/** Whether a downloaded picture really shows the item. Swapped out in tests. */
export type PhotoCheck = (img: { bytes: Uint8Array; type: string }, params: PhotoParams) => Promise<boolean>;
let checkOverride: PhotoCheck | null = null;
export function setPhotoCheckForTests(check: PhotoCheck | null) {
  checkOverride = check;
}

/**
 * Asks the model to look at the picture. Search results for a small hotel or
 * a route include cartoons, news photos (a fire, an accident) and other
 * places, so nothing is shown that the model hasn't confirmed. With no model,
 * nothing passes and the kind's stock picture is used instead.
 */
async function looksRight(img: { bytes: Uint8Array; type: string }, params: PhotoParams): Promise<boolean> {
  if (checkOverride) return checkOverride(img, params);
  const model = assistantModel();
  if (!model) return false;
  const what = KIND_WORDS[params.kind ?? ""] ?? KIND_WORDS.activity;
  const name = [params.title, params.place].filter(Boolean).join(", ");
  try {
    const res = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `This picture would illustrate a travel itinerary item: ${what}${name ? `, "${name}"` : ""}${params.dest ? `, in ${params.dest}` : ""}.\n` +
                "Answer YES only if it is a real photograph a traveller would recognise as this place, or as this kind of place in that destination.\n" +
                "Answer NO if it is a cartoon, illustration, character, meme, logo, map, screenshot, poster or mostly text; news or disaster imagery (fire, flood, accident, protest, police); a portrait or celebrity; or clearly somewhere else.\n" +
                "Reply with one word: YES or NO.",
            },
            { type: "file", data: img.bytes, mediaType: img.type },
          ],
        },
      ],
      maxOutputTokens: 200,
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      abortSignal: AbortSignal.timeout(8000),
    });
    return /^\W*yes\b/i.test(res.text);
  } catch {
    return false;
  }
}

/** Without a model to look at pictures nothing can pass, so there's no point searching. */
const canCheck = () => checkOverride !== null || assistantModel() !== null;

/** The first candidate that downloads safely and that the model confirms. */
async function firstGood(urls: string[], params: PhotoParams): Promise<{ url: string; bytes: Uint8Array; type: string } | null> {
  // Fetch the best few at once; the model looks only at those that downloaded safely. Keep the highest-ranked pass.
  const fetched = await Promise.all([...new Set(urls)].slice(0, MAX_DOWNLOADS).map(async (url) => ({ url, img: await downloadImage(url) })));
  const usable = fetched.flatMap(({ url, img }) => (img ? [{ url, ...img }] : [])).slice(0, MAX_CHECKS);
  const passed = await Promise.all(usable.map((c) => looksRight(c, params)));
  return usable[passed.indexOf(true)] ?? null;
}

/** Short searches, most specific first: these sources match few words well and many words badly. */
export function photoQueries(params: PhotoParams): string[] {
  const name = (params.place || params.title || "").replace(ACTION_PREFIX_RE, "").replace(/\((?:name\s+)?tbd[^)]*\)/gi, "").replace(/\s+/g, " ").trim();
  const dest = (params.dest || "").trim();
  if (params.kind === "destination" || !name) return dest ? [`${dest} landscape`, `${dest} city`, dest] : [];
  const inDest = dest && !name.toLowerCase().includes(dest.toLowerCase()) ? `${name} ${dest}` : "";
  const title = params.title && params.place && !params.title.includes(params.place) ? params.title.replace(ACTION_PREFIX_RE, "").trim() : "";
  return [...new Set([inDest, name, title].filter(Boolean))];
}

/** Candidates from each query in turn until one passes the check. */
async function findFor(params: PhotoParams, first?: string): Promise<{ url: string; bytes: Uint8Array; type: string } | null> {
  if (!canCheck()) return null;
  for (const query of [...new Set([first, ...photoQueries(params)].filter((q): q is string => !!q))].slice(0, 3)) {
    const found = await firstGood(await searchWebPhotoUrls(query), params);
    if (found) return found;
  }
  return null;
}

/** A picture of the trip's destination, for an item nothing good was found for. */
function destinationParams(params: PhotoParams): PhotoParams | null {
  return params.dest && params.kind !== "destination" ? { title: params.dest, dest: params.dest, kind: "destination" } : null;
}

/*
 * Where candidates come from: sources that actually search. (Bing's image
 * endpoint, asked from a server, answers with whatever is trending: a
 * Ghostbusters logo for "Railay Beach", costumes, news photos.)
 *   Wikimedia Commons  photos of places, landmarks, streets and some hotels
 *   Openverse          Creative Commons photos, mostly from Flickr
 *   Wikipedia          the lead picture of matching articles
 * Every candidate is still checked by the model before it's shown.
 */
const USER_AGENT = "Voyroo/1.0 (trip planner; https://www.voyroo.com)";
const RASTER = /^image\/(jpeg|png|webp)$/;

async function getJson<T>(url: string): Promise<T | null> {
  const res = await safeFetch(url, { accept: "application/json", userAgent: USER_AGENT, maxBytes: 1_500_000 });
  if (!res?.ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(res.bytes)) as T;
  } catch {
    return null;
  }
}

async function fromCommons(query: string): Promise<string[]> {
  const data = await getJson<{ query?: { pages?: Record<string, { index?: number; imageinfo?: { thumburl?: string; mime?: string }[] }> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=1200&format=json&origin=*`,
  );
  return Object.values(data?.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => p.imageinfo?.[0])
    .filter((i): i is { thumburl: string; mime: string } => !!i?.thumburl && RASTER.test(i.mime ?? ""))
    .map((i) => i.thumburl);
}

async function fromOpenverse(query: string): Promise<string[]> {
  const data = await getJson<{ results?: { url?: string; filetype?: string | null }[] }>(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=8&mature=false`,
  );
  return (data?.results ?? []).filter((r) => r.url?.startsWith("https://") && (!r.filetype || /^(jpe?g|png|webp)$/i.test(r.filetype))).map((r) => r.url!);
}

async function fromWikipedia(query: string): Promise<string[]> {
  const data = await getJson<{ query?: { pages?: Record<string, { index?: number; thumbnail?: { source?: string } }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=1200&format=json&origin=*`,
  );
  return Object.values(data?.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => p.thumbnail?.source)
    .filter((u): u is string => !!u && !/\.svg/i.test(u));
}

/** Candidate pictures for `query`, best sources first. */
async function searchWebPhotoUrls(query: string): Promise<string[]> {
  const [commons, openverse, wikipedia] = await Promise.all([fromCommons(query), fromOpenverse(query), fromWikipedia(query)]);
  // Interleave so one source's misses don't use up every check.
  const out: string[] = [];
  for (let i = 0; i < 8; i++) for (const list of [commons, openverse, wikipedia]) if (list[i]) out.push(list[i]);
  return out;
}

async function downloadImage(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const res = await safeFetch(url, { accept: IMAGE_ACCEPT, userAgent: USER_AGENT, maxBytes: MAX_IMAGE_BYTES + 1 });
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
  if (isMock() || NO_SEARCH_KINDS.has(params.kind ?? "")) return null;
  return (await findFor(params))?.url ?? null;
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
  if (isMock() || NO_SEARCH_KINDS.has(params.kind ?? "")) return null;

  const baseQuery = cleanPhotoQuery(params);
  const cacheKey = `${PICK_VERSION}::${baseQuery}::${params.idx ?? 0}`;
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
      // A model-written search only for vague titles ("Hotel TBD", "free afternoon"); otherwise the place's own name.
      const refined = await refineQueryWithGemini(params, baseQuery);
      let found = await findFor(params, refined !== baseQuery ? refined : undefined);
      // Nothing that really shows the item: a confirmed picture of where the trip is, rather than a wrong one.
      const fallback = found ? null : destinationParams(params);
      if (fallback) found = await findFor(fallback);

      if (found) {
        const entry: CachedPhoto = { bytes: found.bytes, type: found.type, url: found.url, at: Date.now() };
        remember(cacheKey, entry);
        await store.setCache(sharedKey, found.url, FOUND_TTL_SECONDS);
        return entry;
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
