import "server-only";
import { prepareChange, type ChangeEntry, type ChangeMeta, type OpIssue } from "@/domain/change";
import { isV1, upgradeTrip } from "@/domain/migrate";
import type { Item, Trip, TripState } from "@/domain/types";
import { seedTrip, SEED_TRIP_ID } from "./seed";

/*
 * Every trip read and write goes through TripStore. The backend is Redis in
 * production and a Map in tests and local dev; the rules live here once.
 *
 * Writes rebase: ops address things by id, so they're applied to whatever
 * is stored now, not to the version the person was looking at. A write only
 * fails if what it touches is gone or the result doesn't validate.
 */

export const HISTORY_LIMIT = 200;
export const RECEIPT_DRAFT_SECONDS = 7 * 24 * 60 * 60;
export const RECEIPT_UNDO_SECONDS = 30 * 24 * 60 * 60;

const receiptKey = (tripId: string, receiptId: string) => `receipt:${tripId}:${receiptId}`;

export interface TripSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cover?: string;
}

export interface BookingImportResult {
  added: number;
  skipped: number;
  replayed?: boolean;
}

type CasResult = boolean | "missing_receipt";

interface CasOptions {
  receipts?: { attach: string[]; detach: string[] };
  /** A provider delivery is complete exactly when its itinerary change is durable. */
  completion?: { key: string; value: string };
}

/** The few storage primitives TripStore needs. */
export interface Backend {
  read(id: string): Promise<{ state: string; version: number } | null>;
  /** Writes state and log entry only if the version is still `expected`. Returns false if someone wrote first. */
  cas(id: string, expected: number, state: string, entry: string, logLimit: number, options?: CasOptions): Promise<CasResult>;
  /** Writes a trip only if none exists under the id. */
  init(id: string, state: string): Promise<boolean>;
  log(id: string, limit: number): Promise<string[]>;
  getPass(id: string): Promise<string | null>;
  /** Sets the passcode hash only if there is none yet. */
  claimPass(id: string, hash: string): Promise<boolean>;
  setPass(id: string, hash: string): Promise<void>;
  index(): Promise<Record<string, string>>;
  putIndex(id: string, summary: string): Promise<void>;
  accountTrips(accountId: string): Promise<Record<string, string>>;
  tripAccounts(tripId: string): Promise<Record<string, string>>;
  rememberTrip(accountId: string, tripId: string, name: string): Promise<void>;
  getPlanner(accountId: string): Promise<string | null>;
  setPlanner(accountId: string, snapshot: string): Promise<void>;
  getPreview(id: string): Promise<string | null>;
  claimPreview(id: string, token: string): Promise<boolean>;
  disablePreview(id: string): Promise<void>;
  /** Increments a counter that expires after `ttlSeconds`; returns the new count. */
  hit(key: string, ttlSeconds: number): Promise<number>;
  /** A counter's current value (0 when unset or expired). */
  count(key: string): Promise<number>;
  /** A small cached value (photo lookups, geocoder answers), or null when unset or expired. */
  getCache(key: string): Promise<string | null>;
  setCache(key: string, value: string, ttlSeconds: number): Promise<void>;
  getDocument(key: string): Promise<string | null>;
  /** Immutable, first writer wins. */
  putDocument(key: string, value: string): Promise<void>;
  /** Stage an upload for a limited time. A saved photo stays persistent on re-upload. */
  stageReceipt(key: string, base64: string): Promise<void>;
  /** The Google account that created the trip, if one did. */
  owner(id: string): Promise<string | null>;
  setOwner(id: string, accountId: string): Promise<void>;
  /** The v1 trip, if the old single-trip keys exist. */
  legacy(): Promise<string | null>;
}

export type ApplyResult =
  | { ok: true; state: TripState; entry: ChangeEntry; replayed?: boolean }
  | { ok: false; reason: "invalid"; issues: OpIssue[]; state: TripState }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "busy" };

const parse = <T>(raw: unknown): T => (typeof raw === "string" ? JSON.parse(raw) : raw) as T;

const summaryOf = (t: Trip): TripSummary => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, ...(t.cover ? { cover: t.cover } : {}) });

/** Diff the distinct references so a shared photo stays saved until the last expense releases it. */
function receiptChanges(before: Trip, after: Trip): CasOptions["receipts"] {
  if (before.expenses === after.expenses) return undefined;
  const keys = (trip: Trip) => new Set((trip.expenses ?? []).flatMap((e) => e.receiptId ? [receiptKey(trip.id, e.receiptId)] : []));
  const previous = keys(before);
  const current = keys(after);
  return {
    attach: [...current].filter((key) => !previous.has(key)),
    detach: [...previous].filter((key) => !current.has(key)),
  };
}

export class TripStore {
  constructor(private db: Backend) {}

  /** The current trip, or null. The original trip is created from the old store or the seed the first time it's asked for. */
  async get(id: string): Promise<TripState | null> {
    let row = await this.db.read(id);
    if (!row && id === SEED_TRIP_ID) {
      const legacy = await this.db.legacy();
      const v1 = legacy ? parse<unknown>(legacy) : null;
      const trip = v1 && isV1(v1) ? seedTrip(id, v1) : seedTrip(id);
      if (await this.db.init(id, JSON.stringify(trip))) await this.db.putIndex(id, JSON.stringify(summaryOf(trip)));
      row = await this.db.read(id);
    }
    if (!row) return null;
    return { trip: upgradeTrip(parse<Trip>(row.state)), version: row.version };
  }

  /** `owner`: the Google account creating it, which may later change the passcode without knowing it. */
  async create(trip: Trip, passHash: string, owner?: string): Promise<boolean> {
    if (!(await this.db.init(trip.id, JSON.stringify(trip)))) return false;
    await this.db.setPass(trip.id, passHash);
    if (owner) await this.db.setOwner(trip.id, owner);
    await this.db.putIndex(trip.id, JSON.stringify(summaryOf(trip)));
    return true;
  }

  async list(ids?: string[]): Promise<TripSummary[]> {
    const all = await this.db.index();
    return Object.values(all)
      .map((s) => parse<TripSummary>(s))
      .filter((s) => !ids || ids.includes(s.id))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  /** Applies ops to the latest stored trip, retrying if another write lands in between. */
  async apply(id: string, ops: unknown, meta: ChangeMeta): Promise<ApplyResult> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const state = await this.get(id);
      if (!state) return { ok: false, reason: "not_found" };
      if (meta.key) {
        // A resend (double tap, offline outbox retry): hand back the first result instead of applying twice.
        const earlier = (await this.history(id, 30)).find((e) => e.key === meta.key);
        if (earlier) return { ok: true, state, entry: earlier, replayed: true };
      }
      const prepared = prepareChange(state, ops, meta);
      if (!prepared.ok) return { ok: false, reason: "invalid", issues: prepared.issues, state };
      const written = await this.db.cas(id, state.version, JSON.stringify(prepared.trip), JSON.stringify(prepared.entry), HISTORY_LIMIT, {
        receipts: receiptChanges(state.trip, prepared.trip),
      });
      if (written === "missing_receipt") return {
        ok: false, reason: "invalid", state,
        issues: [{ index: -1, code: "missing", message: "The receipt photo is no longer available. Upload it again before saving the expense." }],
      };
      if (written) {
        const before = state.trip;
        const t = prepared.trip;
        if (t.name !== before.name || t.startDate !== before.startDate || t.endDate !== before.endDate || t.cover !== before.cover) {
          await this.db.putIndex(id, JSON.stringify(summaryOf(t)));
        }
        return { ok: true, state: { trip: t, version: prepared.entry.version }, entry: prepared.entry };
      }
    }
    return { ok: false, reason: "busy" };
  }

  /** Recheck reservations against the same trip version the import will write. */
  async applyBookingImport(id: string, completionKey: string, items: Item[], author: string, matches: (a: Item, b: Item) => boolean): Promise<BookingImportResult> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const previous = await this.getDocument(completionKey);
      if (previous) return { ...parse<BookingImportResult>(previous), replayed: true };
      const state = await this.get(id);
      if (!state) throw new Error("Trip no longer exists.");
      const seen = [...state.trip.items];
      const fresh = items.filter((item) => {
        if (seen.some((existing) => existing.id === item.id || matches(existing, item))) return false;
        seen.push(item);
        return true;
      });
      const outcome = { added: fresh.length, skipped: items.length - fresh.length };
      if (!fresh.length) {
        await this.putDocument(completionKey, JSON.stringify(outcome));
        return parse<BookingImportResult>(await this.getDocument(completionKey));
      }
      const prepared = prepareChange(state, fresh.map((item) => ({ op: "item.add", item })), { author });
      if (!prepared.ok) throw new Error("Could not apply the booking details.");
      const saved = await this.db.cas(id, state.version, JSON.stringify(prepared.trip), JSON.stringify(prepared.entry), HISTORY_LIMIT, {
        completion: { key: completionKey, value: JSON.stringify(outcome) },
      });
      if (saved === true) return outcome;
    }
    throw new Error("Trip was being edited. Retry the email import.");
  }

  /** Undoes one change by applying its inverse to the latest trip. A person asked, so booked items need no extra confirmation. */
  async undo(id: string, entryId: string, author: string): Promise<ApplyResult | { ok: false; reason: "no_entry" }> {
    const entry = (await this.history(id)).find((e) => e.id === entryId);
    if (!entry) return { ok: false, reason: "no_entry" };
    return this.apply(id, entry.inverse, { author, undoOf: entry.id, confirmed: true });
  }

  async history(id: string, limit = HISTORY_LIMIT): Promise<ChangeEntry[]> {
    return (await this.db.log(id, Math.min(limit, HISTORY_LIMIT))).map((r) => parse<ChangeEntry>(r));
  }

  getPass(id: string) {
    return this.db.getPass(id);
  }
  claimPass(id: string, hash: string) {
    return this.db.claimPass(id, hash);
  }
  setPass(id: string, hash: string) {
    return this.db.setPass(id, hash);
  }
  hit(key: string, ttlSeconds: number) {
    return this.db.hit(key, ttlSeconds);
  }
  count(key: string) {
    return this.db.count(key);
  }
  getCache(key: string) { return this.db.getCache(key); }
  setCache(key: string, value: string, ttlSeconds: number) { return this.db.setCache(key, value, ttlSeconds); }
  getDocument(key: string) { return this.db.getDocument(key); }
  putDocument(key: string, value: string) { return this.db.putDocument(key, value); }
  stageReceipt(tripId: string, receiptId: string, base64: string) {
    return this.db.stageReceipt(receiptKey(tripId, receiptId), base64);
  }
  getReceipt(tripId: string, receiptId: string) {
    return this.db.getDocument(receiptKey(tripId, receiptId));
  }
  owner(id: string) { return this.db.owner(id); }
  accountTrips(accountId: string) { return this.db.accountTrips(accountId); }
  tripAccounts(tripId: string) { return this.db.tripAccounts(tripId); }
  rememberTrip(accountId: string, tripId: string, name: string) { return this.db.rememberTrip(accountId, tripId, name); }
  getPlanner(accountId: string) { return this.db.getPlanner(accountId); }
  setPlanner(accountId: string, snapshot: string) { return this.db.setPlanner(accountId, snapshot); }
  getPreview(id: string) { return this.db.getPreview(id); }
  claimPreview(id: string, token: string) { return this.db.claimPreview(id, token); }
  disablePreview(id: string) { return this.db.disablePreview(id); }
}

// ---------------------------------------------------------------------------
// Backends

export class MemoryBackend implements Backend {
  private states = new Map<string, { state: string; version: number }>();
  private logs = new Map<string, string[]>();
  private passes = new Map<string, string>();
  private idx = new Map<string, string>();
  private accounts = new Map<string, Record<string, string>>();
  private tripMembers = new Map<string, Record<string, string>>();
  private planners = new Map<string, string>();
  private previews = new Map<string, string>();
  private counters = new Map<string, { n: number; until: number }>();
  private kv = new Map<string, { value: string; until: number }>();
  private documents = new Map<string, string>();
  private receiptExpirations = new Map<string, number>();
  private owners = new Map<string, string>();

  constructor(private legacyTrip: string | null = null) {}

  async read(id: string) {
    return this.states.get(id) ?? null;
  }
  async cas(id: string, expected: number, state: string, entry: string, logLimit: number, options?: CasOptions): Promise<CasResult> {
    const cur = this.states.get(id);
    if (!cur || cur.version !== expected) return false;
    const completion = options?.completion;
    if (completion && this.documents.has(completion.key)) return false;
    const receipts = options?.receipts;
    if (receipts) {
      this.expireReceipts();
      if (receipts.attach.some((key) => !this.documents.has(key))) return "missing_receipt";
      for (const key of receipts.attach) this.receiptExpirations.delete(key);
      for (const key of receipts.detach) this.receiptExpirations.set(key, Date.now() + RECEIPT_UNDO_SECONDS * 1000);
    }
    if (completion) this.documents.set(completion.key, completion.value);
    this.states.set(id, { state, version: expected + 1 });
    const log = [entry, ...(this.logs.get(id) ?? [])].slice(0, logLimit);
    this.logs.set(id, log);
    return true;
  }
  async init(id: string, state: string) {
    if (this.states.has(id)) return false;
    this.states.set(id, { state, version: 1 });
    return true;
  }
  async log(id: string, limit: number) {
    return (this.logs.get(id) ?? []).slice(0, limit);
  }
  async getPass(id: string) {
    return this.passes.get(id) ?? null;
  }
  async claimPass(id: string, hash: string) {
    if (this.passes.has(id)) return false;
    this.passes.set(id, hash);
    return true;
  }
  async setPass(id: string, hash: string) {
    this.passes.set(id, hash);
  }
  async index() {
    return Object.fromEntries(this.idx);
  }
  async putIndex(id: string, summary: string) {
    this.idx.set(id, summary);
  }
  async accountTrips(accountId: string) { return { ...this.accounts.get(accountId) }; }
  async tripAccounts(tripId: string) { return { ...this.tripMembers.get(tripId) }; }
  async getPlanner(accountId: string) { return this.planners.get(accountId) ?? null; }
  async setPlanner(accountId: string, snapshot: string) { this.planners.set(accountId, snapshot); }
  async getPreview(id: string) { return this.previews.get(id) ?? null; }
  async claimPreview(id: string, token: string) {
    if (this.previews.has(id)) return false;
    this.previews.set(id, token);
    return true;
  }
  async disablePreview(id: string) { this.previews.delete(id); }
  async rememberTrip(accountId: string, tripId: string, name: string) {
    this.accounts.set(accountId, { ...this.accounts.get(accountId), [tripId]: name });
    this.tripMembers.set(tripId, { ...this.tripMembers.get(tripId), [name]: accountId });
  }
  async hit(key: string, ttlSeconds: number) {
    const now = Date.now();
    const c = this.counters.get(key);
    const next = c && c.until > now ? { n: c.n + 1, until: c.until } : { n: 1, until: now + ttlSeconds * 1000 };
    this.counters.set(key, next);
    return next.n;
  }
  async count(key: string) {
    const c = this.counters.get(key);
    return c && c.until > Date.now() ? c.n : 0;
  }
  async getCache(key: string) {
    const c = this.kv.get(key);
    return c && c.until > Date.now() ? c.value : null;
  }
  async setCache(key: string, value: string, ttlSeconds: number) {
    this.kv.set(key, { value, until: Date.now() + ttlSeconds * 1000 });
  }
  private expireReceipts() {
    const now = Date.now();
    for (const [key, until] of this.receiptExpirations) {
      if (until > now) continue;
      this.receiptExpirations.delete(key);
      this.documents.delete(key);
    }
  }
  async stageReceipt(key: string, base64: string) {
    this.expireReceipts();
    if (this.documents.has(key) && !this.receiptExpirations.has(key)) return;
    this.documents.set(key, base64);
    this.receiptExpirations.set(key, Math.max(this.receiptExpirations.get(key) ?? 0, Date.now() + RECEIPT_DRAFT_SECONDS * 1000));
  }
  async getDocument(key: string) {
    if (this.receiptExpirations.has(key)) this.expireReceipts();
    return this.documents.get(key) ?? null;
  }
  async putDocument(key: string, value: string) { if (!this.documents.has(key)) this.documents.set(key, value); }
  async owner(id: string) { return this.owners.get(id) ?? null; }
  async setOwner(id: string, accountId: string) { this.owners.set(id, accountId); }
  async legacy() {
    return this.legacyTrip;
  }
}

/** The subset of the @upstash/redis client used here. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { nx?: true; ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  hgetall(key: string): Promise<Record<string, string> | string[] | null>;
  hset(key: string, values: Record<string, string>): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

const k = (id: string) => ({ state: `t:${id}:state`, version: `t:${id}:version`, log: `t:${id}:log`, pass: `t:${id}:pass`, owner: `t:${id}:owner` });

/** Disabling SDK deserialization also disables HGETALL's object conversion.
 * Decode its alternating fields/values without parsing names or JSON twice. */
function redisHash(raw: Record<string, string> | string[] | null): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    if (raw.length % 2) throw new Error("Invalid Redis hash response: missing value");
    return Object.fromEntries(Array.from({ length: raw.length / 2 }, (_, i) => [raw[i * 2], raw[i * 2 + 1]]));
  }
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
}

/** First four keys: state, version, log, optional import completion. Remaining keys
 * are receipt documents to attach, then to release. Validate before any writes. */
const CAS = `
local current = redis.call('GET', KEYS[2])
if current ~= ARGV[1] then return 0 end
if ARGV[5] ~= '' and redis.call('EXISTS', KEYS[4]) == 1 then return 0 end
local last_attach = 4 + tonumber(ARGV[6])
for i = 5, last_attach do
  if redis.call('EXISTS', KEYS[i]) == 0 then return -1 end
end
for i = 5, last_attach do redis.call('PERSIST', KEYS[i]) end
for i = last_attach + 1, #KEYS do redis.call('EXPIRE', KEYS[i], ARGV[7]) end
if ARGV[5] ~= '' then redis.call('SET', KEYS[4], ARGV[5]) end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(tonumber(ARGV[1]) + 1))
redis.call('LPUSH', KEYS[3], ARGV[3])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[4]) - 1)
return 1
`;

/** KEYS: state, version. ARGV: state. */
const INIT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], '1')
return 1
`;

/** KEYS: counter. ARGV: ttl seconds. */
const HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return n
`;

const STAGE_RECEIPT = `
local ttl = redis.call('TTL', KEYS[1])
if ttl == -2 then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
elseif ttl >= 0 and ttl < tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 1
`;

export class RedisBackend implements Backend {
  constructor(private redis: RedisLike) {}

  async read(id: string) {
    const [state, version] = await this.redis.mget(k(id).state, k(id).version);
    return state === null || version === null ? null : { state: typeof state === "string" ? state : JSON.stringify(state), version: Number(version) };
  }
  async cas(id: string, expected: number, state: string, entry: string, logLimit: number, options?: CasOptions): Promise<CasResult> {
    const keys = k(id);
    const completion = options?.completion;
    const casKeys = [keys.state, keys.version, keys.log, completion ? `document:${completion.key}` : keys.state];
    const attach = options?.receipts?.attach ?? [];
    const detach = options?.receipts?.detach ?? [];
    casKeys.push(...[...attach, ...detach].map((key) => `document:${key}`));
    const args = [String(expected), state, entry, String(logLimit), completion?.value ?? "", String(attach.length), String(RECEIPT_UNDO_SECONDS)];
    const result = Number(await this.redis.eval(CAS, casKeys, args));
    return result === -1 ? "missing_receipt" : result === 1;
  }
  async init(id: string, state: string) {
    return Number(await this.redis.eval(INIT, [k(id).state, k(id).version], [state])) === 1;
  }
  async log(id: string, limit: number) {
    const rows = await this.redis.lrange(k(id).log, 0, limit - 1);
    return rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r)));
  }
  async getPass(id: string) {
    return this.redis.get(k(id).pass);
  }
  async claimPass(id: string, hash: string) {
    return (await this.redis.set(k(id).pass, hash, { nx: true })) !== null;
  }
  async setPass(id: string, hash: string) {
    await this.redis.set(k(id).pass, hash);
  }
  async index() {
    return redisHash(await this.redis.hgetall("trips"));
  }
  async putIndex(id: string, summary: string) {
    await this.redis.hset("trips", { [id]: summary });
  }
  async accountTrips(accountId: string) { return redisHash(await this.redis.hgetall(`account:${accountId}:trips`)); }
  async tripAccounts(tripId: string) { return redisHash(await this.redis.hgetall(`trip:${tripId}:accounts`)); }
  async getPlanner(accountId: string) { return this.redis.get(`account:${accountId}:planner`); }
  async setPlanner(accountId: string, snapshot: string) { await this.redis.set(`account:${accountId}:planner`, snapshot); }
  async getPreview(id: string) { return this.redis.get(`t:${id}:preview`); }
  async claimPreview(id: string, token: string) { return (await this.redis.set(`t:${id}:preview`, token, { nx: true })) !== null; }
  async disablePreview(id: string) { await this.redis.del(`t:${id}:preview`); }
  async rememberTrip(accountId: string, tripId: string, name: string) {
    await this.redis.hset(`account:${accountId}:trips`, { [tripId]: name });
    await this.redis.hset(`trip:${tripId}:accounts`, { [name]: accountId });
  }
  async hit(key: string, ttlSeconds: number) {
    return Number(await this.redis.eval(HIT, [`rl:${key}`], [String(ttlSeconds)]));
  }
  async count(key: string) {
    return Number((await this.redis.get(`rl:${key}`)) ?? 0);
  }
  async getCache(key: string) {
    // Upstash decodes JSON-looking strings on read; hand back the text that was stored.
    const v = await this.redis.get(`cache:${key}`);
    return v === null ? null : typeof v === "string" ? v : JSON.stringify(v);
  }
  async setCache(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(`cache:${key}`, value, { ex: ttlSeconds });
  }
  async stageReceipt(key: string, base64: string) {
    // An existing durable key has TTL -1. Never shorten it or the undo grace period.
    await this.redis.eval(STAGE_RECEIPT, [`document:${key}`], [base64, String(RECEIPT_DRAFT_SECONDS)]);
  }
  async getDocument(key: string) { return this.redis.get(`document:${key}`); }
  async putDocument(key: string, value: string) { await this.redis.set(`document:${key}`, value, { nx: true }); }
  async owner(id: string) { return this.redis.get(k(id).owner); }
  async setOwner(id: string, accountId: string) { await this.redis.set(k(id).owner, accountId); }
  async legacy() {
    const v = await this.redis.get("trip:v1:state");
    return v === null ? null : typeof v === "string" ? v : JSON.stringify(v);
  }
}
