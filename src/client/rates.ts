"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Rates } from "@/domain/expenses";
import { useOnline } from "./hooks";

/*
 * Exchange rates on this phone. The last ones fetched are kept in
 * localStorage, so expenses logged with no signal still lock in a rate and
 * totals still convert. Fetched again when they're half a day old.
 */

export interface SavedRates {
  rates: Rates;
  source?: { name: string; url: string };
  /** Epoch ms. */
  fetchedAt: number;
}

const KEY = "fx:rates";
const STALE_MS = 12 * 60 * 60 * 1000;

let cache: SavedRates | null | undefined;
const listeners = new Set<() => void>();

function read(): SavedRates | null {
  if (cache === undefined) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
      cache = raw?.rates?.base && raw.rates.rates ? raw : null;
    } catch {
      cache = null;
    }
  }
  return cache ?? null;
}

function write(saved: SavedRates) {
  cache = saved;
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage full or blocked: today's rates still work until the app closes.
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

let inflight: Promise<void> | null = null;

/** The latest rates this phone has, fetching fresh ones when online and they're stale. */
export function useRates(tripId: string): SavedRates | null {
  const saved = useSyncExternalStore(subscribe, read, () => null);
  const online = useOnline();
  const fetchedAt = saved?.fetchedAt ?? 0;
  useEffect(() => {
    if (!online || inflight || Date.now() - fetchedAt < STALE_MS) return;
    inflight = fetch(`/api/t/${tripId}/rates`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b?.base && b.rates) write({ rates: { base: b.base, date: b.date, rates: b.rates }, source: b.source, fetchedAt: Date.now() });
      })
      .catch(() => {
        // Offline or the rates service is down: keep what we have.
      })
      .finally(() => (inflight = null));
  }, [tripId, online, fetchedAt]);
  return saved;
}
