import { tool } from "ai";
import { z } from "zod";
import { prepareChange } from "@/domain/change";
import { everyone, fxFor, homeCurrency, type Rates } from "@/domain/expenses";
import { newId } from "@/domain/ids";
import { classifyLink, extractUrls } from "@/domain/links";
import { itemsTouched, touchesBooked, type Op } from "@/domain/ops";
import type { ItemPatchT } from "@/domain/schema";
import { roundMoney } from "@/domain/money";
import { isDate, todayIn } from "@/domain/time";
import type { Expense, Item, ItemKind, Link, Split, Trip, When } from "@/domain/types";
import { getRates } from "../rates";
import type { TripStore } from "../store";

/*
 * The assistant's own tools. Flat inputs (Gemini handles flat schemas best),
 * turned into the same ops a person's edit makes and checked by the same rules.
 *
 *   add_items, update_items, add_todos  apply at once, with Undo in the app
 *   add_expenses                        likewise: who paid what, split with the group
 *   remove_items                        never applies: it returns a card a person confirms
 *   update_items on a booked item's dates  likewise
 *   show_options                        place or option cards with an Add button
 *   ask_user                            a question with tappable answers (answered in the app)
 */

const KINDS = ["stay", "flight", "transport", "activity", "food", "other"] as const;

const Details = {
  date: z.string().optional().describe("YYYY-MM-DD. Leave out to save it as an idea with no day."),
  time: z.string().optional().describe("HH:MM, 24-hour, local time where it happens. Leave out if unknown."),
  endDate: z.string().optional().describe("YYYY-MM-DD. Stays: the checkout day."),
  endTime: z.string().optional().describe("HH:MM, 24-hour."),
  timeZone: z.string().optional().describe("IANA zone, only when the time isn't in the trip's zone (e.g. a flight leaving home)."),
  placeName: z.string().optional(),
  address: z.string().optional().describe("Street address, from Google Maps when you looked it up."),
  mapsUrl: z.string().optional().describe("The Google Maps link for the exact place."),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  booking: z.enum(["none", "todo", "booked"]).optional().describe("todo: needs reserving. booked: reserved."),
  bookingUrl: z.string().optional().describe("Where it was booked, or where to book it."),
  confirmation: z.string().optional().describe("Confirmation or booking reference, only if the person gave it."),
  priceAmount: z.number().optional(),
  priceCurrency: z.string().optional().describe("ISO 4217, e.g. GTQ or USD."),
  notes: z.string().optional(),
  maybe: z.boolean().optional().describe("True for a suggestion nobody has agreed to yet, such as times you proposed."),
  who: z.string().optional().describe("First name of who's running it."),
  links: z.array(z.string()).optional().describe("Web links to keep on the item: listings, posts, articles."),
};

const NewItem = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(KINDS),
  ...Details,
});

const ItemUpdate = z.object({
  id: z.string().describe("The item's exact id from the trip data."),
  title: z.string().optional(),
  kind: z.enum(KINDS).optional(),
  ...Details,
  clear: z.array(z.string()).optional().describe('Fields to empty, e.g. ["time", "notes"].'),
});

type NewItemT = z.infer<typeof NewItem>;
type ItemUpdateT = z.infer<typeof ItemUpdate>;

const clean = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);

/** "who" is someone in the group, never a host or guide the model read off a booking. */
function member(name: string | undefined, trip: Trip, me: string): string | undefined {
  const n = clean(name)?.toLowerCase();
  return n ? [me, ...trip.people].find((p) => p.toLowerCase() === n) : undefined;
}
const isUrl = (s: string | undefined) => !!s && /^https?:\/\/\S+$/i.test(s.trim());

function when(date: string | undefined, time: string | undefined, tz: string | undefined, trip: Trip): When | null {
  if (!clean(date)) return null;
  const t = clean(time);
  const z = clean(tz);
  return { date: date!.trim(), ...(t ? { time: t } : {}), ...(t && z && z !== trip.tz ? { tz: z } : {}) };
}

function linksFrom(urls: string[] | undefined, author: string): Link[] {
  return (urls ?? [])
    .flatMap((u) => extractUrls(u))
    .slice(0, 10)
    .map((url) => ({ id: newId("l"), url, ...classifyLink(url), addedBy: author, addedAt: Date.now() }));
}

export function toItem(input: NewItemT, trip: Trip, author: string): Item {
  const start = when(input.date, input.time, input.timeZone, trip);
  const end = start ? when(input.endDate, input.endTime, input.timeZone, trip) : null;
  const place = {
    ...(clean(input.placeName) ? { name: clean(input.placeName) } : {}),
    ...(clean(input.address) ? { address: clean(input.address) } : {}),
    ...(isUrl(input.mapsUrl) ? { mapsUrl: input.mapsUrl!.trim() } : {}),
  };
  const contact = {
    ...(clean(input.phone) ? { phone: clean(input.phone) } : {}),
    ...(clean(input.whatsapp) ? { whatsapp: clean(input.whatsapp) } : {}),
    ...(clean(input.email) ? { email: clean(input.email) } : {}),
    ...(isUrl(input.website) ? { website: input.website!.trim() } : {}),
    ...(clean(input.instagram) ? { instagram: clean(input.instagram) } : {}),
  };
  const state = input.booking && input.booking !== "none" ? input.booking : input.confirmation ? "booked" : undefined;
  const links = linksFrom(input.links, author);
  return {
    id: newId("i"),
    kind: input.kind as ItemKind,
    title: input.title.trim().slice(0, 200),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(Object.keys(place).length ? { place } : {}),
    ...(Object.keys(contact).length ? { contact } : {}),
    ...(state
      ? {
          booking: {
            state,
            ...(clean(input.confirmation) ? { confirmation: clean(input.confirmation) } : {}),
            ...(isUrl(input.bookingUrl) ? { url: input.bookingUrl!.trim() } : {}),
            ...(input.priceAmount !== undefined && clean(input.priceCurrency) ? { price: { amount: input.priceAmount, currency: input.priceCurrency!.trim().toUpperCase() } } : {}),
          },
        }
      : {}),
    ...(links.length ? { links } : {}),
    ...(clean(input.notes) ? { notes: clean(input.notes)!.slice(0, 5000) } : {}),
    ...(input.maybe ? { maybe: true } : {}),
    ...(member(input.who, trip, author) ? { who: member(input.who, trip, author) } : {}),
  };
}

/** The ops for one update: a patch for the item plus any new links. */
export function toUpdateOps(u: ItemUpdateT, item: Item, trip: Trip, author: string): Op[] {
  const set: Record<string, unknown> = {};
  const clear = new Set(u.clear ?? []);
  if (clean(u.title)) set.title = u.title!.trim();
  if (u.kind) set.kind = u.kind;
  if (u.date !== undefined || u.time !== undefined || clear.has("time") || clear.has("date")) {
    const date = clear.has("date") ? undefined : (clean(u.date) ?? item.start?.date);
    const time = clear.has("time") ? undefined : (clean(u.time) ?? item.start?.time);
    set.start = when(date, time, u.timeZone ?? item.start?.tz, trip);
    if (!set.start) set.end = null;
  }
  if (u.endDate !== undefined || u.endTime !== undefined) {
    set.end = when(clean(u.endDate) ?? item.end?.date ?? (set.start as When | null)?.date ?? item.start?.date, clean(u.endTime) ?? item.end?.time, u.timeZone ?? item.end?.tz, trip);
  }
  const place: Record<string, unknown> = {};
  if (clean(u.placeName)) place.name = u.placeName!.trim();
  if (clean(u.address)) place.address = u.address!.trim();
  if (isUrl(u.mapsUrl)) place.mapsUrl = u.mapsUrl!.trim();
  if (Object.keys(place).length) set.place = place;
  const contact: Record<string, unknown> = {};
  for (const k of ["phone", "whatsapp", "email", "instagram"] as const) if (clean(u[k])) contact[k] = u[k]!.trim();
  if (isUrl(u.website)) contact.website = u.website!.trim();
  if (Object.keys(contact).length) set.contact = contact;
  if (u.booking === "none") set.booking = null;
  else {
    const booking: Record<string, unknown> = {};
    if (u.booking) booking.state = u.booking;
    if (clean(u.confirmation)) booking.confirmation = u.confirmation!.trim();
    if (isUrl(u.bookingUrl)) booking.url = u.bookingUrl!.trim();
    if (u.priceAmount !== undefined && clean(u.priceCurrency)) booking.price = { amount: u.priceAmount, currency: u.priceCurrency!.trim().toUpperCase() };
    if (Object.keys(booking).length) set.booking = booking;
  }
  if (clean(u.notes)) set.notes = u.notes!.trim().slice(0, 5000);
  if (u.maybe !== undefined) set.maybe = u.maybe ? true : null;
  if (member(u.who, trip, author)) set.who = member(u.who, trip, author);
  for (const k of clear) if (["notes", "who", "maybe", "place", "contact", "booking"].includes(k)) set[k] = null;

  const ops: Op[] = Object.keys(set).length ? [{ op: "item.update", id: item.id, set: set as ItemPatchT }] : [];
  for (const link of linksFrom(u.links, author)) ops.push({ op: "link.add", itemId: item.id, link });
  return ops;
}

const NewExpense = z.object({
  title: z.string().min(1).max(200).describe('What it was for: "Dinner at Sabe Rico", "Taxi to the dock".'),
  amount: z.number().positive().describe("The total paid."),
  currency: z.string().optional().describe("ISO 4217, e.g. GTQ or USD. Leave out for the trip's local currency."),
  paidBy: z.string().optional().describe("First name of who paid, from the group. Leave out for the person talking to you."),
  splitAmong: z.array(z.string()).optional().describe("First names sharing it equally. Leave out for the whole group."),
  exactAmounts: z
    .array(z.object({ name: z.string(), amount: z.number().nonnegative() }))
    .optional()
    .describe("Only when the person said who owes how much. Must add up to amount; replaces splitAmong."),
  date: z.string().optional().describe("YYYY-MM-DD it was paid. Leave out for today."),
  itemId: z.string().optional().describe("The item it paid for, by its exact id, if it matches one."),
  note: z.string().optional(),
});

type NewExpenseT = z.infer<typeof NewExpense>;

/** One expense from the assistant: only people in the group, the trip's currency unless said, and today's rate locked in. */
export function toExpense(input: NewExpenseT, trip: Trip, me: string, rates: Rates | null): Expense | { error: string } {
  const currency = clean(input.currency)?.toUpperCase() ?? trip.currency;
  if (!/^[A-Z]{3}$/.test(currency)) return { error: `"${input.currency}" isn't a currency code.` };
  const amount = roundMoney(input.amount, currency);
  const group = everyone(trip, me);
  const paidBy = input.paidBy ? member(input.paidBy, trip, me) : me;
  if (!paidBy) return { error: `${input.paidBy} isn't in the group (${group.join(", ")}).` };
  let split: Split;
  if (input.exactAmounts?.length) {
    const among = input.exactAmounts.map((p) => ({ name: member(p.name, trip, me), amount: roundMoney(p.amount, currency) }));
    const stranger = input.exactAmounts.find((_, i) => !among[i].name);
    if (stranger) return { error: `${stranger.name} isn't in the group (${group.join(", ")}).` };
    split = { how: "exact", among: among as { name: string; amount: number }[] };
  } else {
    const named = (input.splitAmong ?? []).filter((n) => !/^(everyone|all|everybody|group)$/i.test(n.trim()));
    const among = [...new Set(named.map((n) => member(n, trip, me)).filter((n): n is string => !!n))];
    if (named.length && !among.length) return { error: `None of ${named.join(", ")} are in the group (${group.join(", ")}).` };
    split = { how: "equal", among: among.length ? among : group };
  }
  const date = clean(input.date) && isDate(input.date!.trim()) ? input.date!.trim() : todayIn(trip.tz);
  const fx = fxFor(currency, homeCurrency(trip), rates);
  return {
    id: newId("e"),
    title: input.title.trim().slice(0, 200),
    amount,
    currency,
    paidBy,
    split,
    date,
    ...(input.itemId && trip.items.some((i) => i.id === input.itemId) ? { itemId: input.itemId } : {}),
    ...(clean(input.note) ? { note: clean(input.note)!.slice(0, 300) } : {}),
    ...(fx ? { fx } : {}),
    addedBy: me,
    addedAt: Date.now(),
  };
}

export interface ToolContext {
  store: TripStore;
  tripId: string;
  /** The person asking. */
  me: string;
  /** The latest trip, read fresh for each tool call. */
  trip: () => Promise<Trip>;
  /** Today's exchange rates (tests pass their own). */
  rates?: () => Promise<Rates | null>;
}

/** What the app shows for a change the assistant made, or wants confirmed. */
/** Changes to booked items held back for a person's tap, from a batch whose other changes went through. */
export interface Pending {
  message: string;
  ops: Op[];
  summary: string[];
}

export type ChangeResult =
  | { ok: true; entryId: string; summary: string[]; itemIds: string[]; pending?: Pending }
  | { ok: false; needsConfirmation: true; message: string; ops: Op[]; summary: string[] }
  | { ok: false; error: string };

/** What a person would be confirming: the summary of the held-back ops. */
function pendingFor(trip: Trip, ops: Op[], author: string, message: string): Pending {
  const p = prepareChange({ trip, version: 0 }, ops, { author, confirmed: true });
  return { message, ops, summary: p.ok ? p.entry.summary : [] };
}

/**
 * Applies a batch at once, except changes to booked items' dates and any
 * removal, which come back for a person to confirm. The rest of the batch
 * still goes through, so one booked item doesn't cost another round trip.
 */
async function applyOrConfirm(ctx: ToolContext, ops: Op[], forceConfirm = false): Promise<ChangeResult> {
  if (!ops.length) return { ok: false, error: "Nothing to change." };
  const trip = await ctx.trip();
  const author = `${ctx.me} via assistant`;
  if (forceConfirm) {
    const p = pendingFor(trip, ops, author, "Remove from the trip?");
    return { ok: false, needsConfirmation: true, ...p };
  }
  const held = ops.filter((o) => touchesBooked(trip, o));
  const now = ops.filter((o) => !held.includes(o));
  const heldNote = held.length ? pendingFor(trip, held, author, `${held.length === 1 ? "This changes something booked" : "These change booked items"}. Check with whoever booked it, then confirm.`) : undefined;
  if (!now.length) return { ok: false, needsConfirmation: true, ...heldNote! };

  const dry = prepareChange({ trip, version: 0 }, now, { author });
  if (!dry.ok) return { ok: false, error: dry.issues.map((i) => i.message).join(" ") };
  const r = await ctx.store.apply(ctx.tripId, now, { author });
  if (!r.ok) return { ok: false, error: r.reason === "invalid" ? r.issues.map((i) => i.message).join(" ") : "The trip couldn't be saved just now." };
  const itemIds = [...new Set(now.flatMap(itemsTouched))];
  return { ok: true, entryId: r.entry.id, summary: r.entry.summary, itemIds, ...(heldNote ? { pending: heldNote } : {}) };
}

const OptionSchema = z.object({
  name: z.string(),
  why: z.string().describe("One short line on why it fits this group."),
  kind: z.enum(KINDS),
  address: z.string().optional(),
  mapsUrl: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  priceHint: z.string().optional().describe('Rough cost from what you found, e.g. "Q120 a person". Leave out if you don\'t know.'),
  date: z.string().optional().describe("YYYY-MM-DD it would go on, if the request was for a day."),
  time: z.string().optional().describe("HH:MM it would start, if you're suggesting a time."),
});

export type Option = z.infer<typeof OptionSchema>;

export function buildTools(ctx: ToolContext) {
  return {
    add_items: tool({
      description: "Add things to the trip: activities, meals, stays, transport, flights, or ideas with no day. Applies at once; the person can undo.",
      inputSchema: z.object({ items: z.array(NewItem).min(1).max(12) }),
      execute: async ({ items }): Promise<ChangeResult> => {
        const trip = await ctx.trip();
        const createdItems = items.map((i) => toItem(i, trip, ctx.me));
        const ops: Op[] = createdItems.map((item) => ({ op: "item.add" as const, item }));
        let minStart = trip.startDate;
        let maxEnd = trip.endDate;
        for (const item of createdItems) {
          if (item.start?.date) {
            if (item.start.date < minStart) minStart = item.start.date;
            if (item.start.date > maxEnd) maxEnd = item.start.date;
          }
          if (item.end?.date) {
            if (item.end.date < minStart) minStart = item.end.date;
            if (item.end.date > maxEnd) maxEnd = item.end.date;
          }
        }
        if (minStart !== trip.startDate) ops.push({ op: "trip.update", set: { startDate: minStart } });
        if (maxEnd !== trip.endDate) ops.push({ op: "trip.update", set: { endDate: maxEnd } });
        return applyOrConfirm(ctx, ops);
      },
    }),
    update_items: tool({
      description: "Change existing items by id: times, place, contact, booking, notes, links. Only give the fields that change. Moving a booked item's dates comes back as a card for the person to confirm.",
      inputSchema: z.object({ updates: z.array(ItemUpdate).min(1).max(12) }),
      execute: async ({ updates }): Promise<ChangeResult> => {
        const trip = await ctx.trip();
        const ops: Op[] = [];
        for (const u of updates) {
          const item = trip.items.find((i) => i.id === u.id);
          if (!item) return { ok: false, error: `No item with id "${u.id}".` };
          ops.push(...toUpdateOps(u, item, trip, ctx.me));
        }
        return applyOrConfirm(ctx, ops);
      },
    }),
    remove_items: tool({
      description: "Propose removing items by id. Never removes anything by itself: the person sees a card and confirms.",
      inputSchema: z.object({ ids: z.array(z.string()).min(1).max(12) }),
      execute: async ({ ids }): Promise<ChangeResult> => {
        const trip = await ctx.trip();
        const missing = ids.filter((id) => !trip.items.some((i) => i.id === id));
        if (missing.length) return { ok: false, error: `No items with ids ${missing.join(", ")}.` };
        return applyOrConfirm(
          ctx,
          ids.map((id) => ({ op: "item.remove" as const, id })),
          true,
        );
      },
    }),
    add_todos: tool({
      description: "Add to the group's to-do list (things to do before or during the trip that aren't on a day).",
      inputSchema: z.object({ todos: z.array(z.object({ text: z.string().min(1).max(300), itemId: z.string().optional(), who: z.string().optional() })).min(1).max(20) }),
      execute: async ({ todos }): Promise<ChangeResult> => {
        const trip = await ctx.trip();
        const ids = new Set(trip.items.map((i) => i.id));
        return applyOrConfirm(
          ctx,
          todos.map((t) => ({
            op: "todo.add" as const,
            todo: {
              id: newId("t"),
              text: t.text.trim(),
              done: false,
              ...(t.itemId && ids.has(t.itemId) ? { itemId: t.itemId } : {}),
              ...(clean(t.who) ? { who: clean(t.who) } : {}),
            },
          })),
        );
      },
    }),
    add_expenses: tool({
      description:
        "Log what someone in the group paid, to split it: a dinner, a taxi, park fees, a booking that's been paid. Equal among everyone unless told otherwise. Applies at once; the person can undo. Not for prices that are only planned.",
      inputSchema: z.object({ expenses: z.array(NewExpense).min(1).max(12) }),
      execute: async ({ expenses }): Promise<ChangeResult> => {
        const trip = await ctx.trip();
        const rates = await (ctx.rates ?? getRates)().catch(() => null);
        const ops: Op[] = [];
        for (const e of expenses) {
          const made = toExpense(e, trip, ctx.me, rates);
          if ("error" in made) return { ok: false, error: made.error };
          ops.push({ op: "expense.add", expense: made });
        }
        return applyOrConfirm(ctx, ops);
      },
    }),
    show_options: tool({
      description:
        "Show 2 to 4 real options (restaurants, activities, places to stay, operators) as cards the person can add with one tap. Use after looking them up on Google Maps or Search. Doesn't change the trip.",
      inputSchema: z.object({ heading: z.string().max(120), options: z.array(OptionSchema).min(1).max(6) }),
      execute: async ({ options }) => ({ shown: options.length }),
    }),
    ask_user: tool({
      description: "Ask one short question with 2 to 4 short answers to tap, when the request is ambiguous.",
      inputSchema: z.object({ question: z.string(), options: z.array(z.string()).min(2).max(4) }),
      outputSchema: z.string(),
    }),
  };
}

export type AssistantTools = ReturnType<typeof buildTools>;
