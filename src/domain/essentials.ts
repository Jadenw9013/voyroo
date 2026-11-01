import type { Essentials, Item, Trip } from "./types";

/*
 * Trip essentials: what to know before landing, kept in the trip so it opens
 * with no signal. A draft from a web search is only a starting point; the
 * screens say so until someone in the group has checked it.
 */

export type EssentialField = "emergency" | "embassy" | "entry" | "money" | "tipping" | "plugs" | "water";

export const ESSENTIAL_FIELDS: { key: EssentialField; label: string; hint: string }[] = [
  { key: "emergency", label: "Emergency numbers", hint: "One per line, like “Police: 110”" },
  { key: "embassy", label: "Embassy or consulate", hint: "Name, address, phone and after-hours line" },
  { key: "entry", label: "Entry rules", hint: "Passport validity, visa, fees, forms" },
  { key: "money", label: "Money", hint: "Currency, cash or card, ATMs" },
  { key: "tipping", label: "Tipping", hint: "Restaurants, drivers, guides" },
  { key: "plugs", label: "Plugs", hint: "Plug type and voltage" },
  { key: "water", label: "Tap water", hint: "Safe to drink or not" },
];

export const hasEssentials = (e: Essentials | undefined): e is Essentials => !!e && ESSENTIAL_FIELDS.some((f) => !!e[f.key]?.trim());

/** A first guess at the group's passports, from where they live. Always editable. */
export function guessNationality(trip: Pick<Trip, "homeTz" | "homeCurrency">): string {
  const tz = trip.homeTz ?? "";
  if (/^(America\/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Indiana\/.+|Kentucky\/.+)|Pacific\/Honolulu)$/.test(tz)) return "United States";
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns)$/.test(tz)) return "Canada";
  if (tz === "Europe/London") return "United Kingdom";
  if (/^Australia\//.test(tz)) return "Australia";
  const byCurrency: Record<string, string> = { USD: "United States", CAD: "Canada", GBP: "United Kingdom", AUD: "Australia", NZD: "New Zealand" };
  return byCurrency[trip.homeCurrency ?? ""] ?? "";
}

export interface EmergencyLine {
  label: string;
  number: string;
}

/** "Police: 110" lines as label and number; anything else stays plain text. */
export function emergencyLines(text: string | undefined): (EmergencyLine | string)[] {
  return (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(.{1,60}?)\s*[:–-]\s*(\+?[\d][\d\s()-]{1,18}\d|\d)$/.exec(line);
      return m ? { label: m[1].trim(), number: m[2].trim() } : line;
    });
}

// ---------------------------------------------------------------------------
// Show to driver

interface Phrase {
  /** BCP 47 tag, so screen readers and fonts switch language. */
  lang: string;
  language: string;
  please: string;
  thanks: string;
}

const PHRASES: Record<string, Phrase> = {
  es: { lang: "es", language: "Spanish", please: "Por favor, lléveme a esta dirección:", thanks: "¡Muchas gracias!" },
  pt: { lang: "pt", language: "Portuguese", please: "Por favor, leve-me a este endereço:", thanks: "Muito obrigado!" },
  fr: { lang: "fr", language: "French", please: "S’il vous plaît, conduisez-moi à cette adresse :", thanks: "Merci beaucoup !" },
  it: { lang: "it", language: "Italian", please: "Per favore, mi porti a questo indirizzo:", thanks: "Grazie mille!" },
  de: { lang: "de", language: "German", please: "Bitte bringen Sie mich zu dieser Adresse:", thanks: "Vielen Dank!" },
  ja: { lang: "ja", language: "Japanese", please: "この住所までお願いします。", thanks: "ありがとうございます。" },
  en: { lang: "en", language: "English", please: "Please take me to this address:", thanks: "Thank you!" },
};

const ZONE_LANG: [RegExp, string][] = [
  [/^America\/(Guatemala|Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Hermosillo|Mazatlan|Bahia_Banderas|Tijuana|Bogota|Lima|Santiago|Punta_Arenas|Buenos_Aires|Argentina\/.+|Caracas|La_Paz|Asuncion|Montevideo|Guayaquil|Panama|Costa_Rica|El_Salvador|Tegucigalpa|Managua|Havana|Santo_Domingo|Puerto_Rico)$|^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta|Pacific\/Galapagos|Pacific\/Easter)$/, "es"],
  [/^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Santarem|Noronha)$|^(Europe\/Lisbon|Atlantic\/(Madeira|Azores))$/, "pt"],
  [/^(Europe\/(Paris|Monaco|Luxembourg)|America\/(Martinique|Guadeloupe|Cayenne)|Indian\/Reunion|Pacific\/(Tahiti|Noumea))$/, "fr"],
  [/^Europe\/(Rome|Vatican|San_Marino)$/, "it"],
  [/^Europe\/(Berlin|Vienna|Zurich|Busingen)$/, "de"],
  [/^Asia\/Tokyo$/, "ja"],
];

/** "Please take me to this address" in the destination's language, from its time zone. English when unsure. */
export function driverPhrase(trip: Pick<Trip, "tz">): Phrase {
  const code = ZONE_LANG.find(([re]) => re.test(trip.tz))?.[1] ?? "en";
  return PHRASES[code];
}

/** Stays worth showing a driver: they have a name or address. In trip order, each once. */
export function driverStays(trip: Trip): Item[] {
  return trip.items
    .filter((i) => i.kind === "stay" && !!(i.place?.address || i.place?.name))
    .sort((a, b) => (a.start?.date ?? "9999").localeCompare(b.start?.date ?? "9999"));
}

/**
 * What a driver needs, in order: the place's name, then where it is. The place's
 * own name wins when it's the fuller version of the title ("Casa" → "Casa Santo
 * Domingo"); when it's only the area ("San Marcos La Laguna"), the title leads.
 */
export function driverLines(item: Pick<Item, "title" | "place">): { name: string; rest: string[] } {
  const placeName = item.place?.name?.trim();
  const ownName = !!placeName && placeName.toLowerCase().includes(item.title.trim().toLowerCase());
  const name = ownName ? placeName! : item.title;
  const rest = [ownName ? null : placeName, item.place?.address?.trim()].filter((l): l is string => !!l && l !== name);
  return { name, rest: [...new Set(rest)] };
}

/** What to copy for a driver or a messaging app: the place's name and where it is, one per line. */
export function driverText(item: Item): string {
  const { name, rest } = driverLines(item);
  return [name, ...rest].join("\n");
}

/** Worth a driver card: somewhere a driver can find, a street address or a stay. */
export function drivable(item: Pick<Item, "kind" | "place">): boolean {
  if (item.kind === "flight") return false;
  return !!item.place?.address || (item.kind === "stay" && !!item.place?.name);
}
