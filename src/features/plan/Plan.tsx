"use client";

import { Fragment, useState } from "react";
import { dayRows, ideas, nightOf, stayOn, tripDays } from "@/domain/derive";
import { mostWanted } from "@/domain/discuss";
import { addDays, formatDay, monthDay, weekday } from "@/domain/time";
import type { Item } from "@/domain/types";
import type { PlanSection, View } from "@/client/router";
import { useTrip } from "@/client/store";
import { StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn, SectionNav } from "@/ui/kit";
import { useCompose } from "../composer/Composer";
import { IdeaFooter, IdeaSort, type IdeaOrder } from "../decide/Decide";
import { TripMap } from "../map/TripMap";
import { PostGrid, postsOf } from "../posts/Posts";
import { ItemRow } from "../shared";
import { LegRow, useDayLegs } from "../travel/Travel";
import { SyncLine } from "../SyncLine";
import { DayWeatherLine, WeatherFootnote } from "../weather/DayWeather";
import { PastePlan } from "./PastePlan";

const SECTIONS: { id: PlanSection; label: string }[] = [
  { id: "days", label: "Days" },
  { id: "map", label: "Map" },
  { id: "ideas", label: "Ideas" },
  { id: "posts", label: "Posts" },
];

/**
 * Plan: the whole trip, in four parts named at the top. Days is one scrolling
 * list with each day's stay, weather and travel times; Map shows the same
 * places by day; Ideas are what has no day yet, with the group's votes; Posts
 * are the saved TikToks and Reels.
 */
export function Plan({ section = "days", day, go }: { section?: PlanSection; day?: string; go: (v: View) => void }) {
  const { trip, apply } = useTrip();
  const compose = useCompose();
  const [pasting, setPasting] = useState(false);
  const [ideaSort, setIdeaSort] = useState<IdeaOrder>("added");
  const open = (item: Item) => go({ tab: "item", itemId: item.id });
  const saved = ideas(trip);
  const posts = postsOf(trip);
  const days = tripDays(trip);
  const lastDay = days.at(-1) ?? trip.endDate;

  return (
    <div className="itinerary-view flex flex-col gap-6 px-4 pt-4 md:px-0">
      <h1 className="sr-only">Plan</h1>
      <SectionNav label="Plan" items={SECTIONS} current={section} onPick={(id) => go({ tab: "plan", section: id })} />

      {section === "days" && (
        <section aria-label="Days" className="flex flex-col gap-8">
          {trip.items.length === 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">Make this trip yours</h2>
              <p className="text-base text-muted">Start with where you sleep or how you get there. Ideas without a day go in Ideas.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => compose({ day: trip.startDate, kind: "stay" })} className={btn.primary}>
                  Add a stay
                </button>
                <button type="button" onClick={() => compose({ day: trip.startDate, kind: "flight" })} className={btn.secondary}>
                  Add a flight
                </button>
              </div>
            </div>
          )}
          {days.map((d) => (
            <Day key={d} date={d} last={d === lastDay} onOpen={open} onAdd={() => compose({ day: d })} />
          ))}
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => void apply([{ op: "trip.update", set: { endDate: addDays(lastDay, 1) } }], { message: "Trip extended" })}
              className={`${btn.quiet} -ml-3`}
            >
              <Icon name="plus" className="size-4" />
              Add a day ({formatDay(addDays(lastDay, 1))})
            </button>
            <button type="button" onClick={() => setPasting(true)} className={`${btn.quiet} -ml-3`}>
              <Icon name="plan" className="size-4" />
              Paste a travel plan
            </button>
          </div>
          <WeatherFootnote />
        </section>
      )}

      {section === "map" && <TripMap variant="plan" day={day} go={go} tall />}

      {section === "ideas" && (
        <section aria-label="Ideas" className="flex flex-col gap-3">
          <p className="text-base text-muted">No day yet. Say if you&apos;re in, and see what the rest of the group thinks.</p>
          {saved.length === 0 ? (
            <p className="text-base">Nothing saved without a day. Tap Add or ask and type something with no day, or paste a link.</p>
          ) : (
            <>
              {saved.length > 1 && <IdeaSort value={ideaSort} onChange={setIdeaSort} />}
              <ul className="-mx-2 flex flex-col divide-y divide-line">
                {(ideaSort === "wanted" ? mostWanted(saved) : saved).map((i) => (
                  <ItemRow key={i.id} item={i} onOpen={() => open(i)} footer={<IdeaFooter item={i} onOpen={() => open(i)} />} />
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => compose({})} className={`${btn.quiet} -ml-3 self-start`}>
            <Icon name="plus" />
            Save an idea
          </button>
        </section>
      )}

      {section === "posts" && (
        <section aria-label="Saved posts" className="flex flex-col gap-3">
          {posts.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <div className="flex gap-2">
                {(["tiktok", "instagram", "youtube"] as const).map((n) => (
                  <span key={n} className="flex size-11 items-center justify-center rounded-xl bg-sunken">
                    <Icon name={n} />
                  </span>
                ))}
              </div>
              <p className="text-base">
                <span className="font-semibold">Save the TikToks, Reels and videos that made you want to go.</span> Paste a link in Add or ask, or share it to the app from TikTok or Instagram on Android. They show up here and on the item they&apos;re about.
              </p>
              <button type="button" onClick={() => compose({})} className={btn.primary}>
                <Icon name="link" />
                Paste a link
              </button>
            </div>
          ) : (
            <PostGrid entries={posts} showItem go={go} />
          )}
        </section>
      )}

      <SyncLine />
      {pasting && <PastePlan onClose={() => setPasting(false)} />}
    </div>
  );
}

function Day({ date, last, onOpen, onAdd }: { date: string; last: boolean; onOpen: (i: Item) => void; onAdd: () => void }) {
  const { trip } = useTrip();
  const rows = dayRows(trip, date);
  const legs = useDayLegs(date);
  const stay = last ? null : stayOn(trip, date);
  const n = stay ? nightOf(stay, date) : null;
  return (
    <section id={`day-${date}`} aria-labelledby={`day-${date}-title`} className="scroll-mt-4">
      <div className="flex flex-col gap-1 border-b border-line pb-3">
        <h2 id={`day-${date}-title`} className="text-xl leading-tight font-bold">
          {weekday(date, true)}, {monthDay(date)}
        </h2>
        {!last &&
          (stay ? (
            <p className="flex items-start gap-1.5 text-sm text-muted">
              <Icon name="bed" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                {stay.title}
                {n && n.of > 1 ? `, night ${n.night} of ${n.of}` : ""}
              </span>
            </p>
          ) : (
            <p>
              <StatusPill status="missing" label="No place to stay yet" />
            </p>
          ))}
        {last && <p className="text-sm text-muted">Travel home</p>}
        <DayWeatherLine date={date} />
      </div>
      {rows.length > 0 && (
        <ol className="-mx-2 mt-2 flex flex-col">
          {rows.map((r) => (
            <Fragment key={r.key}>
              <LegRow shown={legs.get(r.key)} />
              <ItemRow row={r} item={r.item} onOpen={() => onOpen(r.item)} />
            </Fragment>
          ))}
        </ol>
      )}
      <button type="button" onClick={onAdd} className={`${btn.quiet} mt-1 -ml-3`}>
        <Icon name="plus" />
        Add to {weekday(date, true)}
      </button>
    </section>
  );
}
