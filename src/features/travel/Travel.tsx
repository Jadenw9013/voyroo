"use client";

import type { ReactNode } from "react";
import { dayLegs, describeLeg, legInto, routeKeys, type Leg, type LegInfo, type Point } from "@/domain/travel";
import type { Item, Trip } from "@/domain/types";
import { useRouteBook } from "@/client/routes";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";

/*
 * The lines between a day's stops: "About 25 min drive · 12 km · Leave by
 * 8:35 AM", and "Tight: 40 min drive, 30 min gap" when it won't work. Only
 * where both stops have coordinates; flights and what a shuttle carries you
 * through are left out (see src/domain/travel.ts).
 */

export interface Shown {
  leg: Leg;
  info: LegInfo;
}

/** Route keys for the whole trip, worked out once per version of it however many days are on screen. */
const keysByTrip = new WeakMap<Trip, string[]>();
function keysFor(trip: Trip): string[] {
  let keys = keysByTrip.get(trip);
  if (!keys) keysByTrip.set(trip, (keys = routeKeys(trip)));
  return keys;
}

function useTravel() {
  const { trip, tripId, version, online } = useTrip();
  const needed = keysFor(trip);
  const book = useRouteBook(tripId, needed, version, online);
  const show = (leg: Leg): Shown | null => {
    const known = leg.key in book.routes;
    // Asking right now: wait a moment rather than flash a guess.
    if (!known && book.loading) return null;
    const info = describeLeg(leg, known ? book.routes[leg.key] : undefined);
    return info ? { leg, info } : null;
  };
  return { trip, book, online, show };
}

/** The legs on a day, by the row each one arrives at. */
export function useDayLegs(date: string): Map<string, Shown> {
  const { trip, show } = useTravel();
  const out = new Map<string, Shown>();
  for (const leg of dayLegs(trip, date)) {
    const s = show(leg);
    if (s) out.set(leg.toKey, s);
  }
  return out;
}

const Dot = () => (
  <>
    <span aria-hidden="true"> · </span>
    <span className="sr-only">, </span>
  </>
);

function TightLine({ info, className = "" }: { info: LegInfo; className?: string }) {
  if (!info.tightText) return null;
  return (
    <span className={`flex items-center gap-1 font-bold text-todo ${className}`}>
      <Icon name="clock" className="size-3.5" />
      {info.tightText}
    </span>
  );
}

/**
 * The drive between two stops, on the day's rail: the car (or walker) sits on
 * the rail between the two pictures, the words in the text column. An <li>,
 * to sit in the day's list (see railList in src/ui/StopMedia.tsx).
 */
export function LegRow({ shown }: { shown?: Shown }) {
  if (!shown) return null;
  const { leg, info } = shown;
  return (
    <li className="relative flex min-h-10 flex-col justify-center py-1 pr-2 pl-40 text-sm text-muted">
      <span aria-hidden="true" className="absolute top-1/2 left-30 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-canvas text-ink">
        <Icon name={info.mode === "walk" ? "walk" : "car"} className="size-4" />
      </span>
      <span>
        {leg.fromKey === null && <>From {leg.from.title}: </>}
        {info.summary}
        {info.estimate && " (estimate)"}
        {info.leaveBy && (
          <>
            <Dot />
            <span className="font-semibold text-ink">Leave by {info.leaveBy}</span>
          </>
        )}
      </span>
      <TightLine info={info} className="mt-0.5" />
    </li>
  );
}

const ll = (p: Point) => `${p.lat},${p.lng}`;

/** Google Maps directions from one stop to the next. */
function legDirections(leg: Leg): string {
  const mode = leg.mode === "walk" ? "walking" : "driving";
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ll(leg.fromPoint))}&destination=${encodeURIComponent(ll(leg.toPoint))}&travelmode=${mode}`;
}

function Attribution({ provider, estimate, online }: { provider: string | null; estimate: boolean; online: boolean }): ReactNode {
  if (estimate) {
    const why = !online ? "no road times saved on this phone yet" : provider ? "road times aren't in yet" : "road times aren't set up";
    return <p className="mt-1 text-sm text-muted">Rough estimate from the straight-line distance: {why}.</p>;
  }
  if (provider !== "openrouteservice") return null;
  return <p className="mt-1 text-sm text-muted">Road times by openrouteservice.org, map data © OpenStreetMap contributors.</p>;
}

/** "From previous stop" on an item's page: how to get here from the thing before it. */
export function FromPrevious({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const { trip, book, online, show } = useTravel();
  const leg = legInto(trip, item);
  const shown = leg ? show(leg) : null;
  if (!shown) return null;
  const { info } = shown;
  return (
    <section className="py-4" aria-labelledby="from-previous">
      <h2 id="from-previous" className="mb-1.5 text-sm font-bold text-muted">
        From previous stop
      </h2>
      <p className="text-base">
        <button type="button" onClick={() => onOpen(shown.leg.from)} className="min-h-11 text-left font-semibold text-accent">
          {shown.leg.from.title}
        </button>
        {shown.leg.fromKey === null && <span className="text-muted"> (where you slept)</span>}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-base">
        <Icon name={info.mode === "walk" ? "walk" : "car"} className="size-4" />
        <span>
          {info.summary}
          {info.estimate && " (estimate)"}
        </span>
      </p>
      {info.leaveBy && <p className="mt-1 text-base font-semibold">Leave by {info.leaveBy}</p>}
      <TightLine info={info} className="mt-1 text-base" />
      <a href={legDirections(shown.leg)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent">
        <Icon name="directions" className="size-4" />
        Directions from {shown.leg.from.title}
      </a>
      <Attribution provider={book.provider} estimate={info.estimate} online={online} />
    </section>
  );
}
