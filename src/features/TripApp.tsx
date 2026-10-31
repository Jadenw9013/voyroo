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
  const [sharing, setSharing] = useState(false);

  // Arrived from the share sheet (/share): open the composer with what was shared.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.hash.slice(1)).get("compose");
    if (!shared) return;
    window.history.replaceState(null, "", window.location.pathname);
    compose({ text: shared });
  }, [compose]);

  return (
    <div className="trip-app-shell min-h-dvh w-full pt-[calc(4rem+env(safe-area-inset-top))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pl-56 lg:pl-64">
      <TopBar onShare={() => setSharing(true)} onGo={go} />
      <Sidebar active={active} view={view} onPick={(t) => go({ tab: t } as View)} onGo={go} onShare={() => setSharing(true)} />
      <main id="main" className="mx-auto w-full max-w-6xl min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pt-4 md:pb-16">
        <HeldEdits />
        {view.tab === "today" && <Today day={view.day} go={go} serverNow={serverNow} />}
        {view.tab === "plan" && <Plan section={view.section} go={go} onShare={() => setSharing(true)} />}
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
  return (
    <button
      type="button"
      onClick={() => compose({})}
      aria-label="Add or ask"
      className={`flex items-center justify-center gap-2 rounded-full bg-accent font-bold text-on-accent shadow-lift transition-transform active:scale-95 ${
        big ? "size-14 ring-4 ring-canvas" : "min-h-11 px-4 text-sm"
      }`}
    >
      <Icon name="plus" className={big ? "size-7" : "size-4"} />
      {!big && "Add or ask"}
    </button>
  );
}

/** Phones: four tabs and the glowing + in thumb reach. */
function BottomBar({ active, onPick }: { active: Tab; onPick: (t: Tab) => void }) {
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);
  const tab = (t: (typeof TABS)[number]) => (
    <li key={t.id} className="flex flex-1">
      <button
        type="button"
        onClick={() => onPick(t.id)}
        aria-current={active === t.id ? "page" : undefined}
        className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${
          active === t.id ? "text-accent" : "text-muted hover:text-ink"
        }`}
      >
        {active === t.id && <span aria-hidden="true" className="absolute top-0 h-1 w-8 rounded-b-full bg-accent" />}
        <Icon name={t.icon} className="size-5" />
        {t.label}
      </button>
    </li>
  );
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-center px-2">
        {left.map(tab)}
        <li className="flex flex-1 justify-center">
          <span className="-mt-6">
            <AddButton big />
          </span>
        </li>
        {right.map(tab)}
      </ul>
    </nav>
  );
}

/** Desktop & Tablet Left Sidebar matching the Voyroo dashboard layout. */
function Sidebar({
  active,
  view,
  onPick,
  onGo,
  onShare,
}: {
  active: Tab;
  view: View;
  onPick: (t: Tab) => void;
  onGo: (v: View) => void;
  onShare: () => void;
}) {
  const { trip } = useTrip();
  const compose = useCompose();
  const coverSrc = tripCoverUrl(trip);

  return (
    <aside aria-label="Sidebar" className="fixed top-16 bottom-0 left-0 z-30 hidden w-56 flex-col justify-between border-r border-line bg-surface/65 p-3 backdrop-blur-xl md:flex lg:w-64 lg:p-4">
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
                    className={`relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
                      isCurrent ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink"
                    }`}
                  >
                    {isCurrent && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent" />}
                    <Icon name={t.icon} className="size-5" />
                    <span>{t.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-line pt-4">
          <p className="mb-2 px-3 text-xs font-bold tracking-wider text-muted uppercase">Explore Trip</p>
          <ul className="flex flex-col gap-1">
            <li>
              <button
                type="button"
                onClick={() => onGo({ tab: "plan", section: "ideas" })}
                className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors ${
                  view.tab === "plan" && view.section === "ideas" ? "bg-sunken text-ink" : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon name="heart" className="size-4 text-k-food" />
                <span>Saved Places</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onGo({ tab: "plan", section: "posts" })}
                className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors ${
                  view.tab === "plan" && view.section === "posts" ? "bg-sunken text-ink" : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon name="image" className="size-4 text-k-stay" />
                <span>Saved Posts</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onGo({ tab: "expenses" })}
                aria-current={view.tab === "expenses" ? "page" : undefined}
                className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors ${
                  view.tab === "expenses" ? "bg-sunken text-ink" : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon name="wallet" className="size-4 text-ok" />
                <span>Expenses</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={onShare}
                className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
              >
                <Icon name="users" className="size-4 text-k-transport" />
                <span>Friends & Invite</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => compose({ ask: true, text: "" })}
                className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
              >
                <Icon name="sparkles" className="size-4 text-accent" />
                <span>AI Assistant</span>
              </button>
            </li>
          </ul>
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2.5 px-3 text-xs font-bold tracking-wider text-muted uppercase">Active Trip</p>
          <button
            type="button"
            onClick={() => onGo({ tab: "plan" })}
            className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-sunken/70 p-2.5 text-left transition-colors hover:border-accent/50 hover:bg-sunken"
          >
            <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-canvas">
              <Image
                src={coverSrc}
                alt=""
                fill
                sizes="44px"
                unoptimized={coverSrc.startsWith("http") || coverSrc.startsWith("/api/")}
                className="object-cover"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">{trip.name}</span>
              <span className="block truncate text-xs text-muted">{formatRange(trip.startDate, trip.endDate)}</span>
            </span>
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <Link
          href="/?all=1"
          prefetch={false}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-sunken/60 px-3 text-xs font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink"
        >
          <Icon name="suitcase" className="size-4" />
          All Trips Workspace
        </Link>
      </div>
    </aside>
  );
}

/** Top header bar with Brand, quick search/ask bar on desktop, and sleek circular actions on mobile. */
function TopBar({ onShare, onGo }: { onShare: () => void; onGo: (v: View) => void }) {
  const { me } = useTrip();
  const compose = useCompose();
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-[calc(3.75rem+env(safe-area-inset-top))] border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-xl sm:h-[calc(4rem+env(safe-area-inset-top))]">
      <div className="flex h-15 w-full items-center justify-between gap-2 px-3 sm:h-16 sm:px-5">
        <div className="flex items-center gap-3">
          <Brand />
        </div>

        <button
          type="button"
          onClick={() => compose({})}
          className="hidden min-h-11 max-w-md flex-1 items-center gap-2.5 rounded-full border border-line bg-sunken/80 px-4 py-2 text-left text-sm text-muted transition-colors hover:border-accent/50 hover:text-ink lg:flex"
        >
          <Icon name="search" className="size-4 text-muted" />
          <span className="truncate">Search trip, add places, or ask Voyroo…</span>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <button
            type="button"
            aria-label="Ask Voyroo"
            onClick={() => compose({ ask: true, text: "" })}
            className="flex size-10 items-center justify-center rounded-full border border-line bg-sunken/70 text-accent transition-colors hover:bg-sunken lg:hidden"
          >
            <Icon name="sparkles" className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Share trip"
            onClick={onShare}
            className="flex size-10 items-center justify-center gap-1.5 rounded-full border border-line bg-sunken/70 text-xs font-semibold text-ink transition-colors hover:bg-sunken sm:min-h-11 sm:w-auto sm:rounded-xl sm:px-3 sm:text-sm"
          >
            <Icon name="share" className="size-4 text-accent" />
            <span className="hidden sm:inline">Share trip</span>
          </button>
          <Link
            href="/?new=1"
            prefetch={false}
            aria-label="New trip"
            className="flex size-10 items-center justify-center gap-1 rounded-full border border-line bg-sunken/70 text-xs font-bold text-ink transition-colors hover:bg-accent hover:text-on-accent sm:min-h-11 sm:w-auto sm:rounded-xl sm:border-transparent sm:bg-accent-soft sm:px-3 sm:text-sm sm:text-accent"
          >
            <Icon name="plus" className="size-4" />
            <span className="sr-only sm:not-sr-only">New trip</span>
          </Link>
          <div className="hidden md:block">
            <AddButton />
          </div>
          <button
            type="button"
            onClick={() => onGo({ tab: "trip" })}
            aria-label={`Signed in as ${me}`}
            className="inline-flex size-10 items-center justify-center rounded-full ring-2 ring-line transition-shadow hover:ring-accent sm:min-h-11 sm:min-w-11"
          >
            <Avatar name={me} size="sm" />
          </button>
        </div>
      </div>
    </header>
  );
}
