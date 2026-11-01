"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { TripState } from "@/domain/types";
import { tripCoverUrl } from "@/domain/links";
import { formatRange } from "@/domain/time";
import { useView, type View } from "@/client/router";
import { TripProvider, useTrip } from "@/client/store";
import { Avatar } from "@/ui/badges";
import { Icon, type IconName } from "@/ui/Icon";
import { ToastBar } from "@/ui/kit";
import { ComposerProvider, useCompose } from "./composer/Composer";
import { Expenses } from "./expenses/Expenses";
import { ItemPage } from "./item/ItemPage";
import { Plan } from "./plan/Plan";
import { Today } from "./today/Today";
import { Todo } from "./todo/Todo";
import { TripSettings } from "./trip/TripSettings";
import { Brand } from "@/ui/Brand";
import { ShareTrip } from "./trip/ShareTrip";
import { HeldEdits } from "./HeldEdits";

export function TripApp({ tripId, initial, me, serverNow, verified }: { tripId: string; initial: TripState; me: string; serverNow: number; verified?: string[] }) {
  return (
    <TripProvider tripId={tripId} initial={initial} me={me} serverNow={serverNow} verified={verified}>
      <ComposerProvider serverNow={serverNow}>
        <Screens tripId={tripId} serverNow={serverNow} />
      </ComposerProvider>
    </TripProvider>
  );
}

type Tab = "today" | "plan" | "todo" | "trip";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "plan", label: "Plan", icon: "plan" },
  { id: "todo", label: "To-do", icon: "todo" },
  { id: "trip", label: "Trip", icon: "suitcase" },
];

function Screens({ tripId, serverNow }: { tripId: string; serverNow: number }) {
  const { view, go, back } = useView(tripId);
  const active: Tab = view.tab === "item" ? "plan" : view.tab === "expenses" ? "todo" : view.tab;
  const compose = useCompose();
  const { online } = useTrip();
  const [sharing, setSharing] = useState(false);

  // Taps work from here on. Browser tests wait for this before tapping what the server drew.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  // Arrived from the share sheet (/share): open the composer with what was shared.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.hash.slice(1)).get("compose");
    if (!shared) return;
    window.history.replaceState(null, "", window.location.pathname);
    compose({ text: shared });
  }, [compose]);

  return (
    <div className="trip-app-shell relative min-h-dvh w-full pt-[calc(3.75rem+env(safe-area-inset-top))] md:pt-[calc(4rem+env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pl-56 lg:pl-64">
      {/* Phones: the header scrolls away, so the status bar (Dynamic Island, clock) keeps a solid strip behind it. */}
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-surface md:hidden" />
      <TopBar onShare={() => setSharing(true)} onGo={go} />
      <Sidebar active={active} view={view} onPick={(t) => go({ tab: t } as View)} onGo={go} />
      <main id="main" className="mx-auto w-full max-w-6xl min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pt-4 md:pb-16">
        {/* One quiet line while offline, where it's seen first (the sync line at the bottom says when it was saved). */}
        {!online && (
          <p className="flex items-center gap-2 px-4 pt-3 text-sm text-muted md:px-0">
            <Icon name="offline" className="size-4 shrink-0" />
            Offline. Everything here is saved on this phone, and changes sync when you&apos;re back.
          </p>
        )}
        <HeldEdits />
        {view.tab === "today" && <Today day={view.day} go={go} serverNow={serverNow} />}
        {view.tab === "plan" && <Plan section={view.section} day={view.day} go={go} />}
        {view.tab === "todo" && <Todo go={go} />}
        {view.tab === "expenses" && <Expenses go={go} />}
        {view.tab === "trip" && <TripSettings section={view.section} />}
        {view.tab === "item" && <ItemPage key={view.itemId} itemId={view.itemId} go={go} back={() => back({ tab: "plan" })} />}
      </main>
      <BottomBar active={active} onPick={(t) => go({ tab: t } as View)} />
      <ToastBar />
      {sharing && <ShareTrip onClose={() => setSharing(false)} />}
    </div>
  );
}

function AddButton({ big }: { big?: boolean }) {
  const compose = useCompose();
  if (big) {
    // The tab bar's one action: a filled circle with its words under it, so it reads as "add", not as a fifth place to go.
    return (
      <button type="button" onClick={() => compose({})} className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm font-semibold text-ink">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-accent text-on-accent">
          <Icon name="plus" className="size-6" />
        </span>
        Add or ask
      </button>
    );
  }
  return (
    <button type="button" onClick={() => compose({})} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-on-accent">
      <Icon name="plus" className="size-4" />
      Add or ask
    </button>
  );
}

/** Phones: four tabs and the + in thumb reach, on a solid bar (nothing shows through it in the sun). */
function BottomBar({ active, onPick }: { active: Tab; onPick: (t: Tab) => void }) {
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);
  const tab = (t: (typeof TABS)[number]) => (
    <li key={t.id} className="flex flex-1">
      <button
        type="button"
        onClick={() => onPick(t.id)}
        aria-current={active === t.id ? "page" : undefined}
        className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm font-semibold ${active === t.id ? "text-accent" : "text-muted"}`}
      >
        {active === t.id && <span aria-hidden="true" className="absolute top-0 h-1 w-8 rounded-b-full bg-accent" />}
        <Icon name={t.icon} className="size-6" />
        {t.label}
      </button>
    </li>
  );
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch px-1">
        {left.map(tab)}
        <li className="flex flex-1">
          <AddButton big />
        </li>
        {right.map(tab)}
      </ul>
    </nav>
  );
}

/** Tablets and laptops: the same four places, then what lives inside them, one link each. */
function Sidebar({ active, view, onPick, onGo }: { active: Tab; view: View; onPick: (t: Tab) => void; onGo: (v: View) => void }) {
  const { trip } = useTrip();
  const coverSrc = tripCoverUrl(trip);
  const inside: { label: string; icon: IconName; to: View; on: boolean }[] = [
    { label: "Map", icon: "map", to: { tab: "plan", section: "map" }, on: view.tab === "plan" && view.section === "map" },
    { label: "Ideas", icon: "idea", to: { tab: "plan", section: "ideas" }, on: view.tab === "plan" && view.section === "ideas" },
    { label: "Posts", icon: "image", to: { tab: "plan", section: "posts" }, on: view.tab === "plan" && view.section === "posts" },
    { label: "Packing", icon: "backpack", to: { tab: "todo", section: "packing" }, on: view.tab === "todo" && view.section === "packing" },
    { label: "Expenses", icon: "wallet", to: { tab: "expenses" }, on: view.tab === "expenses" },
  ];

  return (
    <aside aria-label="Sidebar" className="fixed top-[calc(4rem+env(safe-area-inset-top))] bottom-0 left-0 z-30 hidden w-56 flex-col justify-between border-r border-line bg-surface p-3 md:flex lg:w-64 lg:p-4">
      <div className="flex flex-col gap-5 overflow-y-auto">
        <nav aria-label="Main">
          <ul aria-label="Trip views" className="flex flex-col gap-1">
            {TABS.map((t) => {
              const isCurrent = active === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onPick(t.id)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-base font-semibold ${isCurrent ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink"}`}
                  >
                    <Icon name={t.icon} className="size-5" />
                    <span>{t.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-line pt-4">
          <h2 className="mb-2 px-3 text-sm font-semibold text-muted">In this trip</h2>
          <ul className="flex flex-col gap-1">
            {inside.map((l) => (
              <li key={l.label}>
                <button
                  type="button"
                  onClick={() => onGo(l.to)}
                  aria-current={l.on ? "page" : undefined}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-base ${l.on ? "bg-sunken font-semibold text-ink" : "text-muted hover:bg-sunken hover:text-ink"}`}
                >
                  <Icon name={l.icon} className="size-5" />
                  <span>{l.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-line pt-4">
          <button type="button" onClick={() => onGo({ tab: "trip" })} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-sunken">
            <span className="cover-photo relative size-11 shrink-0 overflow-hidden rounded-xl bg-sunken">
              <Image src={coverSrc} alt="" fill sizes="44px" unoptimized={coverSrc.startsWith("http") || coverSrc.startsWith("/api/")} className="object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-ink">{trip.name}</span>
              <span className="block truncate text-sm text-muted">{formatRange(trip.startDate, trip.endDate)}</span>
            </span>
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <Link href="/?all=1" prefetch={false} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-sunken hover:text-ink">
          <Icon name="suitcase" className="size-4" />
          All trips
        </Link>
      </div>
    </aside>
  );
}

/**
 * The brand and the trip's outward actions. Phones keep only Share: asking and
 * adding live in the + below, the avatar only led to the Trip tab, and New trip
 * is on the home page behind the logo, so nothing up here looks like a second +.
 * On phones it scrolls away with the page; wider screens keep it fixed.
 */
function TopBar({ onShare, onGo }: { onShare: () => void; onGo: (v: View) => void }) {
  const { me } = useTrip();
  const compose = useCompose();
  return (
    <header className="absolute inset-x-0 top-0 z-40 h-[calc(3.75rem+env(safe-area-inset-top))] border-b border-line bg-surface pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:fixed md:h-[calc(4rem+env(safe-area-inset-top))]">
      <div className="flex h-15 w-full items-center justify-between gap-2 px-4 md:h-16 md:px-5">
        <Brand />

        <button
          type="button"
          onClick={() => compose({})}
          className="hidden min-h-11 max-w-md flex-1 items-center gap-2.5 rounded-full border border-line bg-sunken px-4 text-left text-base text-muted hover:text-ink lg:flex"
        >
          <Icon name="search" className="size-4" />
          <span className="truncate">Add a place, paste a link, or ask</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Share trip"
            onClick={onShare}
            className="flex size-11 items-center justify-center gap-2 rounded-full text-ink hover:bg-sunken md:w-auto md:rounded-xl md:border md:border-line md:px-3 md:text-sm md:font-semibold"
          >
            <Icon name="share" className="size-5 md:size-4" />
            <span className="hidden md:inline">Share trip</span>
          </button>
          <Link href="/?new=1" prefetch={false} className="hidden min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-sunken md:inline-flex">
            <Icon name="plus" className="size-4" />
            New trip
          </Link>
          <div className="hidden md:block">
            <AddButton />
          </div>
          <button
            type="button"
            onClick={() => onGo({ tab: "trip" })}
            aria-label={`Signed in as ${me}`}
            className="hidden size-11 items-center justify-center rounded-full hover:bg-sunken md:inline-flex"
          >
            <Avatar name={me} size="sm" />
          </button>
        </div>
      </div>
    </header>
  );
}
