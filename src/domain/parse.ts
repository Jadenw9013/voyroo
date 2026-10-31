import * as chrono from "chrono-node";
import { extractUrls } from "./links";
import { roundMoney } from "./money";
import { offsetOn, todayIn } from "./time";
import type { ItemKind, Trip, When } from "./types";

/*
 * The one box: "zipline thu 11am", "dinner 7 at Sabe Rico", "taxi Q80 split
 * all", a pasted link, or a question. Parsed on the device, so adding works
 * with no signal and no AI. When it has to guess (morning or evening), it
 * guesses and shows the guess in the preview instead of asking.
 */

export interface Draft {
  title: string;
  kind: ItemKind;
  /** Missing: saved as an idea with no day. */
  start?: When;
  end?: When;
  /** "Sabe Rico" from "dinner at Sabe Rico". */
  placeName?: string;
  /** Where the day came from: the words typed, or the day on screen. */
  dayFrom: "text" | "selected" | null;
  /** AM/PM wasn't said; the preview should show the guess. */
  guessedTime: boolean;
  /** The day is outside the trip's dates. */
  outsideTrip: boolean;
}

/** "dinner 420 GTQ paid by Ana split all", read. */
export interface ExpenseDraft {
  title: string;
  amount: number;
  currency: string;
  /** "paid by Ana", "Ana paid", "I paid"; else whoever is typing. */
  paidBy: string;
  /** Who shares it: everyone unless the line named people. */
  among: string[];
  /** Local day it was paid: one the line said, the day on screen, or today. */
  date: string;
  /** Names typed that aren't in the group, to point out in the preview. */
  unknown: string[];
}

export type Parsed =
  | { type: "empty" }
  /** A question or a change request: the assistant's job. */
  | { type: "ask" }
  /** Contains links: save them (with any words around them as the title or note). */
  | { type: "links"; urls: string[]; rest: string }
  /** An amount, and paid, split or spent: something the group spent. */
  | { type: "expense"; draft: ExpenseDraft }
  | { type: "item"; draft: Draft };

export interface ParseContext {
  /** With its people and currency, lines about money are read as expenses. */
  trip: Pick<Trip, "startDate" | "endDate" | "tz"> & Partial<Pick<Trip, "people" | "currency" | "homeCurrency">>;
  nowMs: number;
  /** The day on screen, if any: "11am" with no day means that day. */
  day?: string | null;
  /** Who's typing: "I paid" means them. */
  me?: string;
}

const QUESTION =
  /^(what|what's|whats|when|where|who|why|how|which|is|are|do|does|did|can|could|should|would|will|any|anything|find|suggest|recommend|plan|help|tell|show|compare|explain|translate)\b/i;
const CHANGE = /^(move|change|reschedule|push|shift|cancel|delete|remove|rename|update|swap|switch|replace|undo|mark|make|set)\b/i;

const KIND_WORDS: [RegExp, ItemKind][] = [
  [/\b(flight|fly|flying|airline|[A-Z]{2} ?\d{2,4})\b/, "flight"],
  [/\b(shuttle|transfer|taxi|uber|bus|boat|ferry|lancha|tuk ?tuk|drive|pickup|pick-up|train|car rental|rental car)\b/i, "transport"],
  [/\b(hotel|airbnb|hostel|lodge|guesthouse|posada|stay|check[- ]?in|resort|camping)\b/i, "stay"],
  [/\b(dinner|lunch|breakfast|brunch|coffee|cafe|café|restaurant|drinks|bar|eat|food|tacos|pupusas|bakery|market)\b/i, "food"],
];

export function guessKind(text: string): ItemKind {
  for (const [re, kind] of KIND_WORDS) if (re.test(text)) return kind;
  return "activity";
}

/** AM or PM when nobody said: meals decide it, else small hours are afternoon. */
function guessHour(hour: number, text: string): number {
  if (hour >= 12) return hour;
  if (/\b(dinner|drinks|bar|supper|party|show|concert)\b/i.test(text)) return hour === 12 ? 12 : hour + 12;
  if (/\b(breakfast|brunch|coffee|sunrise)\b/i.test(text)) return hour;
  if (/\blunch\b/i.test(text)) return hour <= 5 ? hour + 12 : hour;
  return hour >= 1 && hour <= 6 ? hour + 12 : hour;
}

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_WORDS = /\b(today|tonight|tomorrow|this (morning|afternoon|evening))\b/i;
const BARE_HOUR = /(?:^|\s)(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?(?=\s|$)/i;

function cleanTitle(rest: string): string {
  const t = rest
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(at|on|from|for|by|this|next|the|around|until|till)$/i, "")
    .replace(/^(at|on|from|for|by)\s+/i, "")
    .replace(/[,.;:-]+$/, "")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** "dinner at Sabe Rico" → "Sabe Rico". Only a capitalised or multi-word name, never "at home". */
function placeFrom(title: string): string | undefined {
  const m = /\b(?:at|@)\s+(.{3,80})$/i.exec(title);
  if (!m) return undefined;
  const name = m[1].trim();
  if (/^(home|the hotel|the airbnb|night|noon|midnight)$/i.test(name)) return undefined;
  return name.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** The day "thu" and "11am" are counted from: the day on screen, today during the trip, else the first day. */
export function referenceDay({ trip, nowMs, day }: ParseContext): string {
  if (day) return day;
  const today = todayIn(trip.tz, nowMs);
  return today < trip.startDate || today > trip.endDate ? trip.startDate : today;
}

export function parseLine(input: string, ctx: ParseContext): Parsed {
  const text = input.trim();
  if (!text) return { type: "empty" };
  const urls = extractUrls(text);
  if (urls.length) {
    let rest = text;
    for (const u of urls) rest = rest.replace(u, " ");
    return { type: "links", urls, rest: rest.replace(/\s+/g, " ").trim() };
  }
  if (text.endsWith("?") || QUESTION.test(text) || CHANGE.test(text) || text.length > 120 || text.includes("\n")) return { type: "ask" };
  const expense = parseExpense(text, ctx);
  if (expense) return { type: "expense", draft: expense };

  const ref = referenceDay(ctx);
  const tz = ctx.trip.tz;
  const instant = new Date(Date.parse(`${ref}T00:00:00Z`) - offsetOn(ref, tz) * 60_000);
  const [hit] = chrono.parse(text, { instant, timezone: offsetOn(ref, tz) }, { forwardDate: true });

  let rest = hit ? `${text.slice(0, hit.index)} ${text.slice(hit.index + hit.text.length)}` : text;
  const said = (hit?.text ?? "").toLowerCase();
  const c = hit?.start;
  const kind = guessKind(text);

  let date: string | null = null;
  let dayFrom: Draft["dayFrom"] = null;
  if (c && (c.isCertain("day") || c.isCertain("weekday") || c.isCertain("month") || DAY_WORDS.test(said))) {
    date = `${c.get("year")}-${pad(c.get("month")!)}-${pad(c.get("day")!)}`;
    dayFrom = "text";
  } else if (ctx.day) {
    date = ctx.day;
    dayFrom = "selected";
  }

  let time: string | undefined;
  let guessedTime = false;
  if (c?.isCertain("hour")) {
    let h = c.get("hour")!;
    if (!c.isCertain("meridiem") && !/\b(noon|midday|midnight)\b/.test(said)) {
      guessedTime = h < 12;
      h = guessHour(h, text);
    }
    time = `${pad(h)}:${pad(c.get("minute") ?? 0)}`;
  } else {
    // "dinner 7" or "at 7:30": chrono leaves a lone number alone.
    const bare = BARE_HOUR.exec(rest);
    if (bare) {
      const h = guessHour(Number(bare[1]), text);
      time = `${pad(h)}:${bare[2] ?? "00"}`;
      guessedTime = true;
      rest = rest.replace(bare[0], " ");
    }
  }
  // A time with no day at all: the reference day.
  if (time && !date) {
    date = ref;
    dayFrom = "selected";
  }

  let end: When | undefined;
  const e = hit?.end;
  if (date && e) {
    const endDate = e.isCertain("day") || e.isCertain("weekday") ? `${e.get("year")}-${pad(e.get("month")!)}-${pad(e.get("day")!)}` : date;
    end = { date: endDate, ...(e.isCertain("hour") ? { time: `${pad(e.get("hour")!)}:${pad(e.get("minute") ?? 0)}` } : {}) };
  }

  let title = cleanTitle(rest);
  const placeName = placeFrom(title);
  if (placeName) title = title.replace(/(\b(?:at|@)\s+).{3,80}$/i, `$1${placeName}`);
  const outsideTrip = !!date && (date < ctx.trip.startDate || date > ctx.trip.endDate);
  return {
    type: "item",
    draft: {
      title,
      kind,
      ...(date ? { start: { date, ...(time ? { time } : {}) } } : {}),
      ...(end ? { end } : {}),
      placeName,
      dayFrom,
      guessedTime,
      outsideTrip,
    },
  };
}

// ---------------------------------------------------------------------------
// Expenses: "dinner 420 GTQ paid by Ana split all", "taxi Q80 split with Ben",
// "I paid $54.50 for groceries yesterday".

/** An amount is something spent, rather than a price to note, when the line says so. */
const MONEY_WORDS = /\b(paid|pay|pays|split|spent|owe|owes|expense)\b/i;

/** Longest first, so "MX$" isn't read as "$". */
const SYMBOLS: [string, string][] = [
  ["US$", "USD"],
  ["MX$", "MXN"],
  ["CA$", "CAD"],
  ["NZ$", "NZD"],
  ["C$", "CAD"],
  ["A$", "AUD"],
  ["R$", "BRL"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["₹", "INR"],
  ["₡", "CRC"],
  ["Q.", "GTQ"],
  ["Q", "GTQ"],
];
const DOLLARS = new Set(["USD", "CAD", "AUD", "NZD", "MXN", "SGD", "HKD", "BZD"]);
/** Codes people type in lowercase ("420 gtq"). Others need capitals, so "split 40 all" isn't Albanian lek. */
const COMMON = new Set(["usd", "eur", "gbp", "cad", "aud", "nzd", "mxn", "gtq", "crc", "jpy", "chf", "brl", "cop", "pen", "clp", "inr", "thb", "sgd", "hkd"]);

let codes: Set<string> | null = null;
function isCode(code: string): boolean {
  if (!codes) {
    try {
      codes = new Set(Intl.supportedValuesOf("currency"));
    } catch {
      codes = new Set([...COMMON].map((c) => c.toUpperCase()));
    }
  }
  return codes.has(code);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?`;
const SYMBOL = [...SYMBOLS.map(([s]) => escape(s)), "\\$"].join("|");
/** [symbol, space, code before, space, number, space, code after]. A number never runs into a letter, a time ("7:30") or "pm". */
const MONEY = new RegExp(String.raw`(?<![\p{L}\d.,/-])(?:(${SYMBOL})(\s?)|([A-Za-z]{3})(\s?))?(${NUMBER})(?:(\s?)([A-Za-z]{3})(?!\p{L})|(?![\p{L}\d:/-]|[.,]\d|\s?(?:am|pm|a\.m|p\.m)\b))`, "gu");

const WORD = String.raw`\p{L}[\p{L}'-]*`;
const EVERYONE = /^(all|everyone|everybody|evenly|equally|us|group)$/i;

interface Found {
  amount: number;
  currency: string;
  /** Where the amount and its currency sit in the line, to take them out of the title. */
  at: number;
  text: string;
}

/** "420 GTQ", "Q420", "$54.50", "€20": the amount and its currency. With several numbers, one with a currency wins, else the biggest. */
function moneyIn(text: string, ctx: ParseContext, names: Set<string>): Found | null {
  const local = ctx.trip.currency ?? "USD";
  const home = ctx.trip.homeCurrency;
  const dollar = home && DOLLARS.has(home) ? home : DOLLARS.has(local) ? local : "USD";
  const code = (c: string | undefined) => {
    if (!c || names.has(c.toLowerCase())) return null;
    const up = c.toUpperCase();
    return (c === up || COMMON.has(c) || up === local || up === home) && isCode(up) ? up : null;
  };
  const found: (Found & { said: boolean })[] = [];
  for (const m of text.matchAll(MONEY)) {
    const [, symbol, s1 = "", before, s2 = "", num, s3 = "", after] = m;
    const amount = Number(num.replace(/,/g, ""));
    if (!(amount > 0)) continue;
    const bySymbol = symbol ? (symbol === "$" ? dollar : SYMBOLS.find(([s]) => s === symbol)![1]) : null;
    const currency = bySymbol ?? code(before) ?? code(after);
    // Keep the words beside the number that weren't its currency ("for 420" keeps "for").
    const lead = bySymbol ? symbol + s1 : currency && code(before) === currency ? before + s2 : "";
    const tail = currency && code(after) === currency ? s3 + after : "";
    const at = m.index + (bySymbol ? 0 : before && !lead ? before.length + s2.length : 0);
    found.push({ amount, currency: currency ?? local, at, text: lead + num + tail, said: !!currency });
  }
  const best = found.find((f) => f.said) ?? found.sort((a, b) => b.amount - a.amount)[0];
  return best ? { amount: roundMoney(best.amount, best.currency), currency: best.currency, at: best.at, text: best.text } : null;
}

/** An expense line, or null if it isn't one: it needs an amount, and paid, split or spent. */
export function parseExpense(input: string, ctx: ParseContext): ExpenseDraft | null {
  const text = input.trim();
  if (!ctx.trip.currency || !ctx.me || !MONEY_WORDS.test(text)) return null;
  const me = ctx.me;
  const group = [...new Set([me, ...(ctx.trip.people ?? [])])];
  const byLower = new Map(group.map((n) => [n.toLowerCase(), n]));
  const person = (w: string) => (/^(i|me|myself)$/i.test(w) ? me : byLower.get(w.toLowerCase()));
  const money = moneyIn(text, ctx, new Set(byLower.keys()));
  if (!money) return null;

  const unknown: string[] = [];
  let rest = ` ${text.slice(0, money.at)} ${text.slice(money.at + money.text.length)} `;
  const cut = (m: RegExpExecArray | null) => m && (rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length));

  // Who paid: "paid by Ana", "Ana paid", "I paid", "we paid" (whoever's typing).
  let paidBy = me;
  const by = new RegExp(String.raw`\bpaid\s+by\s+(${WORD})`, "iu").exec(rest);
  if (by) {
    const p = person(by[1]);
    if (p) paidBy = p;
    else unknown.push(by[1]);
    cut(by);
  }
  const subject = new RegExp(String.raw`(?:^|\s)(${WORD})\s+(?:paid|pays|spent)\b`, "iu").exec(rest);
  if (subject && (person(subject[1]) || /^we$/i.test(subject[1]))) {
    paidBy = person(subject[1]) ?? me;
    cut(subject);
  }

  // Who shares it: "split all", "split with Ben" (and whoever paid), "split Ana Ben", "split between Ana and Cy".
  let among = group;
  const split = /\bsplit\b(\s+it)?/i.exec(rest);
  if (split) {
    let end = split.index + split[0].length;
    let mode: string | null = null;
    const named: string[] = [];
    let all = false;
    const token = new RegExp(String.raw`^(\s*)(,|&|${WORD}|\d+)`, "u");
    for (let t = token.exec(rest.slice(end)); t; t = token.exec(rest.slice(end))) {
      const w = t[2];
      if (/^(with|between|among|by)$/i.test(w) && !mode && !named.length) mode = w.toLowerCase();
      else if (EVERYONE.test(w) || /^\d+$|^ways?$/i.test(w)) all = true;
      else if (person(w)) named.push(person(w)!);
      else if (!/^(,|&|and|the)$/i.test(w)) {
        if (/^\p{Lu}/u.test(w) && !named.length && !all) unknown.push(w);
        break;
      }
      end += t[0].length;
    }
    if (!all && named.length) among = [...new Set(mode === "with" ? [paidBy, ...named] : named)];
    rest = rest.slice(0, split.index) + " " + rest.slice(end);
  }

  // The day: one said ("yesterday", "thu"), else the day on screen, else today there.
  const today = todayIn(ctx.trip.tz, ctx.nowMs);
  let date = ctx.day ?? today;
  const instant = new Date(Date.parse(`${today}T12:00:00Z`) - offsetOn(today, ctx.trip.tz) * 60_000);
  const [hit] = chrono.parse(rest, { instant, timezone: offsetOn(today, ctx.trip.tz) });
  if (hit && (hit.start.isCertain("day") || hit.start.isCertain("weekday") || /\b(today|tonight|yesterday)\b/i.test(hit.text))) {
    date = `${hit.start.get("year")}-${pad(hit.start.get("month")!)}-${pad(hit.start.get("day")!)}`;
    rest = rest.replace(hit.text, " ");
  }

  const title = cleanTitle(rest.replace(/(^|\s)(paid|pay|pays|spent|expense)(?=\s)/gi, " ").replace(/\s(for|on)\s*$/i, " "));
  return { title: title || "Expense", amount: money.amount, currency: money.currency, paidBy, among, date, unknown };
}
