"use client";

import { useMemo, useRef, useState } from "react";
import { tripDays } from "@/domain/derive";
import { hasCoords, stopsFor } from "@/domain/geo";
import { weekday } from "@/domain/time";
import type { Trip } from "@/domain/types";
import { DayChip, GroupCard, MapPlaceholder, PinCard, toPin, useLazyCanvas } from "../map/TripMap";

/**
 * The trip map on the viewing link: every placed stop, or one day's stops
 * numbered in order with the route between them. Tapping a pin shows its card;
 * "Open" unfolds that stop in the day list below. Read-only: nothing to place.
 */
export function ShareMap({ trip, photo }: { trip: Trip; photo: { tripId: string; token: string } }) {
  const days = tripDays(trip);
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<string[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stops = useMemo(() => stopsFor(trip, day ?? undefined), [trip, day]);
  const located = stops.filter((s) => hasCoords(s.item.place));
  const pins = useMemo(() => located.map((s, i) => toPin(s, day ? i + 1 : undefined, trip, !day)), [located, day, trip]);
  const frame = useMemo(() => {
    const onGround = pins.filter((p) => p.kind !== "flight");
    return onGround.length ? onGround : pins;
  }, [pins]);
  const route = useMemo(() => {
    if (!day || pins.length < 2) return null;
    const pts: [number, number][] = [];
    for (const p of pins) if (!pts.length || pts.at(-1)![0] !== p.lng || pts.at(-1)![1] !== p.lat) pts.push([p.lng, p.lat]);
    return pts.length > 1 ? pts : null;
  }, [pins, day]);
  const { Canvas, failed, setFailed } = useLazyCanvas(box, pins.length > 0);
  const selectedStop = selected ? located.find((s) => s.item.id === selected) : undefined;
  const groupStops = group ? located.filter((s) => group.includes(s.item.id)) : [];
  const withToken = (src: string) => (src.startsWith("/api/photo?") ? `${src}&trip=${encodeURIComponent(photo.tripId)}&token=${photo.token}` : src);

  /** Unfold the stop in the day list and bring it into view. */
  const openStop = (id: string) => {
    const el = document.getElementById(`item-${id}`);
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted" role="status">
        {pins.length} {pins.length === 1 ? "place" : "places"} on the map{day ? ` on ${weekday(day, true)}` : ""}
      </p>
      {days.length > 0 && (
        <div role="group" aria-label="Show a day" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <DayChip active={!day} onClick={() => (setDay(null), setSelected(null), setGroup(null))}>
            All
          </DayChip>
          {days.map((d) => (
            <DayChip key={d} active={day === d} onClick={() => (setDay(d), setSelected(null), setGroup(null))}>
              {weekday(d)} {Number(d.slice(8))}
            </DayChip>
          ))}
        </div>
      )}
      <div ref={box} className="relative h-96 w-full overflow-hidden rounded-2xl border border-line bg-sunken">
        {pins.length > 0 && Canvas && !failed ? (
          <Canvas
            label={day ? `Map of ${weekday(day, true)}` : `Map of ${trip.name}`}
            pins={pins}
            frame={frame}
            frameKey={day ?? "all"}
            route={route}
            selected={selected}
            onSelect={(id) => (setGroup(null), setSelected(id))}
            onGroup={(ids) => (setSelected(null), setGroup(ids))}
            picking={null}
            onPick={() => {}}
            onCancelPick={() => {}}
            cooperative
            onError={() => setFailed("draw")}
          />
        ) : (
          <MapPlaceholder>
            {failed === "draw"
              ? "This device can't draw the map. Every place is in the day list."
              : failed === "load"
                ? "The map needs a connection the first time it opens."
                : pins.length
                  ? "Loading the map…"
                  : "Nothing on the map yet."}
          </MapPlaceholder>
        )}
        {(selectedStop || groupStops.length > 0) && (
          <div className="absolute inset-x-2 bottom-9 z-20">
            {selectedStop ? (
              <PinCard stop={selectedStop} trip={trip} photo={withToken} onClose={() => setSelected(null)} onOpen={() => openStop(selectedStop.item.id)} />
            ) : (
              <GroupCard stops={groupStops} trip={trip} onClose={() => setGroup(null)} onChoose={(id) => (setGroup(null), setSelected(id))} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
