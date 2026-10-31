"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Trip } from "@/domain/types";
import { weatherSignature, type WeatherReport } from "@/domain/weather";
import { useOnline } from "./hooks";

/*
 * The trip's weather on this phone. The last report is kept next to the trip
 * in localStorage, so it shows with no signal along with when it's from.
 * Every screen shares one copy and one request; it's asked for again after
 * an hour, or when a change to the trip moves where a day's weather is for.
 */

export interface WeatherState {
  report: WeatherReport | null;
  /** When this phone got the report, epoch ms. */
  fetchedAt: number | null;
  loading: boolean;
  failed: boolean;
}

interface Entry extends WeatherState {
  sig?: string;
  failedAt?: number;
}

const REFRESH_MS = 60 * 60_000;
const RETRY_MS = 5 * 60_000;
const EMPTY: WeatherState = { report: null, fetchedAt: null, loading: false, failed: false };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const sigs = new WeakMap<Trip, string>();

const storageKey = (tripId: string) => `trip:${tripId}:weather`;

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function entry(tripId: string): Entry {
  let e = entries.get(tripId);
  if (!e) {
    e = { ...EMPTY };
    try {
      const kept = JSON.parse(localStorage.getItem(storageKey(tripId)) ?? "null") as { report: WeatherReport; fetchedAt: number; sig: string } | null;
      if (kept?.report?.days) e = { ...e, report: kept.report, fetchedAt: kept.fetchedAt, sig: kept.sig };
    } catch {
      // Nothing kept, or storage blocked.
    }
    entries.set(tripId, e);
  }
  return e;
}

function update(tripId: string, next: Entry) {
  entries.set(tripId, next);
  listeners.forEach((l) => l());
}

async function fetchWeather(tripId: string, sig: string) {
  const cur = entry(tripId);
  if (cur.loading) return;
  update(tripId, { ...cur, loading: true });
  try {
    const res = await fetch(`/api/t/${tripId}/weather`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const report = (await res.json()) as WeatherReport;
    const fetchedAt = Date.now();
    try {
      localStorage.setItem(storageKey(tripId), JSON.stringify({ report, fetchedAt, sig }));
    } catch {
      // Storage full: still shown until reload.
    }
    update(tripId, { report, fetchedAt, sig, loading: false, failed: false });
  } catch {
    update(tripId, { ...entry(tripId), loading: false, failed: true, failedAt: Date.now() });
  }
}

const signature = (trip: Trip) => {
  let s = sigs.get(trip);
  if (s === undefined) sigs.set(trip, (s = weatherSignature(trip)));
  return s;
};

export function useWeather(tripId: string, trip: Trip): WeatherState {
  const online = useOnline();
  const sig = signature(trip);
  const state = useSyncExternalStore(subscribe, () => entry(tripId), () => EMPTY);
  useEffect(() => {
    if (!online) return;
    const e = entry(tripId);
    const now = Date.now();
    if (e.failedAt && now - e.failedAt < RETRY_MS) return;
    if (!e.fetchedAt || now - e.fetchedAt > REFRESH_MS || e.sig !== sig) void fetchWeather(tripId, sig);
  }, [tripId, sig, online]);
  return state;
}
