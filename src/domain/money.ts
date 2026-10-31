/*
 * Money as people say it: "Q420", "$54.50". Sums and splits are done in whole
 * minor units (centavos, cents) so they always add up to the cent.
 *
 * Decimal places come from ISO 4217, written out here rather than asked of
 * Intl, so every phone and the server round the same way.
 */

const ZERO = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** Decimal places a currency is counted in: 2 for GTQ and USD, 0 for JPY, 3 for KWD. */
export function minorDigits(currency: string): number {
  return ZERO.has(currency) ? 0 : THREE.has(currency) ? 3 : 2;
}

/** 420.5 GTQ → 42050 centavos. Rounds half away from zero, without float drift (1.005 → 101). */
export function toMinor(amount: number, currency: string): number {
  const d = minorDigits(currency);
  const shifted = Number(`${Math.abs(amount)}e${d}`);
  const n = Number.isFinite(shifted) ? Math.round(shifted) : Math.round(Math.abs(amount) * 10 ** d);
  return amount < 0 ? -n : n;
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency);
}

/** Rounds an amount to what the currency can hold: 420.555 GTQ → 420.56. */
export const roundMoney = (amount: number, currency: string) => fromMinor(toMinor(amount, currency), currency);

/**
 * "Q420", "$54.50", "MX$300", "¥1,200". Whole amounts drop the decimals.
 * The local sign when it can't be mistaken for another currency's (Q, ₡),
 * else the code ("ARS 420" rather than a $ that reads as dollars).
 */
export function formatMoney(amount: number, currency: string): string {
  const d = minorDigits(currency);
  const whole = toMinor(amount, currency) % 10 ** d === 0;
  const digits = { minimumFractionDigits: whole ? 0 : d, maximumFractionDigits: whole ? 0 : d };
  try {
    const parts = (display: "symbol" | "narrowSymbol") => new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: display, ...digits }).formatToParts(amount);
    const sign = (p: Intl.NumberFormatPart[]) => p.find((x) => x.type === "currency")?.value ?? currency;
    const standard = parts("symbol");
    if (sign(standard) !== currency) return standard.map((p) => p.value).join("");
    const narrow = parts("narrowSymbol");
    if (sign(narrow) === currency || sign(narrow).includes("$")) return standard.map((p) => p.value).join("");
    return narrow.filter((p, i) => !(p.type === "literal" && /^\s+$/.test(p.value) && narrow[i - 1]?.type === "currency")).map((p) => p.value).join("");
  } catch {
    return `${amount.toFixed(whole ? 0 : d)} ${currency}`;
  }
}

/** Whole minor units, formatted. */
export const formatMinor = (minor: number, currency: string) => formatMoney(fromMinor(minor, currency), currency);
