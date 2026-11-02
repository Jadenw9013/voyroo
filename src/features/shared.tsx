"use client";

import type { ReactNode } from "react";
import { rowVerb, type Row } from "@/domain/derive";
import { liveComments } from "@/domain/discuss";
import { isPost, itemPhotoUrl } from "@/domain/links";
import { formatDay, formatTime, zoneName } from "@/domain/time";
import type { Item, Trip, When } from "@/domain/types";
import { useTrip } from "@/client/store";
import { StatusPill } from "@/ui/badges";
import { PICTURED, StopMedia } from "@/ui/StopMedia";
import { Icon } from "@/ui/Icon";

/** "7:00 PM", plus the zone in words when it isn't the trip's ("11:30 AM Pacific Time"). */
export function timeLabel(when: When | null | undefined, trip: Pick<Trip, "tz">): string | null {
  if (!when?.time) return null;
  const t = formatTime(when.time);
  return when.tz && when.tz !== trip.tz ? `${t} ${zoneName(when.tz)}` : t;
}

/** "Thu Nov 26, 7:00 PM" or "Thu Nov 26". */
export function whenLabel(when: When | null | undefined, trip: Pick<Trip, "tz">): string {
  if (!when) return "No day yet";
  const t = timeLabel(when, trip);
  return t ? `${formatDay(when.date)}, ${t}` : formatDay(when.date);
}

/** "Check out: Lumina" for end rows and check-ins, else the title. */
export function rowTitle(row: Row): string {
  const verb = rowVerb(row);
  return verb ? `${verb}: ${row.item.title}` : row.item.title;
}

/** Status pills after a title: booked, to book, maybe; and how many posts, links and comments it has. */
export function Marks({ item }: { item: Item }) {
  const links = (item.links ?? []).filter((l) => !isPost(l.kind)).length;
  const posts = (item.links ?? []).length - links;
  const comments = liveComments(item).length;
  if (!item.booking && !item.maybe && !links && !posts && !comments) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {item.booking?.state === "booked" && <StatusPill status="booked" />}
      {item.booking?.state === "todo" && <StatusPill status="todo" />}
      {item.maybe && <StatusPill status="maybe" />}
      {posts > 0 && (
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <Icon name="image" className="size-4" />
          {posts}
          <span className="sr-only">{posts === 1 ? "post" : "posts"}</span>
        </span>
      )}
      {links > 0 && (
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <Icon name="link" className="size-4" />
          {links}
          <span className="sr-only">{links === 1 ? "link" : "links"}</span>
        </span>
      )}
      {comments > 0 && (
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <Icon name="message" className="size-4" />
          {comments}
          <span className="sr-only">{comments === 1 ? "comment" : "comments"}</span>
        </span>
      )}
    </span>
  );
}

/**
 * One line in a day or a list, read like a departure board: the time in its
 * own column, the place's picture (or the kind's tile), the title, where, and
 * its status. The whole row opens the item; deleting lives on the item's page,
 * away from the thumb's path. `footer` sits under it, outside the tap target.
 */
export function ItemRow({ row, item, onOpen, footer }: { row?: Row; item: Item; onOpen: () => void; footer?: ReactNode }) {
  const { trip, justChanged } = useTrip();
  const when = row ? row.when : item.start;
  const zone = when?.time && when.tz && when.tz !== trip.tz ? zoneName(when.tz).replace(/ Time$/, "") : null;
  const title = row ? rowTitle(row) : item.title;
  const place = item.place?.name || item.place?.address;
  const ending = row?.part === "end";
  // A check-out repeats a stay that already has its picture: a quiet tile instead.
  const src = ending || !PICTURED.has(item.kind) ? null : itemPhotoUrl(item, trip);

  return (
    <li className={`relative ${justChanged.has(item.id) ? "just-changed rounded-xl" : ""}`}>
      <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-sunken">
        {row && (
          <span className="w-18 shrink-0 pt-1.5 text-sm leading-snug">
            {when?.time ? <time className="block font-bold whitespace-nowrap text-ink">{formatTime(when.time)}</time> : <span className="block text-muted">Anytime</span>}
            {zone && <span className="block text-muted">{zone}</span>}
          </span>
        )}
        <StopMedia kind={item.kind} src={src} dim={ending} />
        <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
          <span className={`text-base leading-snug font-semibold ${ending ? "text-muted" : ""}`}>{title}</span>
          {place && !ending && <span className="truncate text-sm text-muted">{place}</span>}
          {!ending && <Marks item={item} />}
        </span>
      </button>
      {footer}
    </li>
  );
}

/** The last stop on a day's rail: a dashed circle to add the next thing, quieter than the stops themselves. */
export function AddStop({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <li>
      <button type="button" onClick={onAdd} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
        <span aria-hidden="true" className="w-18 shrink-0" />
        <span className="flex w-14 shrink-0 justify-center">
          <span className="relative flex size-8 items-center justify-center rounded-full border-2 border-dashed border-line-strong bg-canvas">
            <Icon name="plus" className="size-4" />
          </span>
        </span>
        {label}
      </button>
    </li>
  );
}
