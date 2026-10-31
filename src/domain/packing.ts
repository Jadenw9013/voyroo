import { z } from "zod";
import type { PackCategory, PackEntry, PackKind, Trip } from "./types";

/*
 * The packing list: who brings what for the group, and each person's own
 * list. Personal entries show only to their owner in the app, but they're
 * stored in the trip like everything else, so anyone in the trip could read
 * the data. The app says so where you add them.
 */

export const PACK_CATEGORIES: { id: PackCategory; label: string }[] = [
  { id: "documents", label: "Documents and money" },
  { id: "clothes", label: "Clothes" },
  { id: "toiletries", label: "Toiletries and sun" },
  { id: "health", label: "Health" },
  { id: "tech", label: "Tech" },
  { id: "gear", label: "Gear" },
  { id: "snacks", label: "Snacks" },
  { id: "other", label: "Other" },
];

export const CATEGORY_LABEL = Object.fromEntries(PACK_CATEGORIES.map((c) => [c.id, c.label])) as Record<PackCategory, string>;

// First match wins, so the narrower lists come first ("sunglasses" is gear, not toiletries).
const CATEGORY_WORDS: [RegExp, PackCategory][] = [
  [/\b(passports?|visas?|ids?|licen[cs]e|insurance|cash|quetzales|pesos|dollars|money|credit cards?|debit cards?|wallet|tickets?|boarding pass(es)?|copies|documents?|itinerary)\b/i, "documents"],
  [/\b(meds|medicines?|medications?|pills|prescriptions?|first[- ]?aid|band-?aids?|plasters|ibuprofen|advil|tylenol|paracetamol|aspirin|imodium|pepto|antacids?|altitude|diamox|electrolytes?|rehydration|saniti[sz]er|thermometer|blister|moleskin|antihistamines?|motion sickness|dramamine|vitamins)\b/i, "health"],
  [/\b(chargers?|cables?|usb|adapters?|plugs?|power ?banks?|batter(y|ies)|phones?|cameras?|gopro|drone|headphones|earbuds|airpods|speakers?|kindle|e-?reader|laptop|tablet|ipad|sd cards?|tripod)\b/i, "tech"],
  [/\b(head ?lamps?|flashlights?|torch|dry ?bags?|backpacks?|day ?packs?|bags?|water bottles?|bottles?|towels?|umbrellas?|sunglasses|snorkels?|goggles|eye mask|binoculars|poles|trekking|locks?|padlocks?|carabiners?|sleeping bags?|tents?|knife|multi-?tool|hammock|frisbee|cards|games?|books?|pillows?|earplugs|ziplocs?|zip-?lock|laundry|water filter|purif\w*)\b/i, "gear"],
  [/\b(sunscreen|sunblock|spf|after-?sun|aloe|toothbrush(es)?|toothpaste|floss|shampoo|conditioner|soap|deodorant|razors?|lip balm|chapstick|moisturi[sz]er|lotion|bug spray|insect repellent|repellent|deet|wipes|tissues|toilet paper|contacts|contact lens\w*|glasses|make-?up|hair ?\w*|toiletries)\b/i, "toiletries"],
  [/\b(jackets?|layers?|fleece|sweaters?|hoodies?|shirts?|t-shirts?|tees?|pants|trousers|shorts|leggings|socks|underwear|hats?|beanies?|caps?|gloves|scarf|swimsuits?|swimwear|bikinis?|trunks|shoes|boots|sandals|flip-?flops|sneakers|ponchos?|raincoats?|pajamas|pyjamas|dress(es)?|thermals?|base layers?|clothes)\b/i, "clothes"],
  [/\b(snacks?|bars?|granola|trail mix|nuts|candy|chocolate|gum|coffee|tea|jerky|food)\b/i, "snacks"],
];

export function guessCategory(text: string): PackCategory {
  for (const [re, c] of CATEGORY_WORDS) if (re.test(text)) return c;
  return "other";
}

export const packingOf = (trip: Pick<Trip, "packing">): PackEntry[] => trip.packing ?? [];

/** What `me` sees: the whole shared list, and only their own personal entries. */
export function visiblePacking(trip: Pick<Trip, "packing">, me: string): { shared: PackEntry[]; mine: PackEntry[] } {
  const all = packingOf(trip);
  return { shared: all.filter((p) => p.kind === "shared"), mine: all.filter((p) => p.kind === "personal" && p.owner === me) };
}

/** Shared: someone has packed it. Personal: its owner has. */
export function isPacked(entry: PackEntry): boolean {
  if (entry.kind === "personal") return !!entry.owner && !!entry.packedBy?.includes(entry.owner);
  return (entry.packedBy?.length ?? 0) > 0;
}

/** Checks the schema can't: ids are unique and each entry is either the group's or one person's. */
export function packingProblems(trip: Pick<Trip, "packing">): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const p of packingOf(trip)) {
    if (ids.has(p.id)) out.push(`Two things on the packing list share the id "${p.id}".`);
    ids.add(p.id);
    if (p.kind === "personal") {
      if (!p.owner) out.push(`“${p.text}” is on someone's own list but doesn't say whose.`);
      if (p.assignee) out.push(`“${p.text}” is on someone's own list, so nobody else brings it.`);
      if (p.packedBy?.some((n) => n !== p.owner)) out.push(`Only ${p.owner ?? "its owner"} can tick “${p.text}”.`);
    } else if (p.owner) {
      out.push(`“${p.text}” is on the shared list, so it isn't anyone's own.`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quick add: "pack sunscreen", "bring speaker - Ben", "I'll bring the cards".

export interface PackDraft {
  text: string;
  kind: PackKind;
  /** A name typed after a dash, or before "brings". */
  assignee?: string;
  /** "I'll bring", or "- me": the person typing brings it. */
  self?: boolean;
  quantity?: number;
  category: PackCategory;
}

const NAME = String.raw`(\p{L}[\p{L}'-]{0,29})`;
// On your own list: "pack sunscreen", "I'll pack my charger", "don't forget the passport".
const PACK = /^(?:(?:to |i'?ll |i will |i need to |need to |remember to )?pack(?!\s+up\b)\s*:?|don'?t forget(?: to (?:pack|bring))?|remember to bring)\s+(.+)$/iu;
// For the group, and the person typing brings it.
const SELF = /^(?:i'?ll|i will|i'?m|im|i am|i can)\s+(?:bring|bringing|grab|grabbing)\s+(.+)$/iu;
// For the group, nobody yet.
const BRING = /^(?:bring|someone (?:brings?|to bring)|someone should bring)\s+(.+)$/iu;
const NAMED = new RegExp(String.raw`^${NAME}(?:\s+(?:brings|is bringing|will bring|can bring)|'ll bring)\s+(.+)$`, "iu");
const BY = new RegExp(String.raw`^(.+?)(?:\s+-|\s*[–—])\s*${NAME}$`, "u");
const NOBODY = /^(someone|somebody|anyone|anybody|nobody|tbd)$/i;
const SELF_WORD = /^(me|i|myself)$/i;

/** "2 dry bags", "dry bags x2", "dry bags (2)". */
function quantityOf(text: string): { text: string; quantity?: number } {
  const lead = /^(\d{1,2})\s+(.+)$/.exec(text);
  const trail = /^(.+?)\s+(?:[x×]\s*(\d{1,2})|\((\d{1,2})\))$/i.exec(text);
  const [rest, n] = lead ? [lead[2], lead[1]] : trail ? [trail[1], trail[2] ?? trail[3]] : [text, undefined];
  const q = Number(n);
  return q >= 2 && q <= 99 ? { text: rest, quantity: q } : { text: lead || trail ? rest : text };
}

function tidy(text: string): string {
  const t = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(a|an|some|the|our|my|your)\s+/i, "")
    .replace(/[,.;:!-]+$/, "")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** A line that's about packing, or null so it's read as a plan or a question. */
export function parsePackLine(input: string): PackDraft | null {
  const line = input.trim();
  let body: string;
  let kind: PackKind = "shared";
  let assignee: string | undefined;
  let self = false;
  let m: RegExpExecArray | null;
  if ((m = PACK.exec(line))) [body, kind] = [m[1], "personal"];
  else if ((m = SELF.exec(line))) [body, self] = [m[1], true];
  else if ((m = BRING.exec(line))) body = m[1];
  else if ((m = NAMED.exec(line))) [assignee, body] = [m[1], m[2]];
  else return null;

  const by = BY.exec(body);
  if (by) {
    body = by[1];
    if (SELF_WORD.test(by[2])) self = true;
    else if (!NOBODY.test(by[2])) assignee = by[2];
    kind = "shared";
  }
  if (assignee && NOBODY.test(assignee)) assignee = undefined;
  if (assignee) {
    kind = "shared";
    assignee = assignee[0].toUpperCase() + assignee.slice(1);
  }
  const q = quantityOf(body.trim());
  const text = tidy(q.text).slice(0, 300);
  if (!text) return null;
  return {
    text,
    kind: self || assignee ? "shared" : kind,
    ...(assignee ? { assignee } : {}),
    ...(self ? { self: true } : {}),
    ...(q.quantity ? { quantity: q.quantity } : {}),
    category: guessCategory(text),
  };
}

// ---------------------------------------------------------------------------
// Suggestions from the plan: checked here whatever wrote them, then reviewed by a person.

export interface PackSuggestion {
  text: string;
  kind: PackKind;
  category: PackCategory;
  quantity?: number;
  /** The item that needs it. */
  itemId?: string;
  /** "Near freezing at the summit at night." */
  why?: string;
}

const RawSuggestion = z.object({
  text: z.string().trim().min(1).max(80),
  kind: z.enum(["shared", "personal"]).catch("personal"),
  category: z.string().optional().nullable(),
  quantity: z.number().int().optional().nullable(),
  itemId: z.string().optional().nullable(),
  why: z.string().trim().optional().nullable(),
});

/** "Dry bags", "dry-bag" and "a dry bag" are the same thing. */
export function sameThing(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(a|an|some|the|our|my)\s+/, "")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .replace(/(es|s)$/, "");
  return norm(a) === norm(b);
}

/** Keeps well-formed suggestions that aren't already on the lists `me` can see, linked only to items that exist. */
export function cleanSuggestions(raw: unknown, trip: Pick<Trip, "items" | "packing">, me: string, max = 20): PackSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const { shared, mine } = visiblePacking(trip, me);
  const taken = [...shared, ...mine].map((p) => p.text);
  const items = new Set(trip.items.map((i) => i.id));
  const categories = new Set(PACK_CATEGORIES.map((c) => c.id as string));
  const out: PackSuggestion[] = [];
  for (const r of raw) {
    const p = RawSuggestion.safeParse(r);
    if (!p.success) continue;
    const s = p.data;
    const text = tidy(s.text);
    if (!text || [...taken, ...out.map((o) => o.text)].some((t) => sameThing(t, text))) continue;
    out.push({
      text,
      kind: s.kind,
      category: s.category && categories.has(s.category) ? (s.category as PackCategory) : guessCategory(text),
      ...(s.quantity && s.quantity >= 2 && s.quantity <= 99 ? { quantity: s.quantity } : {}),
      ...(s.itemId && items.has(s.itemId) ? { itemId: s.itemId } : {}),
      ...(s.why ? { why: s.why.slice(0, 160) } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** An accepted suggestion as an entry: shared ones go on the group's list, personal ones on yours. */
export function suggestionEntry(s: PackSuggestion, id: string, me: string): PackEntry {
  return {
    id,
    text: s.text,
    kind: s.kind,
    ...(s.kind === "personal" ? { owner: me } : {}),
    ...(s.quantity ? { quantity: s.quantity } : {}),
    ...(s.itemId ? { itemId: s.itemId } : {}),
    category: s.category,
  };
}
