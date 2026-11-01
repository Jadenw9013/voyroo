"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Route } from "@/domain/travel";

/*
 * Road times kept on this phone, next to the trip snapshot, so the "25 min
 * drive" lines still show with no signal. The phone asks the server for
 * every leg on the trip (not just the day on screen) whenever it's online
 * and something is missing, and keeps only the legs the trip still has.
 */

export interface RouteBook {
  /** Known routes by key; null means no road between them. */
  routes: Record<string, Route | null>;
  /** Who the times come from; null when the server has no routing set up. */
  provider: string | null;
  /** Waiting on the server (or rendering on it): unknown legs show nothing yet rather than flash a guess. */
  loading: boolean;
}

interface Entry {
  book: RouteBook;
  listeners: Set<() => void>;
  /** A request is out. */
  inflight: boolean;
  /** The last request: trip version and the keys that were missing. */
  asked: string;
  /** What the page wants now, in case it changed while a request was out. */
  latest: { needed: string[]; version: number };
  retry: ReturnType<typeof setTimeout> | null;
}

const RETRY_MS = 60_000;
const SERVER_BOOK: RouteBook = { routes: {}, provider: null, loading: true };
const storageKey = (tripId: string) => `trip:${tripId}:routes`;
const entries = new Map<string, Entry>();

const isRoute = (r: unknown): r is Route => !!r && typeof r === "object" && Number.isFinite((r as Route).s) && Number.isFinite((r as Route).m);

function clean(raw: unknown): Record<string, Route | null> {
  const out: Record<string, Route | null> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v === null) out[k] = null;
    else if (isRoute(v)) out[k] = { s: v.s, m: v.m };
  }
  return out;
}

function entry(tripId: string): Entry {
  let e = entries.get(tripId);
  if (!e) {
    // Nothing saved yet and online: the first answer is on its way, so don't show guesses meanwhile.
    let book: RouteBook = { routes: {}, provider: null, loading: navigator.onLine };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(tripId)) ?? "null");
      if (saved) book = { routes: clean(saved.routes), provider: typeof saved.provider === "string" ? saved.provider : null, loading: false };
    } catch {
      // Storage is blocked: start empty.
    }
    e = { book, listeners: new Set(), inflight: false, asked: "", latest: { needed: [], version: 0 }, retry: null };
    entries.set(tripId, e);
  }
  return e;
}

function publish(tripId: string, e: Entry, book: RouteBook) {
  e.book = book;
  try {
    localStorage.setItem(storageKey(tripId), JSON.stringify({ routes: book.routes, provider: book.provider }));
  } catch {
    // Storage full or blocked: routes still show until the page closes.
  }
  for (const l of e.listeners) l();
}

/** Only the legs the trip still has. */
const keep = (routes: Record<string, Route | null>, needed: string[]) => Object.fromEntries(needed.filter((k) => k in routes).map((k) => [k, routes[k]]));

async function ask(tripId: string, needed: string[], version: number) {
  const e = entry(tripId);
  e.latest = { needed, version };
  if (e.inflight) return;
  if (!navigator.onLine) {
    if (e.book.loading) publish(tripId, e, { ...e.book, loading: false });
    return;
  }
  const missing = needed.filter((k) => !(k in e.book.routes));
  const asked = `${version}:${missing.join("|")}`;
  if (!missing.length || asked === e.asked) return;
  e.asked = asked;
  e.inflight = true;
  if (e.retry) clearTimeout(e.retry);
  e.retry = null;
  publish(tripId, e, { ...e.book, loading: true });
  const again = () => {
    e.retry = setTimeout(() => {
      e.asked = "";
      void ask(tripId, e.latest.needed, e.latest.version);
    }, RETRY_MS);
  };
  try {
    const res = await fetch(`/api/t/${tripId}/routes`, { cache: "no-store" });
    e.inflight = false;
    if (!res.ok) {
      publish(tripId, e, { ...e.book, loading: false });
      if (res.status === 429 || res.status >= 500) again();
      return;
    }
    const body = await res.json();
    const provider = typeof body.provider === "string" ? body.provider : null;
    publish(tripId, e, { routes: keep({ ...e.book.routes, ...clean(body.routes) }, e.latest.needed), provider, loading: false });
    if (provider && Number(body.pending) > 0) again();
  } catch {
    // Signal dropped: show guesses for now and try again in a while.
    e.inflight = false;
    publish(tripId, e, { ...e.book, loading: false });
    again();
    return;
  }
  // The trip may have changed while that was out.
  void ask(tripId, e.latest.needed, e.latest.version);
}

/**
 * The routes this phone has for a trip, and fetches the ones it's missing.
 * `needed` is every route key on the trip, sorted (see routeKeys).
 */
export function useRouteBook(tripId: string, needed: string[], version: number, online: boolean): RouteBook {
  const subscribe = useCallback(
    (cb: () => void) => {
      const e = entry(tripId);
      e.listeners.add(cb);
      return () => void e.listeners.delete(cb);
    },
    [tripId],
  );
  const book = useSyncExternalStore(subscribe, () => entry(tripId).book, () => SERVER_BOOK);
  const signature = needed.join("|");
  useEffect(() => {
    if (online) void ask(tripId, signature ? signature.split("|") : [], version);
  }, [tripId, signature, version, online]);
  return book;
}
