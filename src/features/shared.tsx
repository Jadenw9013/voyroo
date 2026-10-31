"use client";

import type { ReactNode } from "react";
import { rowVerb, type Row } from "@/domain/derive";
import { liveComments } from "@/domain/discuss";
import { isPost, itemPhotoUrl } from "@/domain/links";
import { formatDay, formatTime, zoneName } from "@/domain/time";
import type { Item, Trip, When } from "@/domain/types";
import { useTrip } from "@/client/store";
import { KindChip, StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { PostImage } from "./posts/Posts";

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

/** Status pills after a title: booked, to book, maybe; and how many links and comments it has. */
export function Marks({ item }: { item: Item }) {
  const links = (item.links ?? []).filter((l) => !isPost(l.kind)).length;
  const posts = (item.links ?? []).length - links;
  const comments = liveComments(item).length;
  if (!item.booking && !item.maybe && !links && !posts && !comments) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {item.booking?.state === "booked" && <StatusPill status="booked" />}
      {item.booking?.state === "todo" && <StatusPill status="todo" />}
      {item.maybe && <StatusPill status="maybe" />}
      {posts > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted sm:text-sm">
          <Icon name="image" className="size-3.5" />
          {posts}
        </span>
      )}
      {links > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted sm:text-sm">
          <Icon name="link" className="size-3.5" />
          {links}
        </span>
      )}
      {comments > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted sm:text-sm">
          <Icon name="message" className="size-3.5" />
          {comments}
          <span className="sr-only">{comments === 1 ? "comment" : "comments"}</span>
        </span>
      )}
    </span>
  );
}

/** One line in a day or a list: time, kind, title, where, status, and contextual photo/post thumbnail. Taps through to the item. `footer` sits under it, outside the tap target. */
export function ItemRow({ row, item, onOpen, showDate, footer }: { row?: Row; item: Item; onOpen: () => void; showDate?: boolean; footer?: ReactNode }) {
  const { trip, tripId, justChanged, apply } = useTrip();
  const when = row ? row.when : item.start;
  const zone = when?.time && when.tz && when.tz !== trip.tz ? zoneName(when.tz).replace(/ Time$/, "") : null;
  const title = row ? rowTitle(row) : item.title;
  const place = item.place?.name || item.place?.address;
  const ending = row?.part === "end";
  const post = ending ? undefined : item.links?.find((l) => isPost(l.kind));
  const photoUrl = ending ? undefined : itemPhotoUrl(item, trip);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const isBooked = item.booking?.state === "booked";
    if (isBooked) {
      const ok = window.confirm(`"${item.title}" is marked as booked. Delete it anyway?`);
      if (!ok) return;
    }
    await apply([{ op: "item.remove", id: item.id }], {
      confirmed: isBooked,
      message: `Deleted "${item.title}"`,
    });
  };

  return (
    <li className={`group/item relative ${justChanged.has(item.id) ? "just-changed rounded-2xl" : ""}`}>
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-2.5 rounded-2xl border border-line/50 bg-sunken/40 p-2.5 pr-11 text-left transition-colors hover:border-line hover:bg-sunken sm:items-start sm:gap-3 sm:px-3 sm:py-3 sm:pr-12"
        >
          <span className="hidden w-[4.5rem] shrink-0 pt-1 text-right whitespace-nowrap sm:block">
            {showDate && when && <span className="block text-xs font-semibold text-muted">{formatDay(when.date)}</span>}
            {when?.time ? (
              <time className="block text-sm leading-tight font-bold">{formatTime(when.time)}</time>
            ) : (
              !showDate && <span className="block text-xs text-muted">Anytime</span>
            )}
            {zone && <span className="block text-[11px] text-muted">{zone}</span>}
          </span>
          <span className={ending ? "opacity-60" : ""}>
            <KindChip kind={item.kind} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-1 sm:pt-0.5">
            <span className="flex flex-wrap items-center gap-1.5 sm:hidden">
              {showDate && when && <span className="text-[11px] font-bold text-accent">{formatDay(when.date)}</span>}
              {when?.time ? (
                <time className="tnum text-xs font-extrabold text-accent">
                  {formatTime(when.time)}
                  {zone ? ` ${zone}` : ""}
                </time>
              ) : (
                !showDate && <span className="text-[11px] font-medium text-muted">Flexible time</span>
              )}
            </span>
            <span className={`text-sm leading-snug font-bold sm:text-base ${ending ? "text-muted" : ""}`}>{title}</span>
            {place && !ending && <span className="truncate text-xs text-muted sm:text-sm">{place}</span>}
            {!ending && <Marks item={item} />}
          </span>
          {post ? (
            <span className="relative h-14 w-12 shrink-0 overflow-hidden rounded-xl border border-line bg-sunken" aria-hidden="true">
              <PostImage tripId={tripId} entry={{ link: post, item }} />
            </span>
          ) : photoUrl ? (
            <span className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-line bg-sunken" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="" loading="lazy" className="size-full object-cover object-center" />
            </span>
          ) : (
            <Icon name="chevronRight" className="size-4 shrink-0 text-muted" />
          )}
        </button>

        {/* Quick Delete button directly accessible on every item card */}
        <button
          type="button"
          onClick={handleDelete}
          title="Delete item"
          aria-label="Delete item"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-xl bg-canvas/80 text-muted opacity-80 backdrop-blur-md transition-all hover:bg-danger/15 hover:text-danger hover:opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100"
        >
          <Icon name="trash" className="size-3.5" />
        </button>
      </div>
      {footer}
    </li>
  );
}
