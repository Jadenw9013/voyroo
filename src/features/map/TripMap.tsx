"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { hasCoords, locatable, roundCoord, stopsFor, unplaced, type LatLng, type Stop } from "@/domain/geo";
import { directionsUrl, itemPhotoUrl, mapsSearchUrl, routeUrl } from "@/domain/links";
import { formatTime, weekday } from "@/domain/time";
import type { Item, Trip } from "@/domain/types";
import { tripDays } from "@/domain/derive";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { KindChip, KIND_LABEL, StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn, field, label as fieldLabel } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";
import { whenLabel } from "../shared";
import type { MapCanvasProps } from "./MapCanvas";
import type { MapPin } from "./pins";

/*
 * The trip map: a pin for everything on the trip that has a place, like a
 * stay map's price pills. Pick a day to see its stops numbered in order with
 * the route between them. Tap a pin for a card with the photo, time, status,
 * directions and the item itself. Everything on the map is also a list, and
 * what isn't on the map yet is listed underneath with a way to place it.
 *
 * MapLibre loads only when a map scrolls into view, so it costs nothing on
 * screens that don't show one.
 */

export type MapVariant = "plan" | "day" | "item";

const shortTime = (t: string) => formatTime(t).replace(":00 ", " ");

function verb(s: Stop): string | null {
  if (s.part === "end") return s.item.kind === "stay" ? "Check out" : s.item.kind === "flight" ? "Land" : "Back from";
  if (s.part === "start" && s.item.kind === "stay") return "Check in";
  return null;
}

const titleOf = (s: Stop) => (verb(s) ? `${verb(s)}: ${s.item.title}` : s.item.title);

function status(item: Item): { status: "booked" | "todo" | "maybe"; word: string } | null {
  if (item.maybe) return { status: "maybe", word: "Maybe" };
  if (item.booking?.state === "booked") return { status: "booked", word: "Booked" };
  if (item.booking?.state === "todo") return { status: "todo", word: "To book" };
  return null;
}

function whenWords(s: Stop, trip: Trip): string {
  if (s.part === "idea") return "Idea, no day yet";
  if (s.part === "night") return "Tonight";
  return whenLabel(s.when, trip);
}

/** "Sat 9 AM · Pacaya hike" for the whole trip; "9 AM · Pacaya hike" on a day. */
function pinLabel(s: Stop, withDay: boolean): string {
  const time = s.when?.time ? shortTime(s.when.time) : null;
  const lead = s.part === "idea" ? "Idea" : s.part === "night" ? "Tonight" : [withDay && s.when ? weekday(s.when.date) : null, time].filter(Boolean).join(" ");
  return lead ? `${lead} · ${titleOf(s)}` : titleOf(s);
}

function toPin(s: Stop, n: number | undefined, trip: Trip, withDay: boolean): MapPin {
  const st = status(s.item);
  return {
    id: s.item.id,
    lat: s.item.place!.lat!,
    lng: s.item.place!.lng!,
    kind: s.item.kind,
    label: pinLabel(s, withDay),
    // Starts with what the pill shows, so "click 10 AM Check out" works by voice too.
    name: `${n ? `${n}. ` : ""}${pinLabel(s, withDay)}. ${whenWords(s, trip)}. ${KIND_LABEL[s.item.kind]}${st ? `. ${st.word}` : ""}`,
    ...(n ? { n } : {}),
    ...(s.part === "idea" ? { idea: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Backfill: ask the server to place items that have an address but no pin.

interface Known {
  tried: Set<string>;
  notFound: Set<string>;
  busy: boolean;
}
const known = new Map<string, Known>();
const listeners = new Set<() => void>();
const knownFor = (tripId: string) => {
  let k = known.get(tripId);
  if (!k) known.set(tripId, (k = { tried: new Set(), notFound: new Set(), busy: false }));
  return k;
};
const emit = () => listeners.forEach((l) => l());
let snapshot = 0;

function useBackfill(trip: Trip, tripId: string, online: boolean, refresh: () => Promise<void>): Known {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => 0,
  );
  const state = knownFor(tripId);
  const waiting = trip.items.filter((i) => locatable(i) && !state.tried.has(i.id)).map((i) => i.id);
  const key = waiting.join(",");

  useEffect(() => {
    if (!online || !key) return;
    const k = knownFor(tripId);
    if (k.busy) return;
    k.busy = true;
    snapshot++;
    emit();
    void (async () => {
      try {
        for (let round = 0; round < 6; round++) {
          const res = await fetch(`/api/t/${tripId}/locate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
          if (!res.ok) break;
          const body: { located: string[]; notFound: string[]; pending: number } = await res.json();
          body.notFound.forEach((id) => k.notFound.add(id));
          if (body.located.length) await refresh();
          if (!body.pending || (!body.located.length && !body.notFound.length)) {
            if (!body.pending) key.split(",").forEach((id) => k.tried.add(id));
            break;
          }
        }
      } catch {
        // Offline or the server is busy: the next visit tries again.
      } finally {
        k.busy = false;
        snapshot++;
        emit();
      }
    })();
  }, [key, online, tripId, refresh]);
  return state;
}

// ---------------------------------------------------------------------------
// The map module, loaded on first sight.

function useLazyCanvas(box: React.RefObject<HTMLElement | null>, want: boolean) {
  const [Canvas, setCanvas] = useState<ComponentType<MapCanvasProps> | null>(null);
  const [failed, setFailed] = useState<"load" | "draw" | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!want || Canvas || failed || !el) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        import("./MapCanvas").then(
          (m) => setCanvas(() => m.default),
          () => setFailed("load"),
        );
      },
      { rootMargin: "200px" },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [box, want, Canvas, failed]);
  return { Canvas, failed, setFailed };
}

// ---------------------------------------------------------------------------

export interface TripMapProps {
  variant: MapVariant;
  go: (v: View) => void;
  /** The day to show (day variant), or the day picked first (plan). */
  day?: string;
  /** The item page's item (item variant), or the pin to open first. */
  itemId?: string;
  /** Inside the full-screen dialog. */
  fullScreen?: boolean;
  onClose?: () => void;
  /** Start by placing this item's pin by hand. */
  pickId?: string;
  className?: string;
}

export function TripMap({ variant, go, day, itemId, fullScreen = false, onClose, pickId, className = "" }: TripMapProps) {
  const { trip, tripId, apply, online, refresh } = useTrip();
  const backfill = useBackfill(trip, tripId, online, refresh);
  const headingId = useId();
  const days = tripDays(trip);
  const [chosenDay, setChosenDay] = useState<string | null>(day ?? null);
  // A day's map follows the day on screen; the plan's map follows its own chips.
  const shown = variant === "day" ? day : variant === "plan" ? chosenDay : null;
  const activeDay = shown && days.includes(shown) ? shown : undefined;
  const [selected, setSelected] = useState<string | null>(variant === "item" ? null : (itemId ?? null));
  const [group, setGroup] = useState<string[] | null>(null);
  const [picking, setPicking] = useState<string | null>(pickId ?? null);
  const [addressFor, setAddressFor] = useState<Item | null>(null);
  const [full, setFull] = useState<{ day?: string; itemId?: string; pickId?: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const stops = useMemo<Stop[]>(() => {
    if (variant === "item") {
      const item = trip.items.find((i) => i.id === itemId);
      return item ? [{ item, part: item.start ? "start" : "idea", when: item.start ?? null }] : [];
    }
    return stopsFor(trip, activeDay);
  }, [trip, variant, itemId, activeDay]);

  const located = stops.filter((s) => hasCoords(s.item.place));
  const pins = useMemo(() => located.map((s, i) => toPin(s, activeDay ? i + 1 : undefined, trip, !activeDay)), [located, activeDay, trip]);
  const frame = useMemo(() => {
    const onGround = pins.filter((p) => p.kind !== "flight");
    return onGround.length ? onGround : pins;
  }, [pins]);
  const route = useMemo(() => {
    if (!activeDay || pins.length < 2) return null;
    const pts: [number, number][] = [];
    for (const p of pins) if (!pts.length || pts.at(-1)![0] !== p.lng || pts.at(-1)![1] !== p.lat) pts.push([p.lng, p.lat]);
    return pts.length > 1 ? pts : null;
  }, [pins, activeDay]);
  const missing = variant === "item" ? [] : unplaced(stops);
  const pickItem = picking ? trip.items.find((i) => i.id === picking) : null;
  const wantMap = pins.length > 0 || !!pickItem;
  const { Canvas, failed, setFailed } = useLazyCanvas(box, wantMap);

  const selectedStop = selected ? located.find((s) => s.item.id === selected) : undefined;
  const groupStops = group ? located.filter((s) => group.includes(s.item.id)) : [];

  /** Whatever opened the card gets focus back when it closes. */
  const close = () => {
    const id = selected ?? group?.[0];
    const back = returnTo.current;
    setSelected(null);
    setGroup(null);
    requestAnimationFrame(() => {
      const target = back?.isConnected ? back : id ? box.current?.querySelector<HTMLElement>(`[data-pins~="${CSS.escape(id)}"]`) : null;
      target?.focus();
    });
  };

  // The card takes focus so its actions are next for keyboard and screen reader users.
  useEffect(() => {
    if (selected || group) card.current?.querySelector<HTMLElement>("[data-card-title]")?.focus();
  }, [selected, group]);

  /** What gets focus back when the card closes: the list row that opened it, else the pin (null). */
  const remember = (fromMap: boolean) => {
    const a = document.activeElement;
    if (card.current?.contains(a)) return;
    returnTo.current = !fromMap && a instanceof HTMLElement && a !== document.body ? a : null;
  };

  const choose = (id: string, fromMap = false) => {
    remember(fromMap);
    setGroup(null);
    setSelected(id);
  };

  const place = async (at: LatLng) => {
    if (!pickItem) return;
    const r = await apply([{ op: "item.update", id: pickItem.id, set: { place: { lat: roundCoord(at.lat), lng: roundCoord(at.lng) } } }], { message: `Pinned ${pickItem.title} on the map` });
    if (r.ok) {
      setPicking(null);
      setSelected(pickItem.id);
    }
  };

  const startPick = (item: Item) => {
    if (fullScreen) {
      setSelected(null);
      setPicking(item.id);
    } else setFull({ day: activeDay, pickId: item.id });
  };

  // Full screen keeps the map big: what isn't on it yet folds into the list below it.
  const missingList = missing.length > 0 && (
    <section aria-labelledby={`${headingId}-missing`} className="flex shrink-0 flex-col gap-1.5">
      <h3 id={`${headingId}-missing`} className="px-1 text-sm font-bold text-muted">
        No location yet
      </h3>
      <ul className="flex flex-col gap-1.5">
        {missing.map((s) => (
          <MissingRow key={s.item.id} stop={s} notFound={backfill.notFound.has(s.item.id)} busy={backfill.busy} onAddress={() => setAddressFor(s.item)} onPin={() => startPick(s.item)} onOpen={() => go({ tab: "item", itemId: s.item.id })} />
        ))}
      </ul>
    </section>
  );

  const placesWord = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;
  const googleRoute = activeDay ? routeUrl(stops.map((s) => s.item), trip) : null;
  const google = googleRoute ?? mapsSearchUrl(variant === "item" && selectedStop ? selectedStop.item.title : trip.destination);
  const title = variant === "day" && activeDay ? `${weekday(activeDay, true)}'s map` : variant === "item" ? "On the map" : "Trip map";
  const heightCls = fullScreen ? "min-h-0 flex-1" : variant === "item" ? "h-48" : "h-72 sm:h-80";

  return (
    <section aria-labelledby={headingId} className={`flex min-w-0 flex-col gap-3 ${fullScreen ? "h-full" : ""} ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className={variant === "item" ? "sr-only" : "text-base font-extrabold sm:text-lg"}>
            {title}
          </h2>
          {variant !== "item" && (
            <p className="text-sm text-muted" role="status">
              {backfill.busy ? "Finding places on the map…" : `${placesWord(pins.length)} on the map${missing.length ? `, ${missing.length} not yet` : ""}`}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {variant !== "item" && (
            <a href={google} target="_blank" rel="noreferrer" className={`${btn.quiet} px-2 text-sm`}>
              Google Maps
              <Icon name="external" className="size-4" />
            </a>
          )}
          {fullScreen && onClose && (
            <button type="button" onClick={onClose} className={`${btn.secondary} px-3`}>
              <Icon name="close" className="size-4" />
              Close
            </button>
          )}
        </div>
      </div>

      {variant === "plan" && days.length > 0 && (
        <div role="group" aria-label="Show a day" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <DayChip active={!activeDay} onClick={() => setChosenDay(null)}>
            All
          </DayChip>
          {days.map((d) => (
            <DayChip
              key={d}
              active={activeDay === d}
              onClick={() => {
                setChosenDay(d);
                setSelected(null);
                setGroup(null);
              }}
            >
              {weekday(d)} {Number(d.slice(8))}
            </DayChip>
          ))}
        </div>
      )}

      <div
        ref={box}
        data-route-stops={route?.length ?? 0}
        onKeyDown={(e) => {
          if (e.key === "Escape" && (selected || group)) {
            e.stopPropagation();
            close();
          }
        }}
        className={`relative w-full overflow-hidden rounded-2xl border border-line bg-sunken ${heightCls}`}
      >
        {wantMap && Canvas && !failed ? (
          <Canvas
            label={variant === "day" && activeDay ? `Map of ${weekday(activeDay, true)}` : `Map of ${trip.name}`}
            pins={pins}
            frame={frame}
            frameKey={`${activeDay ?? "all"}:${variant}`}
            route={route}
            selected={selected}
            onSelect={(id) => choose(id, true)}
            onGroup={(ids) => {
              remember(true);
              setSelected(null);
              setGroup(ids);
            }}
            picking={pickItem ? { title: pickItem.title } : null}
            onPick={place}
            onCancelPick={() => setPicking(null)}
            cooperative={!fullScreen}
            onFullScreen={fullScreen ? undefined : () => setFull({ day: activeDay, itemId: selected ?? itemId })}
            onError={() => setFailed("draw")}
          />
        ) : (
          <MapPlaceholder>
            {failed === "draw"
              ? "This device can't draw the map. Every place is in the list below."
              : failed === "load"
                ? "The map needs a connection the first time it opens. Every place is in the list below."
                : !wantMap
                  ? variant === "item"
                    ? "Not on the map yet."
                    : backfill.busy
                      ? "Finding places on the map…"
                      : "Nothing on the map yet. Add an address to anything on the trip and it shows up here."
                  : "Loading the map…"}
          </MapPlaceholder>
        )}

        {(selectedStop || groupStops.length > 0) && variant !== "item" && (
          <div ref={card} className="absolute inset-x-2 bottom-9 z-20 sm:inset-x-3">
            {selectedStop ? (
              <PinCard stop={selectedStop} trip={trip} onClose={close} onOpen={() => go({ tab: "item", itemId: selectedStop.item.id })} />
            ) : (
              <GroupCard stops={groupStops} trip={trip} onClose={close} onChoose={choose} />
            )}
          </div>
        )}
      </div>

      {variant === "item" && !pins.length && stops[0] && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => startPick(stops[0].item)} className={btn.secondary}>
            <Icon name="pin" className="size-4" />
            Drop a pin on the map
          </button>
        </div>
      )}

      {variant !== "item" && (pins.length > 0 || missing.length > 0) && (
        <details className="group shrink-0 rounded-2xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-bold">
            <span>
              List of places
              <span className="font-semibold text-muted">
                {" "}
                ({placesWord(pins.length)} on the map{missing.length ? `, ${missing.length} not yet` : ""})
              </span>
            </span>
            <Icon name="chevronDown" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className={`flex flex-col gap-3 px-2 pb-2 ${fullScreen ? "max-h-[38dvh] overflow-y-auto" : ""}`}>
            {pins.length > 0 && (
              <ol aria-label="On the map" className="flex flex-col gap-1">
                {located.map((s, i) => (
                  <li key={s.item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        choose(s.item.id);
                        box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      }}
                      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left hover:bg-sunken"
                    >
                      <KindChip kind={s.item.kind} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {activeDay ? `${i + 1}. ` : ""}
                        {pins[i].label}
                      </span>
                      {status(s.item) && <StatusPill status={status(s.item)!.status} label={status(s.item)!.word} />}
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {fullScreen && missingList}
          </div>
        </details>
      )}

      {!fullScreen && missingList}

      {addressFor && <AddressSheet item={addressFor} onClose={() => setAddressFor(null)} save={(set) => apply([{ op: "item.update", id: addressFor.id, set: { place: set } }], { message: `Saved where ${addressFor.title} is` })} />}

      {full && (
        <MapDialog onClose={() => setFull(null)}>
          <TripMap variant="plan" go={go} day={full.day} itemId={full.itemId} pickId={full.pickId} fullScreen onClose={() => setFull(null)} />
        </MapDialog>
      )}
    </section>
  );
}

function DayChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tnum min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-bold transition-colors ${active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-ink hover:bg-sunken"}`}
    >
      {children}
    </button>
  );
}

function MapPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">
      <Icon name="map" className="size-8" />
      <p className="max-w-xs">{children}</p>
    </div>
  );
}

function CardShell({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div role="region" aria-label="Selected place" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 text-ink shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <h3 data-card-title tabIndex={-1} className="min-w-0 pt-1 text-base leading-snug font-bold outline-none">
          {title}
        </h3>
        <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken">
          <Icon name="close" className="size-5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function PinCard({ stop, trip, onClose, onOpen }: { stop: Stop; trip: Trip; onClose: () => void; onOpen: () => void }) {
  const item = stop.item;
  const st = status(item);
  const dir = directionsUrl(item.place, trip);
  return (
    <CardShell title={titleOf(stop)} onClose={onClose}>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={itemPhotoUrl(item, trip)} alt="" loading="lazy" className="cover-photo size-20 shrink-0 rounded-xl bg-sunken object-cover" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-sm text-muted">{whenWords(stop, trip)}</p>
          {(item.place?.name || item.place?.address) && <p className="truncate text-sm">{item.place.address || item.place.name}</p>}
          {st && (
            <span>
              <StatusPill status={st.status} label={st.word} />
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {dir && (
          <a href={dir} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:bg-sunken">
            <Icon name="directions" className="size-4" />
            Directions
          </a>
        )}
        <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-on-accent">
          Open
          <Icon name="chevronRight" className="size-4" />
        </button>
      </div>
    </CardShell>
  );
}

function GroupCard({ stops, trip, onClose, onChoose }: { stops: Stop[]; trip: Trip; onClose: () => void; onChoose: (id: string) => void }) {
  return (
    <CardShell title={`${stops.length} places here`} onClose={onClose}>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {stops.map((s) => (
          <li key={s.item.id}>
            <button type="button" onClick={() => onChoose(s.item.id)} className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-1 text-left hover:bg-sunken">
              <KindChip kind={s.item.kind} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{titleOf(s)}</span>
                <span className="block truncate text-xs text-muted">{whenWords(s, trip)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function MissingRow({ stop, notFound, busy, onAddress, onPin, onOpen }: { stop: Stop; notFound: boolean; busy: boolean; onAddress: () => void; onPin: () => void; onOpen: () => void }) {
  const { trip } = useTrip();
  const p = stop.item.place;
  const text = p?.address || p?.name;
  const why = !text && !p?.mapsUrl ? "No address yet" : notFound ? `Couldn't find “${text ?? "that link"}” on the map` : busy ? "Finding it on the map…" : `“${text ?? "Maps link"}” isn't on the map yet`;
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-2">
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left">
        <KindChip kind={stop.item.kind} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{titleOf(stop)}</span>
          <span className="block truncate text-xs text-muted">
            {whenWords(stop, trip)}. {why}
          </span>
        </span>
      </button>
      <span className="flex flex-wrap gap-1.5 pl-9">
        <button type="button" onClick={onAddress} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-semibold text-accent hover:bg-sunken">
          Add address
        </button>
        <button type="button" onClick={onPin} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent hover:bg-sunken">
          <Icon name="pin" className="size-4" />
          Drop a pin
        </button>
      </span>
    </li>
  );
}

function AddressSheet({ item, onClose, save }: { item: Item; onClose: () => void; save: (set: { address?: string | null; mapsUrl?: string | null }) => Promise<{ ok: boolean; error?: string }> }) {
  const [value, setValue] = useState(item.place?.address ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title={`Where is ${item.title}?`}>
      <form
        className="flex flex-col gap-3 px-5 pb-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return setError("Type an address, or paste a Google Maps link.");
          const set = /^https?:\/\//i.test(v) ? { mapsUrl: v } : { address: v };
          const r = await save(set);
          if (r.ok) onClose();
          else setError(r.error ?? "That didn't save.");
        }}
      >
        <label className={fieldLabel}>
          Address or Google Maps link
          <input data-autofocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000} autoComplete="street-address" className={field} />
        </label>
        <p className="text-sm text-muted">The pin is found from the address with OpenStreetMap. If it lands in the wrong place, drop the pin by hand instead.</p>
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="submit" className={btn.primary}>
          Save
        </button>
      </form>
    </Sheet>
  );
}

/** Full screen: a modal dialog over everything, Escape or Close to leave. */
export function MapDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-label="Trip map" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-canvas p-3 text-ink sm:p-4">
      {children}
    </dialog>
  );
}
