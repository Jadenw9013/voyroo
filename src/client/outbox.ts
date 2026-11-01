import type { Op } from "@/domain/ops";

/*
 * The rules for edits waiting on this phone, kept apart from React so they
 * can be tested. Edits go out oldest first. What happens to one depends on
 * the answer:
 *   - saved: it leaves the queue;
 *   - 428 (it touches something booked): it's held for a person to confirm;
 *   - any other 4xx (it can never apply as is): it's held, so a person can
 *     see it, try again or discard it, and the edits after it still go out;
 *   - 5xx and 429: it's retried later, waiting longer each time, and after
 *     MAX_TRIES it's held like a 4xx so it stops blocking the rest;
 *   - no answer (offline): it stays as it was.
 * Nothing is dropped without a person choosing to.
 */

export interface Pending {
  key: string;
  ops: Op[];
  confirmed?: boolean;
  /** Server errors so far. */
  tries?: number;
  /** Epoch ms before which it isn't sent again. */
  retryAt?: number;
  /** Not sent until a person decides: confirm it (or try again), or discard it. */
  held?: { reason: "confirm" | "failed"; error: string };
}

/** How one send went. "wait": no answer (offline, or already on its way); leave it and stop for now. */
export type Verdict = "saved" | "confirm" | "failed" | "retry" | "signin" | "wait";

export const MAX_TRIES = 6;
const FIRST_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;

/** 5 s, 10 s, 20 s… up to 5 minutes. */
export function retryDelay(tries: number): number {
  return Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** Math.max(0, tries - 1));
}

export function verdictFor(status: number): Verdict {
  if (status >= 200 && status < 300) return "saved";
  if (status === 401) return "signin";
  if (status === 428) return "confirm";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "failed";
}

/** The queue after an answer for `key`. */
export function settle(queue: Pending[], key: string, verdict: Verdict, error: string, now: number): Pending[] {
  return queue.flatMap((p): Pending[] => {
    if (p.key !== key) return [p];
    if (verdict === "saved") return [];
    if (verdict === "confirm") return [{ key: p.key, ops: p.ops, held: { reason: "confirm", error } }];
    if (verdict === "failed") return [{ key: p.key, ops: p.ops, ...(p.confirmed ? { confirmed: true } : {}), held: { reason: "failed", error } }];
    if (verdict === "retry") {
      const tries = (p.tries ?? 0) + 1;
      if (tries >= MAX_TRIES) return [{ key: p.key, ops: p.ops, ...(p.confirmed ? { confirmed: true } : {}), tries, held: { reason: "failed", error } }];
      return [{ ...p, tries, retryAt: now + retryDelay(tries) }];
    }
    return [p];
  });
}

/** A person decided about a held edit: send it (confirmed, if it needed that) or drop it. */
export function release(queue: Pending[], key: string, choice: "send" | "discard"): Pending[] {
  return queue.flatMap((p): Pending[] => {
    if (p.key !== key) return [p];
    if (choice === "discard") return [];
    const confirmed = p.confirmed || p.held?.reason === "confirm";
    return [{ key: p.key, ops: p.ops, ...(confirmed ? { confirmed: true } : {}) }];
  });
}

/** The next edit to send, or null. Held edits are skipped; one waiting out a retry stops the rest, so edits keep their order. */
export function nextToSend(queue: Pending[], now: number, tried: ReadonlySet<string> = new Set()): Pending | null {
  for (const p of queue) {
    if (p.held || tried.has(p.key)) continue;
    return p.retryAt && p.retryAt > now ? null : p;
  }
  return null;
}

/** When to look again for an edit waiting out a retry, or null. */
export function nextRetryAt(queue: Pending[]): number | null {
  const at = queue.filter((p) => !p.held && p.retryAt).map((p) => p.retryAt!);
  return at.length ? Math.min(...at) : null;
}

/**
 * Sends what's queued, oldest first, until it runs out or has to wait.
 * `send` makes one request and reports how it went; `update` changes the
 * queue. Returns the edits that became held, for telling the person.
 */
export async function drain(opts: {
  queue: () => Pending[];
  send: (p: Pending) => Promise<{ verdict: Verdict; error?: string }>;
  update: (fn: (q: Pending[]) => Pending[]) => void;
  now?: () => number;
}): Promise<Pending[]> {
  const now = opts.now ?? Date.now;
  const tried = new Set<string>();
  const held: Pending[] = [];
  for (;;) {
    const p = nextToSend(opts.queue(), now(), tried);
    if (!p) break;
    tried.add(p.key);
    const r = await opts.send(p);
    opts.update((q) => settle(q, p.key, r.verdict, r.error ?? "That didn't save.", now()));
    const after = opts.queue().find((x) => x.key === p.key);
    if (after?.held) held.push(after);
    if (r.verdict === "wait" || r.verdict === "signin" || (r.verdict === "retry" && !after?.held)) break;
  }
  return held;
}
