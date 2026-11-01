/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { previewTrip } from "@/server/preview";
import { directionsUrl, itemPhotoUrl, mapsLink, routeUrl, tripCoverUrl } from "@/domain/links";
import { dayRange, formatDay, formatTime, instantOf } from "@/domain/time";
import type { Item, ItemKind, Trip } from "@/domain/types";
import { Icon, KIND_ICON } from "@/ui/Icon";
import { PrintTrip } from "@/features/trip/PrintTrip";
import { Brand } from "@/ui/Brand";
import { PreviewUpdates } from "@/features/trip/PreviewUpdates";

export const metadata: Metadata = { title: "Trip itinerary", robots: { index: false, follow: false }, referrer: "no-referrer" };

const KIND_LABEL: Record<ItemKind, string> = {
  stay: "Stay",
  flight: "Flight",
  transport: "Transport",
  activity: "Activity",
  food: "Food & Drink",
  other: "Stop",
};

export default async function PreviewPage({ params }: { params: Promise<{ tripId: string; token: string }> }) {
  await connection();
  const { tripId, token } = await params;
  const state = await previewTrip(tripId, token);
  if (!state) notFound();
  const { trip, travelers } = state;
  const access = { tripId, token };
  const days = [...new Set([...dayRange(trip.startDate, trip.endDate), ...trip.items.flatMap((item) => item.start ? [item.start.date] : [])])].sort();
  const ideas = trip.items.filter((item) => !item.start);
  const scheduledItems = trip.items.filter((item) => !!item.start);
  const staysCount = trip.items.filter((item) => item.kind === "stay").length;
  const bookedCount = trip.items.filter((item) => item.booking?.state === "booked").length;

  // Curate visual highlights prioritizing stays, activities, food, and iconic stops
  const highlightCandidates = [...trip.items].sort((a, b) => {
    const score = (item: Item) => (item.kind === "stay" ? 4 : item.kind === "activity" ? 3 : item.kind === "food" ? 2 : item.kind === "flight" ? 0 : 1);
    return score(b) - score(a);
  });
  const highlights = highlightCandidates.filter((item) => item.kind !== "flight").slice(0, 6);

  return (
    <div className="trip-presentation">
      <PreviewUpdates key={`${tripId}:${token}`} version={state.version} />
      <header className="presentation-toolbar">
        <Brand linked={false} />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-muted">
            <Icon name="sparkles" className="size-3.5 text-accent" />
            Shared Travel Guide
          </span>
          <PrintTrip />
        </div>
      </header>
      <main id="main" className="presentation-main">
        <div className="presentation-hero">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="presentation-destination">
                <Icon name="pin" />
                {trip.destination}
              </p>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-muted">
                {trip.tz} · {trip.currency}
              </span>
            </div>
            <h1>{trip.name}</h1>
            <p className="presentation-dates">
              {formatDay(trip.startDate)}, {trip.startDate.slice(0, 4)} — {formatDay(trip.endDate)}, {trip.endDate.slice(0, 4)}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The group’s live visual itinerary. All times are local to {trip.tz} unless noted otherwise.
            </p>
            <div className="presentation-stats">
              <div className="presentation-stat">
                <span className="presentation-stat-value">{days.length}</span>
                <span className="presentation-stat-label">{days.length === 1 ? "Day" : "Days"}</span>
              </div>
              <div className="presentation-stat">
                <span className="presentation-stat-value">{scheduledItems.length}</span>
                <span className="presentation-stat-label">Planned Stops</span>
              </div>
              <div className="presentation-stat">
                <span className="presentation-stat-value">{staysCount}</span>
                <span className="presentation-stat-label">{staysCount === 1 ? "Stay" : "Stays"}</span>
              </div>
              <div className="presentation-stat">
                <span className="presentation-stat-value">{bookedCount}</span>
                <span className="presentation-stat-label">Booked</span>
              </div>
              {travelers > 0 && (
                <div className="presentation-stat">
                  <span className="presentation-stat-value">{travelers}</span>
                  <span className="presentation-stat-label">{travelers === 1 ? "Traveler" : "Travelers"}</span>
                </div>
              )}
            </div>
          </div>
          <div className="presentation-cover-wrap">
            <img
              src={withAccess(tripCoverUrl(trip), access)}
              alt={`${trip.destination} destination cover`}
              className="presentation-cover-img"
              loading="eager"
              decoding="async"
            />
            <div className="presentation-cover-overlay">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                <Icon name="globe" className="size-3.5 text-accent" />
                {trip.destination}
              </span>
            </div>
          </div>
        </div>

        {highlights.length > 0 && (
          <section aria-label="Trip visual highlights" className="presentation-highlights">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold tracking-[0.14em] text-accent uppercase">Visual Overview</p>
                <h2 className="text-lg font-bold tracking-tight">Key Places & Experiences</h2>
              </div>
              <span className="text-xs text-muted">Tap any card to jump to details</span>
            </div>
            <div className="presentation-highlights-grid">
              {highlights.map((item, idx) => (
                <a key={item.id} href={`#item-${item.id}`} className="presentation-highlight-card group">
                  <div className="presentation-highlight-img-wrap">
                    <img
                      src={withAccess(itemPhotoUrl(item, trip, idx), access)}
                      alt={item.title}
                      className="presentation-highlight-img"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="presentation-highlight-shade" />
                    <span className="presentation-highlight-badge">
                      <Icon name={KIND_ICON[item.kind]} className="size-3" />
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span className="presentation-highlight-day">
                      {item.start ? formatDay(item.start.date) : "Saved Idea"}
                    </span>
                  </div>
                  <div className="presentation-highlight-body">
                    <h3 className="truncate text-sm font-bold text-ink group-hover:text-accent">{item.title}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.place?.name || item.place?.address || trip.destination}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <nav aria-label="Itinerary days" className="presentation-days">
          {days.map((day, idx) => {
            const count = trip.items.filter((item) => item.start?.date === day).length;
            return (
              <a key={day} href={`#day-${day}`}>
                <span className="text-[10px] font-bold tracking-wider uppercase opacity-75">Day {idx + 1}</span>
                <span>{formatDay(day)}</span>
                {count > 0 && <span className="presentation-day-pill-count">{count}</span>}
              </a>
            );
          })}
          {ideas.length > 0 && (
            <a href="#ideas">
              <span className="text-[10px] font-bold tracking-wider uppercase opacity-75">Unscheduled</span>
              <span>Ideas</span>
              <span className="presentation-day-pill-count">{ideas.length}</span>
            </a>
          )}
        </nav>

        {days.map((day, dayIdx) => {
          const items = trip.items
            .filter((item) => item.start?.date === day)
            .sort((a, b) => {
              const atA = instantOf(a.start, trip.tz);
              const atB = instantOf(b.start, trip.tz);
              if (atA !== null && atB !== null) return atA - atB;
              if (atA !== null) return -1;
              if (atB !== null) return 1;
              return (a.start?.time || "").localeCompare(b.start?.time || "");
            });
          const stays = trip.items.filter(
            (item) => item.kind === "stay" && item.start && item.start.date < day && item.end && item.end.date > day
          );
          const featuredItem = items.find((i) => i.kind !== "flight") || items[0] || stays[0];
          const dayRoute = routeUrl([...stays, ...items], trip);

          return (
            <section id={`day-${day}`} key={day} className="presentation-day">
              <header className="presentation-day-sidebar">
                <div className="flex items-center justify-between gap-2 md:block">
                  <div>
                    <p className="text-xs font-bold tracking-wider text-accent uppercase">
                      Day {dayIdx + 1} · {day.slice(0, 4)}
                    </p>
                    <h2>{formatDay(day)}</h2>
                  </div>
                  <span className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-semibold text-muted">
                    {items.length} {items.length === 1 ? "stop" : "stops"}
                  </span>
                </div>

                {featuredItem && (
                  <div className="presentation-day-snapshot">
                    <img
                      src={withAccess(itemPhotoUrl(featuredItem, trip, dayIdx), access)}
                      alt={featuredItem.title}
                      className="presentation-day-snapshot-img"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="presentation-day-snapshot-caption">
                      <span className="text-[10px] font-bold tracking-wider text-accent uppercase">Day Snapshot</span>
                      <p className="truncate text-xs font-semibold text-white">{featuredItem.title}</p>
                    </div>
                  </div>
                )}

                {dayRoute && (
                  <a
                    href={dayRoute}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="presentation-day-route"
                  >
                    <Icon name="route" className="size-3.5 text-accent" />
                    <span>Open Day Route in Maps</span>
                  </a>
                )}
              </header>

              <div className="presentation-events">
                {stays.map((stay, stayIdx) => {
                  const stayMap = mapsLink(stay.place, trip);
                  return (
                    <div key={stay.id} className="presentation-stay">
                      <img
                        src={withAccess(itemPhotoUrl(stay, trip, stayIdx), access)}
                        alt={stay.title}
                        className="presentation-stay-thumb"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider text-accent uppercase">
                            <Icon name="bed" className="size-3.5" />
                            Overnight Base
                          </span>
                          {stay.end && (
                            <span className="text-xs text-muted">
                              · Check-out {formatDay(stay.end.date)}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm font-bold text-ink">Staying at {stay.title}</p>
                        {stay.place && (
                          <p className="truncate text-xs text-muted">
                            {[stay.place.name, stay.place.address].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                      {stayMap && (
                        <a
                          href={stayMap}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="presentation-action-pill"
                        >
                          <Icon name="pin" className="size-3.5" />
                          <span>Map</span>
                        </a>
                      )}
                    </div>
                  );
                })}
                {items.length ? (
                  items.map((item, idx) => <PreviewItem key={item.id} item={item} trip={trip} tz={trip.tz} idx={idx} access={access} />)
                ) : (
                  <div className="presentation-empty-day">
                    <Icon name="sparkles" className="size-5 text-accent" />
                    <div>
                      <p className="text-sm font-semibold text-ink">Open day to explore {trip.destination}</p>
                      <p className="text-xs text-muted">Room to wander, relax, or pick from saved ideas below.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {ideas.length > 0 && (
          <section id="ideas" className="presentation-day">
            <header className="presentation-day-sidebar">
              <p className="text-xs font-bold tracking-wider text-accent uppercase">Saved Bucket List</p>
              <h2>Ideas</h2>
              <p className="mt-1 text-xs text-muted">
                Unscheduled spots & activities saved by the group for flexible downtime.
              </p>
            </header>
            <div className="presentation-events">
              {ideas.map((item, idx) => (
                <PreviewItem key={item.id} item={item} trip={trip} tz={trip.tz} idx={idx} access={access} />
              ))}
            </div>
          </section>
        )}
        <footer className="presentation-footer">
          Shared with Voyroo. Plans and photos update automatically as the group refines their itinerary.
        </footer>
      </main>
    </div>
  );
}

/** Photo lookups need trip access; on this page, the viewing token is that access. */
function withAccess(src: string, access: { tripId: string; token: string }): string {
  return src.startsWith("/api/photo?") ? `${src}&trip=${encodeURIComponent(access.tripId)}&token=${access.token}` : src;
}

function PreviewItem({ item, trip, tz, idx, access }: { item: Item; trip: Trip; tz: string; idx: number; access: { tripId: string; token: string } }) {
  const mapUrl = mapsLink(item.place, trip);
  const dirUrl = directionsUrl(item.place, trip);
  const photoUrl = withAccess(itemPhotoUrl(item, trip, idx), access);

  return (
    <article id={`item-${item.id}`} className="presentation-event">
      <div className="presentation-event-main">
        <div className="presentation-time">
          <span className="presentation-time-primary">
            {item.start?.time ? formatTime(item.start.time) : "Flexible"}
          </span>
          {item.end?.time && item.end.date === item.start?.date && (
            <small className="mt-0.5">to {formatTime(item.end.time)}</small>
          )}
          {item.start?.tz && item.start.tz !== tz && <small>{item.start.tz}</small>}
          <span className="presentation-kind-chip">
            <Icon name={KIND_ICON[item.kind]} className="size-3" />
            {KIND_LABEL[item.kind]}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2.5">
            <Icon name={KIND_ICON[item.kind]} className="mt-1 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <h3>{item.title}</h3>
              {item.place && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <Icon name="pin" className="size-3.5 shrink-0 text-accent/80" />
                  <span className="truncate">{[item.place.name, item.place.address].filter(Boolean).join(", ")}</span>
                </p>
              )}
            </div>
          </div>

          <div className="presentation-event-meta">
            {item.end && (item.end.date !== item.start?.date || item.kind === "stay") && (
              <span className="presentation-meta-badge">
                {item.kind === "stay" ? "Check-out" : "Until"}: {formatDay(item.end.date)}
                {item.end.time ? ` at ${formatTime(item.end.time)}` : ""}
                {item.end.tz ? ` (${item.end.tz})` : ""}
              </span>
            )}
            {item.peakM && (
              <span className="presentation-meta-badge">
                Elevation {item.peakM.toLocaleString()}m
              </span>
            )}
            {item.sleepsHere && item.kind !== "stay" && (
              <span className="presentation-meta-badge">
                <Icon name="bed" className="size-3" />
                Overnight camp
              </span>
            )}
            {item.booking && (
              <span
                className={`presentation-meta-badge ${
                  item.booking.state === "booked"
                    ? "presentation-meta-booked"
                    : "presentation-meta-todo"
                }`}
              >
                <Icon name={item.booking.state === "booked" ? "check" : "clock"} className="size-3" />
                {item.booking.state === "booked" ? "Booked" : "Still to book"}
              </span>
            )}
            {item.maybe && (
              <span className="presentation-meta-badge">Tentative</span>
            )}
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="presentation-action-pill"
              >
                <Icon name="pin" className="size-3" />
                <span>View on Map</span>
              </a>
            )}
            {dirUrl && item.kind !== "flight" && (
              <a
                href={dirUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="presentation-action-pill"
              >
                <Icon name="route" className="size-3" />
                <span>Directions</span>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="presentation-event-photo-wrap">
        <img
          src={photoUrl}
          alt={`${item.title} in ${item.place?.name || trip.destination}`}
          className="presentation-event-photo"
          loading="lazy"
          decoding="async"
        />
        <span className="presentation-event-photo-tag">
          {item.place?.name || KIND_LABEL[item.kind]}
        </span>
      </div>
    </article>
  );
}

