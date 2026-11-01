import "server-only";
import { z } from "zod";
import type { Rates } from "@/domain/expenses";
import { isDate } from "@/domain/time";

/*
 * Exchange rates, fetched on the server about once a day for everyone, so
 * expenses in quetzales can be shown in dollars.
 *
 * Source: ExchangeRate-API's open endpoint (open.er-api.com). Free, no key
 * to keep secret, 160+ currencies including the quetzal (the ECB rates
 * behind Frankfurter have no GTQ), updated once a day, which is all this
 * needs: each expense keeps the rate it was logged with, so nothing here
 * has to be to-the-minute. Its terms ask for a credit (shown with the
 * converted totals) and for caching instead of a call per request, which
 * Next's data cache does. If it's down, the same rates from the free
 * fawazahmed0 currency API on jsDelivr fill in, and failing both, the last
 * rates this server saw.
 */

export const RATES_SOURCE = { name: "ExchangeRate-API", url: "https://www.exchangerate-api.com" };

const PRIMARY = "https://open.er-api.com/v6/latest/USD";
const FALLBACK = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json";
/** New rates come out daily; half a day keeps them at most that stale. */
const REVALIDATE = 12 * 60 * 60;

const Primary = z.object({
  result: z.literal("success"),
  base_code: z.literal("USD"),
  time_last_update_unix: z.number(),
  rates: z.record(z.string(), z.number()),
});
const Fallback = z.object({ date: z.string().refine(isDate), usd: z.record(z.string(), z.number()) });

let iso: Set<string> | null = null;
/** Only real currencies: the fallback also lists crypto. */
function clean(raw: Record<string, number>): Record<string, number> {
  iso ??= new Set(Intl.supportedValuesOf("currency"));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const code = k.toUpperCase();
    if (iso.has(code) && Number.isFinite(v) && v > 0) out[code] = v;
  }
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`rates ${res.status}`);
  return res.json();
}

export async function fromPrimary(): Promise<Rates> {
  const r = Primary.parse(await getJson(PRIMARY));
  return { base: "USD", date: new Date(r.time_last_update_unix * 1000).toISOString().slice(0, 10), rates: clean(r.rates) };
}

export async function fromFallback(): Promise<Rates> {
  const r = Fallback.parse(await getJson(FALLBACK));
  return { base: "USD", date: r.date, rates: clean(r.usd) };
}

/** Made-up rates for tests (RATES_MOCK=1), so nothing reaches the internet. */
const MOCK: Rates = { base: "USD", date: "2026-11-01", rates: { USD: 1, GTQ: 7.7, EUR: 0.9, MXN: 18.5, GBP: 0.75, JPY: 150 } };

const g = globalThis as unknown as { lastRates?: Rates };

/** Today's rates (one USD buys `rates[c]`), or the last ones seen, or null if there have never been any. */
export async function getRates(): Promise<Rates | null> {
  if (process.env.RATES_MOCK === "1") return MOCK;
  for (const source of [fromPrimary, fromFallback]) {
    try {
      const rates = await source();
      if (Object.keys(rates.rates).length < 20) throw new Error("too few rates");
      g.lastRates = rates;
      return rates;
    } catch (e) {
      console.warn("rates unavailable", { source: source.name, message: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }
  return g.lastRates ?? null;
}
