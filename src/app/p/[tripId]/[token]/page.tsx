/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { previewTrip } from "@/server/preview";
import { getRouteCache, lookupRoutes } from "@/server/routing";
import { dayRows, ideas, nightOf, nowNext, phase, rowVerb, stayOn, tripDays, type Row } from "@/domain/derive";
import { drivable, emergencyLines, ESSENTIAL_FIELDS } from "@/domain/essentials";
import { directionsUrl, instagramUrl, itemPhotoUrl, mapsLink, postInfo, telUrl, whatsappUrl } from "@/domain/links";
import { dayLegs, describeLeg, routeKeys } from "@/domain/travel";
import { daysBetween, formatDay, formatDuration, formatRange, formatTime, monthDay, todayIn, weekday, zoneName } from "@/domain/time";
import type { Essentials, Item, Trip, When } from "@/domain/types";
import type { TempUnit } from "@/domain/weather";
import { actionClass } from "@/ui/action";
import { KindChip, StatusPill } from "@/ui/badges";
import { railList, StopMedia } from "@/ui/StopMedia";
import { Brand } from "@/ui/Brand";
import { Icon, LINK_ICON } from "@/ui/Icon";
import { ShareDriver } from "@/features/share/ShareDriver";
import { ShareMap } from "@/features/share/ShareMap";
import { ShareWeatherCredit, ShareWeatherLine } from "@/features/share/ShareWeather";
import { LegRow, type Shown } from "@/features/travel/Travel";
import { PreviewUpdates } from "@/features/trip/PreviewUpdates";
import { PrintTrip } from "@/features/trip/PrintTrip";

export const metadata: Metadata = { title: "Trip itinerary", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Access = { tripId: string; token: string };

/**
 * The viewing link: a read-only travel guide for people coming on the trip who
 * don't edit it. During the trip it opens on now and next; then every day, each
 * stop unfolding to its directions, phone, WhatsApp, website and saved posts;
 * then the map and the essentials. Only what `publicTrip` lets through is here.
 */
export default async function PreviewPage({ params }: { params: Promise<{ tripId: string; token: string }> }) {
  await connection();
  const { tripId, token } = await params;
  const state = await previewTrip(tripId, token);
  if (!state) notFound();
  const { trip, travelers, tempUnit, readAt: now } = state;
  const access = { tripId, token };
  const today = todayIn(trip.tz, now);
  const when = phase(trip, now);
  const days = tripDays(trip);
  const saved = ideas(trip);
  const legs = await savedLegs(trip);
  const essentials = trip.essentials && ESSENTIAL_FIELDS.some((f) => trip.essentials![f.key]?.trim()) ? trip.essentials : null;
  const sections = [
    ...(when === "during" ? [["today", "Today"]] : []),
    ["days", "Days"],
    ["map", "Map"],
    ...(essentials ? [["essentials", "Essentials"]] : []),
  ];

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <PreviewUpdates key={`${tripId}:${token}`} version={state.version} />
      <header className="border-b border-line bg-surface pt-[env(safe-area-inset-top)] print:hidden">
        <div className="mx-auto flex h-15 max-w-2xl items-center justify-between gap-3 px-4">
          <Brand linked={false} />
          <PrintTrip />
        </div>
      </header>

      <main id="main" className="mx-auto flex max-w-2xl flex-col gap-10 px-4 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <section className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">{trip.name}</h1>
          <p className="text-base">
            {formatRange(trip.startDate, trip.endDate)}, {trip.startDate.slice(0, 4)}
            {travelers > 0 && `. ${travelers} ${travelers === 1 ? "person" : "people"} going`}.
          </p>
          <p className="text-sm text-muted">Shared travel guide: view only, and it updates when the group changes the plan. Times are local to {trip.destination || trip.name}.</p>
        </section>

        <nav aria-label="On this page" className="-mt-4 print:hidden">
          <ul className="flex gap-1 rounded-xl bg-sunken p-1">
            {sections.map(([id, label]) => (
              <li key={id} className="flex min-w-0 flex-1">
                <a href={`#${id}`} className="flex min-h-11 w-full items-center justify-center rounded-lg px-2 text-base font-semibold text-muted hover:bg-surface hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {when !== "after" && <Upcoming trip={trip} today={today} now={now} when={when} />}

        <section id="days" aria-labelledby="days-title" className="flex scroll-mt-4 flex-col gap-8">
          <h2 id="days-title" className="text-2xl font-bold">
            Day by day
          </h2>
          {days.map((d) => (
            <Day key={d} trip={trip} date={d} today={today} last={d === days.at(-1)} legs={legs} access={access} unit={tempUnit} />
          ))}
          {saved.length > 0 && (
            <section aria-labelledby="ideas-title" className="flex flex-col gap-2">
              <h3 id="ideas-title" className="border-b border-line pb-3 text-xl font-bold">
                Ideas, no day yet
              </h3>
              <ol className="-mx-2 flex flex-col">
                {saved.map((item) => (
                  <Stop key={item.id} trip={trip} item={item} access={access} />
                ))}
              </ol>
            </section>
          )}
          <ShareWeatherCredit tripId={tripId} token={token} />
        </section>

        <section id="map" aria-labelledby="map-title" className="flex scroll-mt-4 flex-col gap-3 print:hidden">
          <h2 id="map-title" className="text-2xl font-bold">
            Map
          </h2>
          <ShareMap trip={trip} photo={access} />
        </section>

        {essentials && <EssentialsSection e={essentials} />}

        <footer className="flex flex-col gap-1 border-t border-line pt-6 text-sm text-muted print:hidden">
          <p>
            Have the passcode?{" "}
            <a href={`/t/${encodeURIComponent(tripId)}/join`} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
              Join to edit
            </a>
          </p>
          <p>Shared with Voyroo.</p>
        </footer>
      </main>
    </div>
  );
}

/** Road times the group's phones have already looked up: free to show, and nothing new is asked of the route service. */
async function savedLegs(trip: Trip): Promise<Map<string, Shown>> {
  const out = new Map<string, Shown>();
  try {
    const { routes } = await lookupRoutes(routeKeys(trip), { cache: getRouteCache(), router: null, allow: async () => false });
    for (const d of tripDays(trip)) {
      for (const leg of dayLegs(trip, d)) {
        const route = routes[leg.key];
        const info = route ? describeLeg(leg, route) : null;
        if (info) out.set(`${d}:${leg.toKey}`, { leg, info });
      }
    }
  } catch {
    // No road times: the days read fine without them.
  }
  return out;
}

/** Photo lookups need trip access; on this page, the viewing token is that access. */
function withAccess(src: string, access: Access): string {
  return src.startsWith("/api/photo?") ? `${src}&trip=${encodeURIComponent(access.tripId)}&token=${access.token}` : src;
}

/** "7:00 PM", plus the zone when it isn't the trip's. */
function timeWords(when: When | null | undefined, trip: Trip): string | null {
  if (!when?.time) return null;
  return when.tz && when.tz !== trip.tz ? `${formatTime(when.time)} ${zoneName(when.tz).replace(/ Time$/, "")}` : formatTime(when.time);
}

const rowTitle = (row: Row) => (rowVerb(row) ? `${rowVerb(row)}: ${row.item.title}` : row.item.title);

function statusOf(item: Item) {
  if (item.booking?.state === "booked") return <StatusPill status="booked" />;
  if (item.booking?.state === "todo") return <StatusPill status="todo" />;
  return null;
}

/** Now and next today (or, before the trip, the first thing), and tonight's bed, with what you need to get there. */
function Upcoming({ trip, today, now, when }: { trip: Trip; today: string; now: number; when: "before" | "during" }) {
  const day = when === "during" ? today : trip.startDate;
  const nn = when === "during" ? nowNext(trip, day, now) : null;
  const first = dayRows(trip, day).find((r) => r.at !== null) ?? null;
  const row = nn ? (nn.now ?? nn.next) : first;
  const label = nn?.now ? "Now" : nn?.next ? "Next" : "First up";
  const until = when === "before" ? (daysBetween(today, trip.startDate) === 1 ? "tomorrow" : `in ${daysBetween(today, trip.startDate)} days`) : !nn?.now && nn?.minutesToNext != null && nn.minutesToNext >= 0 ? `in ${formatDuration(nn.minutesToNext)}` : null;
  const stay = when === "during" ? stayOn(trip, today) : null;
  return (
    <section id="today" aria-labelledby="today-title" className="flex scroll-mt-4 flex-col gap-4">
      <h2 id="today-title" className="text-2xl font-bold">
        {when === "during" ? `Today, ${weekday(today, true)} ${monthDay(today)}` : "Before you go"}
      </h2>
      {row ? (
        <Ticket trip={trip} row={row} label={label} until={until} />
      ) : (
        <p className="text-base text-muted">Nothing else planned for today.</p>
      )}
      {stay && stay.id !== row?.item.id && <Tonight trip={trip} stay={stay} day={today} />}
    </section>
  );
}

function Ticket({ trip, row, label, until }: { trip: Trip; row: Row; label: string; until: string | null }) {
  const item = row.item;
  const place = item.place?.address || item.place?.name;
  const dir = item.kind !== "flight" && (row.part === "start" || item.kind === "stay") ? directionsUrl(item.place, trip) : null;
  const c = item.contact;
  const zone = row.when.tz && row.when.tz !== trip.tz ? zoneName(row.when.tz) : null;
  return (
    <div className="overflow-hidden rounded-3xl bg-ticket text-on-ticket shadow-lift">
      <a href={`#item-${item.id}`} className="flex flex-col gap-1 px-5 pt-4 pb-5">
        <span className="flex items-baseline justify-between gap-3 text-base font-bold">
          <span>{label}</span>
          {until && <span className="tnum font-semibold">{until}</span>}
        </span>
        <time className="tnum text-4xl leading-none font-bold sm:text-5xl">{row.when.time ? formatTime(row.when.time) : formatDay(row.when.date)}</time>
        {zone && <span className="text-sm font-semibold">{zone}</span>}
        <span className="mt-2 text-xl leading-snug font-bold">{rowTitle(row)}</span>
        {place && <span className="text-base">{place}</span>}
      </a>
      {(dir || c?.phone || c?.whatsapp || (row.part === "start" && drivable(item))) && (
        <div className="perforation mx-5 flex flex-wrap gap-2 pt-4 pb-5">
          {dir && (
            <a href={dir} target="_blank" rel="noreferrer" className={actionClass("ticket")}>
              <Icon name="directions" className="size-5" />
              Directions
            </a>
          )}
          {c?.phone && (
            <a href={telUrl(c.phone)} className={actionClass("ticket")}>
              <Icon name="phone" className="size-5" />
              Call
            </a>
          )}
          {c?.whatsapp && (
            <a href={whatsappUrl(c.whatsapp)} target="_blank" rel="noreferrer" className={actionClass("ticket")}>
              <Icon name="whatsapp" className="size-5" />
              WhatsApp
            </a>
          )}
          {row.part === "start" && drivable(item) && <ShareDriver item={item} trip={{ tz: trip.tz, destination: trip.destination }} tone="ticket" />}
        </div>
      )}
    </div>
  );
}

function Tonight({ trip, stay, day }: { trip: Trip; stay: Item; day: string }) {
  const n = nightOf(stay, day);
  return (
    <section aria-labelledby="tonight-title" className="flex flex-col gap-2">
      <h3 id="tonight-title" className="text-lg font-bold">
        Tonight
        {n && n.of > 1 && <span className="font-semibold text-muted">, night {n.night} of {n.of}</span>}
      </h3>
      <a href={`#item-${stay.id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-sunken">
        <KindChip kind={stay.kind} />
        <span className="min-w-0 flex-1 pt-1">
          <span className="block text-base leading-snug font-semibold">{stay.title}</span>
          {(stay.place?.address || stay.place?.name) && <span className="block text-sm text-muted">{stay.place.address || stay.place.name}</span>}
        </span>
      </a>
      <Actions trip={trip} item={stay} part="start" />
    </section>
  );
}

function Day({ trip, date, today, last, legs, access, unit }: { trip: Trip; date: string; today: string; last: boolean; legs: Map<string, Shown>; access: Access; unit: TempUnit }) {
  const rows = dayRows(trip, date);
  const stay = last ? null : stayOn(trip, date);
  const n = stay ? nightOf(stay, date) : null;
  return (
    <section id={`day-${date}`} aria-labelledby={`day-${date}-title`} className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex flex-col gap-1 pb-2">
        <h3 id={`day-${date}-title`} className="text-xl font-bold">
          {weekday(date, true)}, {monthDay(date)}
          {date === today && <span className="ml-2 text-base font-semibold text-muted">Today</span>}
        </h3>
        {stay && (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <Icon name="bed" className="mt-0.5 size-4 shrink-0" />
            <span>
              {stay.title}
              {n && n.of > 1 ? `, night ${n.night} of ${n.of}` : ""}
            </span>
          </p>
        )}
        {last && <p className="text-sm text-muted">Travel home</p>}
        <ShareWeatherLine tripId={access.tripId} token={access.token} date={date} unit={unit} />
      </div>
      {rows.length ? (
        <ol className={railList(false)}>
          {rows.map((r) => (
            <FragmentRow key={r.key} leg={legs.get(`${date}:${r.key}`)}>
              <Stop trip={trip} item={r.item} row={r} access={access} />
            </FragmentRow>
          ))}
        </ol>
      ) : (
        <p className="py-2 text-base text-muted">Nothing planned. A free day.</p>
      )}
    </section>
  );
}

function FragmentRow({ leg, children }: { leg?: Shown; children: ReactNode }) {
  return (
    <>
      <LegRow shown={leg} />
      {children}
    </>
  );
}

/**
 * One stop, read like a departure board. It unfolds (no script needed) to the
 * place's picture, what you can do (directions, call, WhatsApp, the driver
 * card, the booking, website, Instagram), when and where, and saved posts.
 */
function Stop({ trip, item, row, access }: { trip: Trip; item: Item; row?: Row; access: Access }) {
  const ending = row?.part === "end";
  const zone = row?.when.time && row.when.tz && row.when.tz !== trip.tz ? zoneName(row.when.tz).replace(/ Time$/, "") : null;
  const place = item.place?.name || item.place?.address;
  const summary = (
    <>
      {row && (
        <span className="w-18 shrink-0 pt-1.5 text-sm leading-snug">
          {row.when.time ? <time className="block font-bold whitespace-nowrap text-ink">{formatTime(row.when.time)}</time> : <span className="block text-muted">Anytime</span>}
          {zone && <span className="block text-muted">{zone}</span>}
        </span>
      )}
      <StopMedia kind={item.kind} src={ending ? null : withAccess(itemPhotoUrl(item, trip), access)} dim={ending} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <span className={`text-base leading-snug font-semibold ${ending ? "text-muted" : ""}`}>{row ? rowTitle(row) : item.title}</span>
        {place && !ending && <span className="truncate text-sm text-muted">{place}</span>}
        {!ending && statusOf(item) && <span className="flex flex-wrap gap-1.5">{statusOf(item)}</span>}
      </span>
    </>
  );
  // A check-out or landing is the same stop as its start: it reads in the day, and unfolds there.
  if (ending) {
    return (
      <li>
        <a href={`#item-${item.id}`} className="flex min-h-14 items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-sunken">
          {summary}
        </a>
      </li>
    );
  }
  const showPhoto = item.kind !== "flight" && item.kind !== "transport";
  const posts = item.links ?? [];
  return (
    <li>
      <details id={`item-${item.id}`} className="group scroll-mt-4 rounded-xl open:bg-surface open:ring-1 open:ring-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-sunken [&::-webkit-details-marker]:hidden">
          {summary}
          <Icon name="chevronDown" className="mt-2.5 size-4 shrink-0 text-muted group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 px-2 pt-1 pb-4">
          {showPhoto && (
            <img src={withAccess(itemPhotoUrl(item, trip), access)} alt="" loading="lazy" className="cover-photo h-40 w-full rounded-xl bg-sunken object-cover" />
          )}
          <Actions trip={trip} item={item} part={row?.part ?? "idea"} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
            <dt className="text-muted">When</dt>
            <dd>{whenWords(item, trip)}</dd>
            {(item.place?.name || item.place?.address) && (
              <>
                <dt className="text-muted">Where</dt>
                <dd className="min-w-0 break-words">{[item.place.name, item.place.address].filter(Boolean).join(", ")}</dd>
              </>
            )}
            {typeof item.peakM === "number" && (
              <>
                <dt className="text-muted">Highest point</dt>
                <dd className="tnum">{item.peakM.toLocaleString("en-US")} m</dd>
              </>
            )}
            {item.sleepsHere && item.kind !== "stay" && (
              <>
                <dt className="text-muted">Night</dt>
                <dd>Overnight here</dd>
              </>
            )}
            {item.maybe && (
              <>
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusPill status="maybe" />
                </dd>
              </>
            )}
          </dl>
          {posts.length > 0 && (
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-semibold text-muted">Saved posts</h4>
              <ul className="flex flex-col">
                {posts.map((l) => {
                  const site = postInfo(l.url)?.platform;
                  const name = site === "tiktok" ? "TikTok" : site === "youtube" ? "YouTube" : "Instagram";
                  return (
                    <li key={l.id}>
                      <a href={l.url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl text-base hover:bg-sunken">
                        <Icon name={LINK_ICON[l.kind]} className="size-5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">Watch on {name}</span>
                          {l.title && <span className="block truncate text-sm text-muted">{l.title}</span>}
                        </span>
                        <Icon name="external" className="size-4 shrink-0 text-muted" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

/** What you can do with a stop, in words. Only what this page may show: no codes, no emails. */
function Actions({ trip, item, part }: { trip: Trip; item: Item; part: Row["part"] | "idea" }) {
  const dir = item.kind !== "flight" && (part === "start" || part === "idea" || item.kind === "stay") ? directionsUrl(item.place, trip) : null;
  const map = !dir ? mapsLink(item.place, trip) : null;
  const c = item.contact;
  const b = item.booking;
  const links: ReactNode[] = [];
  if (dir)
    links.push(
      <a key="dir" href={dir} target="_blank" rel="noreferrer" className={actionClass()}>
        <Icon name="directions" className="size-5" />
        Directions
      </a>,
    );
  if (map)
    links.push(
      <a key="map" href={map} target="_blank" rel="noreferrer" className={actionClass()}>
        <Icon name="pin" className="size-5" />
        Open in Maps
      </a>,
    );
  if (c?.phone)
    links.push(
      <a key="call" href={telUrl(c.phone)} className={actionClass()}>
        <Icon name="phone" className="size-5" />
        Call
      </a>,
    );
  if (c?.whatsapp)
    links.push(
      <a key="wa" href={whatsappUrl(c.whatsapp)} target="_blank" rel="noreferrer" className={actionClass()}>
        <Icon name="whatsapp" className="size-5" />
        WhatsApp
      </a>,
    );
  if (drivable(item)) links.push(<ShareDriver key="driver" item={item} trip={{ tz: trip.tz, destination: trip.destination }} />);
  if (b?.url)
    links.push(
      <a key="book" href={b.url} target="_blank" rel="noreferrer" className={actionClass()}>
        <Icon name="ticket" className="size-5" />
        {b.state === "booked" ? "Booking page" : "Book online"}
      </a>,
    );
  if (c?.website)
    links.push(
      <a key="web" href={c.website} target="_blank" rel="noreferrer" className={actionClass()}>
        <Icon name="globe" className="size-5" />
        Website
      </a>,
    );
  if (c?.instagram)
    links.push(
      <a key="ig" href={instagramUrl(c.instagram)} target="_blank" rel="noreferrer" className={actionClass()}>
        <Icon name="instagram" className="size-5" />
        Instagram
      </a>,
    );
  return links.length ? <div className="flex flex-wrap gap-2">{links}</div> : null;
}

/** "Wed Nov 25, 2:00 PM. Check out Thu Nov 26, 10:00 AM." */
function whenWords(item: Item, trip: Trip): string {
  if (!item.start) return "No day yet";
  const start = `${formatDay(item.start.date)}${timeWords(item.start, trip) ? `, ${timeWords(item.start, trip)}` : ""}`;
  if (!item.end) return start;
  const lead = item.kind === "stay" ? "Check out" : item.kind === "flight" ? "Lands" : "Until";
  const end = item.end.date === item.start.date ? (timeWords(item.end, trip) ?? "") : `${formatDay(item.end.date)}${timeWords(item.end, trip) ? `, ${timeWords(item.end, trip)}` : ""}`;
  return end ? `${start}. ${lead} ${end}` : start;
}

/** The trip's essentials, as the group wrote them. Numbers ring only once someone checked them. */
function EssentialsSection({ e }: { e: Essentials }) {
  const checked = !!e.checkedOn;
  return (
    <section id="essentials" aria-labelledby="essentials-title" className="flex scroll-mt-4 flex-col gap-3">
      <h2 id="essentials-title" className="text-2xl font-bold">
        Essentials
      </h2>
      <p className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${checked ? "bg-ok-soft text-ok" : "border border-todo bg-todo-soft text-todo"}`}>
        <Icon name={checked ? "check" : "clock"} className="mt-0.5 size-4 shrink-0" />
        <span>
          {checked ? (
            <>
              <span className="font-bold">Checked by the group on {formatDay(e.checkedOn!)}.</span> Rules change: verify before you go.
            </>
          ) : (
            <>
              <span className="font-bold">Verify before you go.</span> No one in the group has checked these yet.
            </>
          )}
        </span>
      </p>
      <dl className="flex flex-col divide-y divide-line">
        {ESSENTIAL_FIELDS.filter((f) => e[f.key]?.trim()).map((f) => (
          <div key={f.key} className="py-2.5">
            <dt className="text-sm font-bold text-muted">
              {f.label}
              {f.key === "embassy" && e.nationality ? ` (${e.nationality})` : ""}
              {f.key === "entry" && e.nationality ? ` for ${e.nationality} passports` : ""}
            </dt>
            <dd className="mt-0.5 text-base whitespace-pre-line">
              {f.key === "emergency" ? (
                <ul className="flex flex-col gap-1">
                  {emergencyLines(e.emergency).map((line, i) =>
                    typeof line === "string" ? (
                      <li key={i}>{line}</li>
                    ) : (
                      <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span>{line.label}</span>
                        {checked ? (
                          <a href={telUrl(line.number)} className="tnum inline-flex min-h-11 items-center gap-1.5 font-bold text-accent">
                            <Icon name="phone" className="size-4" />
                            {line.number}
                          </a>
                        ) : (
                          <span className="tnum font-bold">{line.number}</span>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                e[f.key]
              )}
            </dd>
          </div>
        ))}
      </dl>
      {!!e.sources?.length && (
        <div>
          <p className="text-sm font-bold text-muted">Sources</p>
          <ul className="flex flex-wrap gap-x-3">
            {e.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent underline underline-offset-2">
                  {s.title || new URL(s.url).hostname.replace(/^www\./, "")}
                  <Icon name="external" className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
