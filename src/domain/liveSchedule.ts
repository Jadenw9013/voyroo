import { hasCoords, validLatLng, type LatLng } from "./geo";
import { directionsUrl } from "./links";
import { addDays, instantOf, todayIn, zonedInstant } from "./time";
import { straightLineM } from "./travel";
import type { Item, Trip, When } from "./types";

interface ScheduleEvent {
  id: string;
  title: string;
  part: "start" | "check-in" | "check-out";
  when: When;
  end?: When;
  tentative?: true;
  directionsUrl?: string;
}

interface LiveSchedule {
  inProgress: ScheduleEvent[];
  next: ScheduleEvent | null;
  minutesUntilNext: number | null;
  /** Gap in the timed plan, before allowing for transit. Null when the available time is unknown. */
  freeMinutesBeforeNext: number | null;
  /** Plans whose incomplete times can overlap the gap before the next appointment (or right now). */
  uncertainPlans: string[];
  /** Includes only dated items with usable pins, when a position was shared. */
  straightLineMeters: Record<string, number>;
}

/** Evaluate each wall-clock endpoint in its own zone, including overnight flights. */
export function liveSchedule(trip: Trip, nowMs: number, position?: LatLng | null): LiveSchedule {
  const today = todayIn(trip.tz, nowMs);
  const hasPosition = position && validLatLng(position.lat, position.lng);
  const inProgress: ScheduleEvent[] = [];
  const uncertain: { id: string; from: number; until: number }[] = [];
  const distances: [string, number][] = [];
  let next: ScheduleEvent | null = null;
  let nextAt = Infinity;
  let busyUntil = nowMs;

  function midnight(when: When, daysLater = 0) {
    return zonedInstant(addDays(when.date, daysLater), "00:00", when.tz ?? trip.tz);
  }

  function event(item: Item, when: When, part: ScheduleEvent["part"]): ScheduleEvent {
    // A flight's saved place is its arrival airport, not its departure point.
    const place = item.place;
    const destination = hasCoords(place) && !validLatLng(place.lat, place.lng) ? { name: place.name, address: place.address } : place;
    const directions = item.kind === "flight" ? null : directionsUrl(destination, trip);
    return {
      id: item.id, title: item.title, part,
      when: { ...when, tz: when.tz ?? trip.tz },
      ...(part === "start" && item.end ? { end: { ...item.end, tz: item.end.tz ?? trip.tz } } : {}),
      ...(item.maybe ? { tentative: true } : {}),
      ...(directions ? { directionsUrl: directions } : {}),
    };
  }

  for (const item of trip.items) {
    if (!item.start) continue;
    if (item.kind !== "flight" && hasPosition && hasCoords(item.place) && validLatLng(item.place.lat, item.place.lng)) {
      distances.push([item.id, Math.round(straightLineM(position, item.place))]);
    }
    const start = instantOf(item.start, trip.tz);
    const recordedEnd = instantOf(item.end, trip.tz);
    const end = recordedEnd !== null && (start === null || start <= recordedEnd) ? recordedEnd : null;
    const active = item.kind !== "stay" && start !== null && start <= nowMs && end !== null && nowMs < end;
    if (start !== null && start >= nowMs && start < nextAt && !active) {
      next = event(item, item.start, item.kind === "stay" ? "check-in" : "start");
      nextAt = start;
    }
    if (item.kind === "stay") {
      // A hotel reservation adds two appointments. The nights between them remain available for activities.
      for (const appointment of [item.start, item.end]) {
        if (appointment && !appointment.time) {
          uncertain.push({ id: item.id, from: midnight(appointment), until: midnight(appointment, 1) });
        }
      }
      if (item.end && end !== null && end >= nowMs && end < nextAt) {
        next = event(item, item.end, "check-out");
        nextAt = end;
      }
      continue;
    }
    if (active) {
      inProgress.push(event(item, item.start, "start"));
      busyUntil = Math.max(busyUntil, end);
    }
    if (start === null || end === null) {
      // A date-only endpoint can fall anywhere on its local date. A marked overnight
      // activity or transport without an arrival time can also occupy the next day.
      const lastDay = item.end ?? item.start;
      const mayRunOvernight = !item.end && (item.sleepsHere || item.kind === "flight" || item.kind === "transport");
      const from = start ?? midnight(item.start);
      const until = end ?? Math.max(midnight(item.start, 1), midnight(lastDay, mayRunOvernight ? 2 : 1));
      uncertain.push({ id: item.id, from, until });
    }
  }

  const minutesUntilNext = next ? Math.ceil((nextAt - nowMs) / 60_000) : null;
  const gapEnd = next ? nextAt : nowMs + 1;
  const overlapsGap = (plan: { from: number; until: number }) => busyUntil < gapEnd && plan.from < gapEnd && plan.until > busyUntil;
  const uncertainPlans = [...new Set(uncertain.filter(overlapsGap).map((plan) => plan.id))];
  const freeMinutesBeforeNext = next && !uncertainPlans.length
    && today >= trip.startDate && today <= trip.endDate
    ? Math.max(0, Math.floor((nextAt - busyUntil) / 60_000)) : null;
  return { inProgress, next, minutesUntilNext, freeMinutesBeforeNext, uncertainPlans, straightLineMeters: Object.fromEntries(distances) };
}
