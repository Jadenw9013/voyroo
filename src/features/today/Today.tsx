"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { dayRows, nightOf, nights, nowNext, phase, stayOn, toBook, tripDays, type Row } from "@/domain/derive";
import { directionsUrl, telUrl, whatsappUrl } from "@/domain/links";
import { daysBetween, formatDay, formatDuration, formatTime, monthDay, todayIn, weekday } from "@/domain/time";
import type { Item } from "@/domain/types";
import { useClock } from "@/client/hooks";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { KindChip, StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { ActionChip, btn, useCopy } from "@/ui/kit";
import { railList } from "@/ui/StopMedia";
import { useCompose } from "../composer/Composer";
import { DriverChip, DriverSheet } from "../essentials/Driver";
import { drivable } from "@/domain/essentials";
import { DayWeatherCard } from "../weather/DayWeather";
import { AddStop, ItemRow, rowTitle, timeLabel } from "../shared";
import { LegRow, useDayLegs } from "../travel/Travel";
import { SyncLine } from "../SyncLine";

/**
 * Today: what's next and how to get there, where you sleep tonight, and the
 * rest of the day. Nothing sits above the Next ticket but the row of days.
 * Before the trip it opens on day one with a countdown.
 */
export function Today({ day: chosen, go, serverNow }: { day?: string; go: (v: View) => void; serverNow: number }) {
  const { trip } = useTrip();
  const nowMs = useClock(serverNow);
  const compose = useCompose();
  const today = todayIn(trip.tz, nowMs);
  const when = phase(trip, nowMs);
  const day = chosen ?? (when === "during" ? today : trip.startDate);
  const rows = dayRows(trip, day);
  const legs = useDayLegs(day);
  const timed = rows.filter((r) => r.at !== null);
  const untimed = rows.filter((r) => r.at === null);
  const isToday = day === today;
  const nn = isToday ? nowNext(trip, day, nowMs) : null;
  const ticketRow = nn ? (nn.now ?? nn.next) : (timed[0] ?? null);
  const ticketLabel = nn?.now ? "Now" : nn?.next ? "Next" : "First up";
  const countdown = when === "before" && day === trip.startDate ? daysBetween(today, trip.startDate) : null;
  const stay = stayOn(trip, day);
  // When the next thing is checking in, the ticket already says where you sleep: one block, not two.
  const stayInTicket = !!stay && ticketRow?.item.id === stay.id;
  const open = (item: Item) => go({ tab: "item", itemId: item.id });

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 md:px-0">
      {/* Which trip this is, for anyone in more than one; the screen's title. */}
      <h1 className="text-2xl font-bold">{trip.name}</h1>
      <DayStrip
        days={tripDays(trip)}
        selected={day}
        today={today}
        noBed={new Set(nights(trip).filter((n) => !n.stay).map((n) => n.date))}
        onPick={(d) => go({ tab: "today", day: d })}
      />

      <div className="mt-2 grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {ticketRow && (
            <Ticket
              row={ticketRow}
              label={ticketLabel}
              until={countdown !== null ? (countdown === 1 ? "tomorrow" : `in ${countdown} days`) : !nn?.now && nn?.minutesToNext != null && nn.minutesToNext >= 0 ? `in ${formatDuration(nn.minutesToNext)}` : null}
              onOpen={() => open(ticketRow.item)}
            />
          )}

          {!stayInTicket && (
            <Tonight
              stay={stay}
              day={day}
              last={day === trip.endDate}
              onOpen={open}
              onFind={() => compose({ ask: true, text: `Find us a place to stay the night of ${formatDay(day)}`, day })}
              onAdd={() => compose({ day, kind: "stay", text: "" })}
            />
          )}

          {when === "before" && day === trip.startDate && <BeforeTrip onTodo={() => go({ tab: "todo" })} />}
        </div>

        <section aria-labelledby="day-title" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="day-title" className="text-xl font-bold">
              {weekday(day, true)}, {monthDay(day)}
              {isToday && <span className="ml-2 text-base font-semibold text-muted">Today</span>}
            </h2>
            <button type="button" onClick={() => go({ tab: "plan", section: "map", day })} className={`${btn.quiet} -mr-3 shrink-0`}>
              <Icon name="map" className="size-5" />
              Map
            </button>
          </div>

          <DayWeatherCard date={day} />

          <div aria-label={`Everything on ${formatDay(day)}`} role="group">
            {rows.length === 0 && <p className="py-2 text-base text-muted">Nothing planned yet for this day.</p>}
            <ol className={railList(true)}>
              {[...timed, ...untimed].map((r) => (
                <Fragment key={r.key}>
                  <LegRow shown={legs.get(r.key)} />
                  <ItemRow row={r} item={r.item} onOpen={() => open(r.item)} />
                </Fragment>
              ))}
              <AddStop label={`Add to ${weekday(day, true)}`} onAdd={() => compose({ day })} />
            </ol>
          </div>

          <SyncLine />
        </section>
      </div>
    </div>
  );
}

function DayStrip({
  days,
  selected,
  today,
  noBed,
  onPick,
}: {
  days: string[];
  selected: string;
  today: string;
  noBed: Set<string>;
  onPick: (d: string) => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector("[aria-current='date']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);
  return (
    <ul ref={ref} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Trip days">
      {days.map((d) => {
        const sel = d === selected;
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onPick(d)}
              aria-current={sel ? "date" : undefined}
              aria-label={`${weekday(d, true)} ${monthDay(d)}${d === today ? ", today" : ""}${noBed.has(d) ? ", nowhere to stay yet" : ""}`}
              className={`flex h-16 w-13 flex-col items-center justify-center rounded-xl leading-none ${sel ? "bg-accent text-on-accent" : "text-ink hover:bg-sunken"} ${d === today && !sel ? "ring-2 ring-accent ring-inset" : ""}`}
            >
              <span className="text-sm font-semibold">{weekday(d)}</span>
              <span className="tnum mt-1 text-lg font-bold">{Number(d.slice(8))}</span>
              <span aria-hidden="true" className={`mt-1 size-1.5 rounded-full ${noBed.has(d) ? "bg-todo" : "bg-transparent"}`} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The one loud thing on the screen: what's next, when, and one tap to get there or call. */
function Ticket({ row, label, until, onOpen }: { row: Row; label: string; until: string | null; onOpen: () => void }) {
  const { trip } = useTrip();
  const copy = useCopy();
  const [showDriver, setShowDriver] = useState(false);
  const item = row.item;
  const place = item.place?.address || item.place?.name;
  // A flight's place is where it lands: no use for directions on the way out.
  const dir = item.kind !== "flight" && (row.part === "start" || item.kind === "stay") ? directionsUrl(item.place, trip) : null;
  const c = item.contact;
  const zone = row.when.tz && row.when.tz !== trip.tz ? timeLabel(row.when, trip)?.replace(/^[\d:]+ [AP]M /, "") : null;
  const hasDriver = row.part === "start" && drivable(item);
  return (
    <section aria-label={label} className="overflow-hidden rounded-3xl bg-ticket text-on-ticket shadow-lift">
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1 px-5 pt-4 pb-5 text-left">
        <span className="flex items-baseline justify-between gap-3 text-base font-bold">
          <span>{label}</span>
          {until && <span className="tnum font-semibold">{until}</span>}
        </span>
        <time className="tnum text-4xl leading-none font-bold sm:text-5xl">{row.when.time ? formatTime(row.when.time) : "Anytime"}</time>
        {zone && <span className="text-sm font-semibold">{zone}</span>}
        <span className="mt-2 text-xl leading-snug font-bold">{rowTitle(row)}</span>
        {place && <span className="text-base">{place}</span>}
      </button>
      {(dir || c?.phone || c?.whatsapp || item.booking?.confirmation || hasDriver) && (
        <div className="perforation mx-5 flex flex-wrap gap-2 pt-4 pb-5">
          {dir && (
            <ActionChip icon="directions" href={dir} tone="ticket">
              Directions
            </ActionChip>
          )}
          {c?.phone && (
            <ActionChip icon="phone" href={telUrl(c.phone)} tone="ticket">
              Call
            </ActionChip>
          )}
          {c?.whatsapp && (
            <ActionChip icon="whatsapp" href={whatsappUrl(c.whatsapp)} tone="ticket">
              WhatsApp
            </ActionChip>
          )}
          {hasDriver && (
            <ActionChip icon="bus" onClick={() => setShowDriver(true)} tone="ticket">
              Show to driver
            </ActionChip>
          )}
          {item.booking?.confirmation && (
            <ActionChip icon="copy" onClick={() => copy(item.booking!.confirmation!, "Confirmation")} tone="ticket">
              <span className="sr-only">Copy confirmation </span>
              <span className="tnum">{item.booking.confirmation}</span>
            </ActionChip>
          )}
        </div>
      )}
      {showDriver && <DriverSheet item={item} onClose={() => setShowDriver(false)} />}
    </section>
  );
}

/** Where you sleep tonight, and the two things you need on the way there. */
function Tonight({
  stay,
  day,
  last,
  onOpen,
  onFind,
  onAdd,
}: {
  stay: Item | null;
  day: string;
  last: boolean;
  onOpen: (i: Item) => void;
  onFind: () => void;
  onAdd: () => void;
}) {
  const { trip } = useTrip();
  const copy = useCopy();
  const [driver, setDriver] = useState(false);
  if (last) return null;
  if (!stay) {
    return (
      <section aria-labelledby="tonight" className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-todo bg-todo-soft p-4">
        <h2 id="tonight" className="flex items-center gap-2 text-base font-bold text-todo">
          <Icon name="bed" />
          Nowhere to stay tonight yet
        </h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAdd} className={btn.secondary}>
            <Icon name="plus" />
            Add a stay
          </button>
          <button type="button" onClick={onFind} className={btn.quiet}>
            <Icon name="search" />
            Find options
          </button>
        </div>
      </section>
    );
  }
  const n = nightOf(stay, day);
  const checkIn = stay.start?.date === day ? timeLabel(stay.start, trip) : null;
  const dir = directionsUrl(stay.place, trip);
  return (
    <section aria-labelledby="tonight" className="flex flex-col gap-3">
      <h2 id="tonight" className="text-lg font-bold">
        Tonight
        {n && n.of > 1 && <span className="font-semibold text-muted">, night {n.night} of {n.of}</span>}
      </h2>
      <button type="button" onClick={() => onOpen(stay)} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-sunken">
        <KindChip kind={stay.kind} />
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-semibold">{stay.title}</span>
          {(stay.place?.address || stay.place?.name) && <span className="block text-sm text-muted">{stay.place.address || stay.place.name}</span>}
          {checkIn && <span className="block text-sm text-muted">Check in {checkIn}</span>}
        </span>
        <Icon name="chevronRight" className="mt-2.5 size-4 shrink-0 text-muted" />
      </button>
      {(dir || stay.booking?.confirmation || stay.place?.address || stay.place?.name) && (
        <div className="flex flex-wrap gap-2">
          {dir && (
            <ActionChip icon="directions" href={dir}>
              Directions
            </ActionChip>
          )}
          <DriverChip item={stay} onOpen={() => setDriver(true)} />
          {stay.booking?.confirmation && (
            <ActionChip icon="copy" onClick={() => copy(stay.booking!.confirmation!, "Confirmation")}>
              <span className="sr-only">Copy confirmation </span>
              <span className="tnum">{stay.booking.confirmation}</span>
            </ActionChip>
          )}
        </div>
      )}
      {driver && <DriverSheet item={stay} onClose={() => setDriver(false)} />}
    </section>
  );
}

/** Before the trip, on day one: how much is still to book, one tap from the list. */
function BeforeTrip({ onTodo }: { onTodo: () => void }) {
  const { trip } = useTrip();
  const n = toBook(trip).length;
  if (!n) return null;
  return (
    <button type="button" onClick={onTodo} className="-mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 text-left hover:bg-sunken">
      <StatusPill status="todo" label={`${n} to book`} />
      <span className="flex-1 text-base">before you go</span>
      <Icon name="chevronRight" className="size-4 text-muted" />
    </button>
  );
}
