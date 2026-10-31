import { z } from "zod";
import { formatMinor, toMinor } from "./money";
import { isDate, isTime, isZone } from "./time";

/*
 * Schemas for everything stored, and for the ops that change it. The same
 * schemas check a manual edit, an offline edit replayed later and anything
 * the assistant proposes.
 */

export const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "Lowercase letters, digits, dashes and underscores");

/** First names only: one word. */
export const FirstName = z
  .string()
  .trim()
  .regex(/^\p{L}[\p{L}'-]{0,29}$/u, "First name only, one word");

const DateStr = z.string().refine(isDate, 'Use a date like "2026-11-28"');
const TimeStr = z.string().refine(isTime, 'Use a 24-hour time like "14:30"');
const Zone = z.string().max(64).refine(isZone, "Unknown time zone");
const Currency = z.string().regex(/^[A-Z]{3}$/, 'A 3-letter currency code like "USD"');
const Url = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => {
    try {
      const p = new URL(u).protocol;
      return p === "https:" || p === "http:";
    } catch {
      return false;
    }
  }, "A web link starting with https://");
const Short = z.string().trim().min(1).max(200);
const Text = z.string().trim().max(5000);
const Line = z.string().trim().max(300);

export const WhenSchema = z.object({ date: DateStr, time: TimeStr.optional(), tz: Zone.optional() }).strict();

export const PlaceSchema = z
  .object({
    name: Line.optional(),
    address: Line.optional(),
    mapsUrl: Url.optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict();

export const MoneySchema = z.object({ amount: z.number().nonnegative().max(10_000_000), currency: Currency }).strict();

export const BookingSchema = z
  .object({
    state: z.enum(["todo", "booked"]),
    confirmation: z.string().trim().max(100).optional(),
    url: Url.optional(),
    price: MoneySchema.optional(),
    by: FirstName.optional(),
    note: Line.optional(),
  })
  .strict();

export const ContactSchema = z
  .object({
    phone: z.string().trim().max(40).optional(),
    whatsapp: z.string().trim().max(40).optional(),
    email: z.string().trim().max(200).optional(),
    website: Url.optional(),
    instagram: z.string().trim().max(100).optional(),
  })
  .strict();

export const LinkKindSchema = z.enum(["booking", "website", "maps", "tiktok", "instagram", "youtube", "article", "other"]);

export const LinkSchema = z
  .object({
    id: Id,
    url: Url,
    kind: LinkKindSchema,
    title: Line.optional(),
    image: Url.optional(),
    site: z.string().trim().max(100).optional(),
    addedBy: FirstName.optional(),
    addedAt: z.number().int().nonnegative(),
  })
  .strict();

export const CheckItemSchema = z.object({ id: Id, text: Line.min(1), done: z.boolean() }).strict();

export const VoteSchema = z.enum(["in", "maybe", "out"]);

export const ReactionSchema = z.object({ by: FirstName, vote: VoteSchema.optional(), heart: z.literal(true).optional() }).strict();

const Epoch = z.number().int().nonnegative();
export const CommentText = z.string().trim().max(2000);

/** A deleted comment keeps its place with no words; any other comment has some. */
export const CommentSchema = z
  .object({
    id: Id,
    by: FirstName,
    text: CommentText,
    at: Epoch,
    editedAt: Epoch.optional(),
    deletedAt: Epoch.optional(),
    viaAssistant: z.literal(true).optional(),
  })
  .strict()
  .refine((c) => (c.deletedAt === undefined ? c.text.length > 0 : c.text === ""), "A comment needs some words; a deleted one has none");

export const ItemKindSchema = z.enum(["stay", "flight", "transport", "activity", "food", "other"]);

export const ItemSchema = z
  .object({
    id: Id,
    kind: ItemKindSchema,
    title: Short,
    start: WhenSchema.nullable().optional(),
    end: WhenSchema.nullable().optional(),
    place: PlaceSchema.optional(),
    booking: BookingSchema.optional(),
    contact: ContactSchema.optional(),
    links: z.array(LinkSchema).max(50).optional(),
    notes: Text.optional(),
    checklist: z.array(CheckItemSchema).max(100).optional(),
    who: FirstName.optional(),
    maybe: z.boolean().optional(),
    sleepsHere: z.boolean().optional(),
    peakM: z.number().int().positive().max(9000).optional(),
    reactions: z.array(ReactionSchema).max(60).optional(),
    comments: z.array(CommentSchema).max(300).optional(),
  })
  .strict();

export const TodoSchema = z
  .object({
    id: Id,
    text: Line.min(1),
    done: z.boolean(),
    who: FirstName.optional(),
    itemId: Id.optional(),
    note: Line.optional(),
  })
  .strict();

const MAX_AMOUNT = 10_000_000;

const unique = (names: string[]) => new Set(names.map((n) => n.toLowerCase())).size === names.length;

export const SplitSchema = z
  .discriminatedUnion("how", [
    z.object({ how: z.literal("equal"), among: z.array(FirstName).min(1).max(30) }).strict(),
    z.object({ how: z.literal("shares"), among: z.array(z.object({ name: FirstName, shares: z.number().positive().max(1000) }).strict()).min(1).max(30) }).strict(),
    z.object({ how: z.literal("exact"), among: z.array(z.object({ name: FirstName, amount: z.number().nonnegative().max(MAX_AMOUNT) }).strict()).min(1).max(30) }).strict(),
  ])
  .refine((s) => unique(s.how === "equal" ? s.among : s.among.map((p) => p.name)), "Each person once in a split");

export const FxSchema = z.object({ to: Currency, rate: z.number().positive().max(1e9), on: DateStr }).strict();

const ExpenseFields = {
  title: Short,
  amount: z.number().positive("More than zero").max(MAX_AMOUNT),
  currency: Currency,
  paidBy: FirstName,
  split: SplitSchema,
  date: DateStr,
};

/** Set amounts must add up to the total, to the cent. */
function splitAddsUp(e: { amount: number; currency: string; split: z.infer<typeof SplitSchema> }, ctx: z.RefinementCtx) {
  if (e.split.how !== "exact") return;
  const sum = e.split.among.reduce((s, p) => s + toMinor(p.amount, e.currency), 0);
  const total = toMinor(e.amount, e.currency);
  if (sum !== total) ctx.addIssue({ code: "custom", path: ["split"], message: `The split adds up to ${formatMinor(sum, e.currency)}, not ${formatMinor(total, e.currency)}` });
}

export const ExpenseSchema = z
  .object({
    id: Id,
    ...ExpenseFields,
    itemId: Id.optional(),
    note: Line.optional(),
    fx: FxSchema.optional(),
    settlement: z.literal(true).optional(),
    addedBy: FirstName.optional(),
    addedAt: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine(splitAddsUp);

export const PackCategorySchema = z.enum(["documents", "clothes", "toiletries", "health", "tech", "gear", "snacks", "other"]);

const Quantity = z.number().int().min(1).max(99);

export const PackEntrySchema = z
  .object({
    id: Id,
    text: Line.min(1),
    kind: z.enum(["shared", "personal"]),
    owner: FirstName.optional(),
    assignee: FirstName.optional(),
    quantity: Quantity.optional(),
    packedBy: z.array(FirstName).max(30).optional(),
    itemId: Id.optional(),
    category: PackCategorySchema.optional(),
  })
  .strict();

export const TripSchema = z
  .object({
    schema: z.literal(2),
    id: Id,
    name: Short,
    destination: Short,
    startDate: DateStr,
    endDate: DateStr,
    tz: Zone,
    homeTz: Zone.optional(),
    currency: Currency,
    homeCurrency: Currency.optional(),
    people: z.array(FirstName).max(30),
    cover: Url.or(z.string().regex(/^\/[\w./-]+$/)).optional(),
    notes: Text.optional(),
    items: z.array(ItemSchema).max(500),
    todos: z.array(TodoSchema).max(300),
    expenses: z.array(ExpenseSchema).max(1000).optional(),
    packing: z.array(PackEntrySchema).max(500).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Patches: null removes a field.

/* Nested details (place, contact, booking) merge one level deep: only the keys given change. */

export const PlacePatch = z
  .object({
    name: Line.nullable(),
    address: Line.nullable(),
    mapsUrl: Url.nullable(),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
  })
  .partial()
  .strict();

export const ContactPatch = z
  .object({
    phone: z.string().trim().max(40).nullable(),
    whatsapp: z.string().trim().max(40).nullable(),
    email: z.string().trim().max(200).nullable(),
    website: Url.nullable(),
    instagram: z.string().trim().max(100).nullable(),
  })
  .partial()
  .strict();

export const BookingPatch = z
  .object({
    state: z.enum(["todo", "booked"]),
    confirmation: z.string().trim().max(100).nullable(),
    url: Url.nullable(),
    price: MoneySchema.nullable(),
    by: FirstName.nullable(),
    note: Line.nullable(),
  })
  .partial()
  .strict();

export const ItemPatch = z
  .object({
    kind: ItemKindSchema,
    title: Short,
    start: WhenSchema.nullable(),
    end: WhenSchema.nullable(),
    place: PlacePatch.nullable(),
    booking: BookingPatch.nullable(),
    contact: ContactPatch.nullable(),
    notes: Text.nullable(),
    who: FirstName.nullable(),
    maybe: z.boolean().nullable(),
    sleepsHere: z.boolean().nullable(),
    peakM: z.number().int().positive().max(9000).nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

export const TodoPatch = z
  .object({ text: Line.min(1), done: z.boolean(), who: FirstName.nullable(), itemId: Id.nullable(), note: Line.nullable() })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

/** Moving an entry between the shared list and someone's own sets kind, owner, assignee and packedBy together. */
export const PackPatch = z
  .object({
    text: Line.min(1),
    kind: z.enum(["shared", "personal"]),
    owner: FirstName.nullable(),
    assignee: FirstName.nullable(),
    quantity: Quantity.nullable(),
    packedBy: z.array(FirstName).max(30).nullable(),
    itemId: Id.nullable(),
    category: PackCategorySchema.nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

export const TripPatch = z
  .object({
    name: Short,
    destination: Short,
    startDate: DateStr,
    endDate: DateStr,
    tz: Zone,
    homeTz: Zone.nullable(),
    currency: Currency,
    homeCurrency: Currency.nullable(),
    people: z.array(FirstName).max(30),
    cover: z.string().max(2000).nullable(),
    notes: Text.nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

/* The split is replaced whole, never merged: "equal among three" and "Ana's exact Q300" don't mix. */
export const ExpensePatch = z
  .object({ ...ExpenseFields, itemId: Id.nullable(), note: Line.nullable(), fx: FxSchema.nullable() })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

/* Editing sets text and editedAt; deleting sets deletedAt and empties the text. */
export const CommentPatch = z
  .object({ text: CommentText, editedAt: Epoch.nullable(), deletedAt: Epoch.nullable() })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

// ---------------------------------------------------------------------------
// Ops

const index = z.number().int().nonnegative().optional();

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("item.add"), item: ItemSchema, index }).strict(),
  z.object({ op: z.literal("item.update"), id: Id, set: ItemPatch }).strict(),
  z.object({ op: z.literal("item.remove"), id: Id }).strict(),
  z.object({ op: z.literal("link.add"), itemId: Id, link: LinkSchema, index }).strict(),
  z.object({ op: z.literal("link.update"), itemId: Id, linkId: Id, set: z.object({ title: Line.nullable(), image: Url.nullable(), kind: LinkKindSchema }).partial().strict() }).strict(),
  z.object({ op: z.literal("link.remove"), itemId: Id, linkId: Id }).strict(),
  z.object({ op: z.literal("check.add"), itemId: Id, check: CheckItemSchema, index }).strict(),
  z.object({ op: z.literal("check.set"), itemId: Id, checkId: Id, text: Line.min(1).optional(), done: z.boolean().optional() }).strict(),
  z.object({ op: z.literal("check.remove"), itemId: Id, checkId: Id }).strict(),
  z.object({ op: z.literal("todo.add"), todo: TodoSchema, index }).strict(),
  z.object({ op: z.literal("todo.update"), id: Id, set: TodoPatch }).strict(),
  z.object({ op: z.literal("todo.remove"), id: Id }).strict(),
  z.object({ op: z.literal("pack.add"), entry: PackEntrySchema, index }).strict(),
  z.object({ op: z.literal("pack.update"), id: Id, set: PackPatch }).strict(),
  // "I'll bring it" (who) or "Not me" (null). Refused if someone else already said they'd bring it.
  z.object({ op: z.literal("pack.claim"), id: Id, who: FirstName.nullable() }).strict(),
  // One person's tick, so two people packing at once don't overwrite each other.
  z.object({ op: z.literal("pack.check"), id: Id, who: FirstName, packed: z.boolean() }).strict(),
  z.object({ op: z.literal("pack.remove"), id: Id }).strict(),
  z.object({ op: z.literal("trip.update"), set: TripPatch }).strict(),
  z.object({ op: z.literal("expense.add"), expense: ExpenseSchema, index }).strict(),
  z.object({ op: z.literal("expense.update"), id: Id, set: ExpensePatch }).strict(),
  z.object({ op: z.literal("expense.remove"), id: Id }).strict(),
  // Votes and comments: each person changes only their own (see discuss.ts).
  z.object({ op: z.literal("reaction.set"), itemId: Id, by: FirstName, vote: VoteSchema.nullable().optional(), heart: z.boolean().optional() }).strict(),
  z.object({ op: z.literal("comment.add"), itemId: Id, comment: CommentSchema, index }).strict(),
  z.object({ op: z.literal("comment.update"), itemId: Id, commentId: Id, set: CommentPatch }).strict(),
  z.object({ op: z.literal("comment.remove"), itemId: Id, commentId: Id }).strict(),
]);

export type Op = z.infer<typeof OpSchema>;
export type ItemPatchT = z.infer<typeof ItemPatch>;
export type ExpensePatchT = z.infer<typeof ExpensePatch>;
