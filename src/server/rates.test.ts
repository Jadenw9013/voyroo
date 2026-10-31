import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRates } from "./rates";

const g = globalThis as unknown as { lastRates?: unknown };

const many = Object.fromEntries(["EUR", "GBP", "JPY", "MXN", "CAD", "AUD", "CHF", "CNY", "INR", "BRL", "CRC", "COP", "PEN", "CLP", "NZD", "SEK", "NOK", "DKK", "HNL", "BZD"].map((c, i) => [c, i + 1]));
const primary = { result: "success", base_code: "USD", time_last_update_unix: Date.parse("2026-10-31T00:02:31Z") / 1000, rates: { USD: 1, GTQ: 7.64, ...many } };
const fallback = { date: "2026-10-30", usd: { usd: 1, gtq: 7.65, btc: 0.00001, "1inch": 12.7, ...Object.fromEntries(Object.entries(many).map(([k, v]) => [k.toLowerCase(), v])) } };

function serve(handlers: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const h = Object.entries(handlers).find(([k]) => url.includes(k))?.[1];
      if (!h) throw new Error("offline");
      return h();
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("exchange rates", () => {
  beforeEach(() => {
    g.lastRates = undefined;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads the day's rates from the keyless open endpoint", async () => {
    const calls = serve({ "open.er-api.com": json(primary) });
    const r = await getRates();
    expect(r).toMatchObject({ base: "USD", date: "2026-10-31" });
    expect(r!.rates.GTQ).toBe(7.64);
    expect(calls).toEqual(["https://open.er-api.com/v6/latest/USD"]);
  });

  it("falls back to the second source, keeping only real currencies", async () => {
    serve({ "open.er-api.com": json({ result: "error" }, 500), "jsdelivr.net": json(fallback) });
    const r = await getRates();
    expect(r).toMatchObject({ base: "USD", date: "2026-10-30" });
    expect(r!.rates.GTQ).toBe(7.65);
    expect(r!.rates.BTC).toBeUndefined();
    expect(r!.rates["1INCH"]).toBeUndefined();
  });

  it("keeps the last rates it saw when both sources are down", async () => {
    serve({ "open.er-api.com": json(primary) });
    await getRates();
    serve({});
    expect((await getRates())?.rates.GTQ).toBe(7.64);
  });

  it("says there are none when it has never had any", async () => {
    serve({ "open.er-api.com": json({ result: "success", base_code: "EUR" }) });
    expect(await getRates()).toBeNull();
  });
});
