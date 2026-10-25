"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { tripCoverUrl } from "@/domain/links";
import { formatRange } from "@/domain/time";
import type { PlannerSnapshot } from "@/domain/planner";
import type { Account } from "@/server/auth";
import { Icon } from "@/ui/Icon";
import { Brand } from "@/ui/Brand";
import { AccountPanel } from "../account/AccountPanel";
import { NewTripPlanner } from "./NewTripPlanner";

interface Summary { id: string; name: string; startDate: string; endDate: string; cover?: string }

export function Home({ trips, original, create = false, initialName = "", account = null, initialSnapshot = null }: {
  trips: Summary[]; original: { id: string; name: string; claimed: boolean } | null;
  create?: boolean; initialName?: string; account?: Account | null; initialSnapshot?: PlannerSnapshot | null;
}) {
  const composer = useRef<HTMLDivElement>(null);
  return <div className="home-workspace">
    <header className="workspace-header">
      <Brand tagline />
      <nav aria-label="Workspace" className="flex items-center gap-2 sm:gap-6">
        <a href="#your-trips" className="workspace-nav hidden sm:flex">Your trips</a>
        <button type="button" className="workspace-nav" onClick={() => { composer.current?.scrollIntoView({ behavior: "smooth", block: "start" }); composer.current?.querySelector("textarea")?.focus(); }}>New trip</button>
        <AccountPanel initialAccount={account} />
      </nav>
    </header>
    <main className="workspace-main">
      {trips.length > 0 && !create && (
        <section aria-label="Mobile quick trips" className="mb-5 flex flex-col gap-2.5 sm:hidden">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-lg font-extrabold tracking-tight">My Trips</h2>
            <a href="#your-trips" className="text-xs font-bold text-accent">
              See All ({trips.length})
            </a>
          </div>
          <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {trips.map((trip) => {
              const coverSrc = tripCoverUrl({ id: trip.id, name: trip.name, destination: trip.name, cover: trip.cover });
              return (
                <li key={`mob-${trip.id}`} className="w-64 shrink-0 snap-start">
                  <Link
                    href={`/t/${trip.id}/plan`}
                    className="group relative block h-38 w-full overflow-hidden rounded-3xl border border-line bg-[#0f1322] p-4 shadow-lift"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverSrc}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover object-center opacity-75 transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d17] via-[#0b0d17]/45 to-transparent" />
                    <div className="relative z-10 flex h-full flex-col justify-end">
                      <h3 className="truncate text-lg leading-tight font-extrabold text-white">{trip.name}</h3>
                      <p className="mt-0.5 text-xs font-medium text-[#cbd5f5]">
                        {formatRange(trip.startDate, trip.endDate)}, {trip.startDate.slice(0, 4)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div ref={composer} className="scroll-mt-8">
        <div className="workspace-intro"><p className="welcome-line">{account ? `Your travel space, ${initialName || account.name}.` : "Less logistics. More looking forward."}</p><h1>{create ? "Let's make a trip happen." : "Good trips start with a conversation."}</h1><p>Tell us what you have in mind. We’ll work out the details together.</p></div>
        <NewTripPlanner account={account} initialName={initialName} initialSnapshot={initialSnapshot} />
      </div>
      <section id="your-trips" aria-labelledby="your-trips-title" className="your-trips-section">
        <div className="flex items-end justify-between gap-3"><div><h2 id="your-trips-title">Your trips</h2><p className="text-muted">{account ? "Your plans, together in one place. Pick up where you left off." : "Trips you’ve joined on this browser."}</p></div><span className="trip-count">{trips.length} {trips.length === 1 ? "trip" : "trips"}</span></div>
        {trips.length ? <ul className="trip-library">{trips.map((trip) => { const coverSrc = tripCoverUrl({ id: trip.id, name: trip.name, destination: trip.name, cover: trip.cover }); return <li key={trip.id}><Link href={`/t/${trip.id}/plan`} className="library-trip"><div className="library-trip-image"><Image src={coverSrc} alt="" fill sizes="(max-width: 640px) 100vw, 350px" unoptimized={coverSrc.startsWith("http") || coverSrc.startsWith("/api/")} className="size-full object-cover object-center" /><span className="library-open"><Icon name="chevronRight" /></span></div><div className="library-trip-copy"><h3>{trip.name}</h3><p><Icon name="today" className="size-4" />{formatRange(trip.startDate, trip.endDate)}, {trip.startDate.slice(0, 4)}</p></div></Link></li>; })}</ul> : <div className="library-empty"><Icon name="suitcase" className="size-6" /><p>Your next trip belongs here.<span>Start a conversation above and save the plan when it feels right.</span></p></div>}
        {original && <Link href={`/t/${original.id}/join`} className="existing-invite"><Icon name="users" className="size-4" /><span>Joining the {original.name} trip?</span><span className="font-semibold">Open invitation</span><Icon name="chevronRight" className="size-4" /></Link>}
      </section>
      <footer className="workspace-footer"><span>Voyroo. Made for the journey.</span><span>Plan together. Keep everything close.</span></footer>
    </main>
  </div>;
}
