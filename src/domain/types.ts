/**
 * The trip, v2. One kind of thing (an item) with optional details, instead of
 * segments, plan steps, statuses, gaps and questions.
 *
 * Times are wall-clock local times plus an IANA zone, the way people think of
 * them ("check-in 3 PM Antigua time"). The zone defaults to the trip's.
 */

export type ItemKind = "stay" | "flight" | "transport" | "activity" | "food" | "other";

export interface When {
  /** Local date, "YYYY-MM-DD". */
  date: string;
  /** Local time, "HH:MM" (24h). Missing when only the day is known. */
  time?: string;
  /** IANA zone, e.g. "America/Los_Angeles". Missing means the trip's zone. */
  tz?: string;
}

export interface Place {
  name?: string;
  address?: string;
  /** A Google Maps link for the exact place, when known. */
  mapsUrl?: string;
  lat?: number;
  lng?: number;
}

export interface Money {
  amount: number;
  /** ISO 4217, e.g. "GTQ". */
  currency: string;
}

export type BookingState = "todo" | "booked";

/** Present only when the item needs or has a reservation. */
export interface Booking {
  state: BookingState;
  confirmation?: string;
  /** Where it was booked (manage link) or where to book it. */
  url?: string;
  price?: Money;
  /** First name of who booked it, or who is booking it. */
  by?: string;
  /** Cancellation terms, "pay cash on arrival", etc. */
  note?: string;
}

export interface Contact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  instagram?: string;
}

export type LinkKind = "booking" | "website" | "maps" | "tiktok" | "instagram" | "youtube" | "article" | "other";

export interface Link {
  id: string;
  url: string;
  kind: LinkKind;
  title?: string;
  /** Preview picture, from oEmbed or Open Graph. */
  image?: string;
  /** "TikTok", "airbnb.com". */
  site?: string;
  addedBy?: string;
  /** Epoch ms. */
  addedAt: number;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

/** How someone feels about doing it: "I'm in", "Maybe", "Not for me". */
export type Vote = "in" | "maybe" | "out";

/** One person's take on an item. Only they can change it. */
export interface Reaction {
  /** First name. */
  by: string;
  vote?: Vote;
  heart?: true;
}

/** A comment on an item. Only its author can edit or delete it. */
export interface Comment {
  id: string;
  /** First name of who wrote it. */
  by: string;
  /** Empty once deleted. */
  text: string;
  /** Epoch ms, from the author's phone. */
  at: number;
  editedAt?: number;
  /** Deleted by its author: the thread keeps its place, the words are gone. */
  deletedAt?: number;
  /** Written by the assistant because its author asked it to. */
  viaAssistant?: true;
}

export interface Item {
  id: string;
  /** Used for icons and sensible defaults; never something people must pick. */
  kind: ItemKind;
  title: string;
  /** No start: an idea, saved but not on a day yet. */
  start?: When | null;
  /** Stays: checkout. Flights: arrival. Activities: when it ends. */
  end?: When | null;
  place?: Place;
  booking?: Booking;
  contact?: Contact;
  links?: Link[];
  notes?: string;
  checklist?: CheckItem[];
  /** Who's running it. */
  who?: string;
  /** Tentative: shown as "Maybe" until someone settles it. */
  maybe?: boolean;
  /** A non-stay item you sleep in, like an overnight hike's camp. */
  sleepsHere?: boolean;
  /** Highest point in metres, for climbs. */
  peakM?: number;
  /** Who's in, who's a maybe, who'd pass. Changed only by reaction ops. */
  reactions?: Reaction[];
  /** The group's thread about it, oldest first. Changed only by comment ops. */
  comments?: Comment[];
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  who?: string;
  /** The item it's about, if any. */
  itemId?: string;
  note?: string;
}

/**
 * Who shares an expense, and how. Names are first names from the group.
 *   equal:  the same for everyone listed
 *   shares: in proportion ("Ana 2, Ben 1": Ana's room is twice the size)
 *   exact:  set amounts, in the expense's currency, adding up to the total
 */
export type Split =
  | { how: "equal"; among: string[] }
  | { how: "shares"; among: { name: string; shares: number }[] }
  | { how: "exact"; among: { name: string; amount: number }[] };

/** The exchange rate locked in when an expense was logged, so totals never drift. */
export interface Fx {
  /** The currency it converts to: the trip's home currency at the time. */
  to: string;
  /** Units of `to` for one unit of the expense's currency. */
  rate: number;
  /** The day the rate is from, "YYYY-MM-DD". */
  on: string;
}

export interface Expense {
  id: string;
  title: string;
  /** What was paid, in `currency`, e.g. 420 GTQ. */
  amount: number;
  /** ISO 4217. */
  currency: string;
  /** First name of who paid. */
  paidBy: string;
  split: Split;
  /** Local day it was paid, "YYYY-MM-DD". */
  date: string;
  /** The item it was for, if any: a booking, a dinner. */
  itemId?: string;
  note?: string;
  fx?: Fx;
  /** Paying someone back ("Ana paid Ben Q350"), not spending: left out of totals. */
  settlement?: true;
  addedBy?: string;
  /** Epoch ms. */
  addedAt: number;
}

export type PackKind = "shared" | "personal";

export type PackCategory = "documents" | "clothes" | "toiletries" | "health" | "tech" | "gear" | "snacks" | "other";

/**
 * One thing to pack. Shared: the group needs one (or a few) and someone says
 * they'll bring it. Personal: on one person's own list, shown only to them in
 * the app; it's stored in the trip like everything else, so it isn't secret.
 */
export interface PackEntry {
  id: string;
  text: string;
  kind: PackKind;
  /** Personal: whose list it's on. */
  owner?: string;
  /** Shared: who said they'd bring it. */
  assignee?: string;
  /** How many, when more than one. */
  quantity?: number;
  /** First names of who has packed it. On a personal entry, only the owner. */
  packedBy?: string[];
  /** The item it's for ("the volcano hike"), if any. */
  itemId?: string;
  category?: PackCategory;
}

export interface Trip {
  schema: 2;
  id: string;
  name: string;
  /** "Guatemala". Used in prompts and searches. */
  destination: string;
  /** First day, "YYYY-MM-DD". */
  startDate: string;
  /** The day you travel home. Nights run up to the night before it. */
  endDate: string;
  /** The destination's IANA zone. */
  tz: string;
  /** Where the group lives, for flight departures. */
  homeTz?: string;
  /** Local currency, ISO 4217. */
  currency: string;
  homeCurrency?: string;
  /** First names in the group. */
  people: string[];
  /** Cover picture URL. */
  cover?: string;
  /** Trip-wide notes: entry rules, money, emergency numbers. */
  notes?: string;
  /** Emergency numbers, entry rules and the like: a draft the group checks and corrects. */
  essentials?: Essentials;
  items: Item[];
  todos: Todo[];
  /** What the group has spent and paid back. Missing means none yet. */
  expenses?: Expense[];
  /** Missing on trips from before the packing list: the same as none. */
  packing?: PackEntry[];
}

export interface Source {
  url: string;
  title?: string;
}

/**
 * What to know before landing. Plain text per topic so anyone can correct it.
 * A first draft may come from a web search; it says so until someone checks it.
 */
export interface Essentials {
  /** Whose passports the embassy and entry rules are for: "United States". */
  nationality?: string;
  /** One per line: "Police: 110". */
  emergency?: string;
  embassy?: string;
  entry?: string;
  /** Currency, cash and cards. */
  money?: string;
  tipping?: string;
  plugs?: string;
  water?: string;
  /** Where the draft's facts came from. */
  sources?: Source[];
  /** When the draft was looked up, "YYYY-MM-DD". */
  draftedOn?: string;
  /** Who checked it against official sources, and when ("YYYY-MM-DD"). */
  checkedBy?: string;
  checkedOn?: string;
}

/** A stored trip and its version; the version goes up by one per change. */
export interface TripState {
  trip: Trip;
  version: number;
}
