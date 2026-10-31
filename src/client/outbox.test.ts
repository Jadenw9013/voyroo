import { describe, expect, it } from "vitest";
import { drain, MAX_TRIES, nextRetryAt, nextToSend, release, retryDelay, settle, verdictFor, type Pending, type Verdict } from "./outbox";

/*
 * Edits made offline used to vanish behind a toast when the server said no
 * (a 428 for something booked, any other 4xx), and one that kept getting a
 * 5xx blocked everything behind it forever, retried every minute.
 */

const edit = (key: string, extra: Partial<Pending> = {}): Pending => ({ key, ops: [{ op: "trip.update", set: { notes: key } }], ...extra });

/** A server that answers each key with the next status from its script (the last one repeats). */
function server(script: Record<string, (number | "offline")[]>) {
  const sent: string[] = [];
  const send = async (p: Pending): Promise<{ verdict: Verdict; error?: string }> => {
    sent.push(p.key);
    const answers = script[p.key] ?? [200];
    const answer = answers.length > 1 ? answers.shift()! : answers[0];
    if (answer === "offline") return { verdict: "wait" };
    return { verdict: verdictFor(answer), error: `HTTP ${answer}` };
  };
  return { send, sent };
}

function phone(queue: Pending[]) {
  let q = queue;
  return { queue: () => q, update: (fn: (q: Pending[]) => Pending[]) => void (q = fn(q)) };
}

describe("the outbox", () => {
  it("sorts answers into saved, needs confirming, can't apply, retry later and sign in", () => {
    expect([200, 428, 400, 404, 409, 413, 422, 401, 408, 429, 500, 503].map(verdictFor)).toEqual([
      "saved", "confirm", "failed", "failed", "failed", "failed", "failed", "signin", "retry", "retry", "retry", "retry",
    ]);
  });

  it("holds an edit that touches something booked for a person to confirm, and sends the edits after it", async () => {
    const device = phone([edit("a"), edit("b"), edit("c")]);
    const net = server({ b: [428] });
    const held = await drain({ ...device, send: net.send, now: () => 0 });
    expect(net.sent).toEqual(["a", "b", "c"]);
    expect(device.queue()).toEqual([{ key: "b", ops: edit("b").ops, held: { reason: "confirm", error: "HTTP 428" } }]);
    expect(held.map((p) => p.key)).toEqual(["b"]);
    // It isn't sent again on its own…
    expect(nextToSend(device.queue(), 0)).toBeNull();
    // …until the person confirms it, which sends it as confirmed.
    device.update((q) => release(q, "b", "send"));
    expect(device.queue()).toEqual([{ key: "b", ops: edit("b").ops, confirmed: true }]);
    await drain({ ...device, send: server({}).send, now: () => 0 });
    expect(device.queue()).toEqual([]);
  });

  it("keeps an edit the server can't apply, so a person can retry or discard it, and sends the rest", async () => {
    const device = phone([edit("a"), edit("b"), edit("c")]);
    await drain({ ...device, send: server({ a: [422] }).send, now: () => 0 });
    expect(device.queue()).toEqual([{ key: "a", ops: edit("a").ops, held: { reason: "failed", error: "HTTP 422" } }]);
    device.update((q) => release(q, "a", "discard"));
    expect(device.queue()).toEqual([]);
  });

  it("backs off on server errors without reordering edits, then stops blocking after MAX_TRIES", async () => {
    let now = 0;
    const device = phone([edit("a"), edit("b")]);
    const net = server({ a: [500] });
    const waits: number[] = [];
    for (let i = 1; i <= MAX_TRIES; i++) {
      await drain({ ...device, send: net.send, now: () => now });
      const a = device.queue().find((p) => p.key === "a")!;
      if (a.held) break;
      // b waits behind a: edits keep their order while a is retried.
      expect(device.queue().map((p) => p.key)).toEqual(["a", "b"]);
      expect(nextToSend(device.queue(), now)).toBeNull();
      waits.push(a.retryAt! - now);
      expect(nextRetryAt(device.queue())).toBe(a.retryAt);
      now = a.retryAt!;
    }
    expect(waits).toEqual([5_000, 10_000, 20_000, 40_000, 80_000]);
    expect(net.sent).toEqual(["a", "a", "a", "a", "a", "a", "b"]);
    expect(device.queue()).toEqual([{ key: "a", ops: edit("a").ops, tries: MAX_TRIES, held: { reason: "failed", error: "HTTP 500" } }]);
    // Trying again starts the count over.
    device.update((q) => release(q, "a", "send"));
    expect(device.queue()).toEqual([{ key: "a", ops: edit("a").ops }]);
  });

  it("leaves everything as it was while offline", async () => {
    const device = phone([edit("a"), edit("b")]);
    const net = server({ a: ["offline"] });
    expect(await drain({ ...device, send: net.send, now: () => 0 })).toEqual([]);
    expect(net.sent).toEqual(["a"]);
    expect(device.queue()).toEqual([edit("a"), edit("b")]);
  });

  it("recovers when a server error clears up", async () => {
    let now = 0;
    const device = phone([edit("a"), edit("b")]);
    const net = server({ a: [503, 200] });
    await drain({ ...device, send: net.send, now: () => now });
    now = device.queue()[0].retryAt!;
    await drain({ ...device, send: net.send, now: () => now });
    expect(device.queue()).toEqual([]);
    expect(net.sent).toEqual(["a", "a", "b"]);
  });

  it("caps the wait between retries", () => {
    expect(retryDelay(1)).toBe(5_000);
    expect(retryDelay(20)).toBe(5 * 60_000);
    expect(settle([edit("a", { tries: 2 })], "a", "retry", "x", 1_000)).toEqual([{ ...edit("a"), tries: 3, retryAt: 21_000 }]);
  });
});
