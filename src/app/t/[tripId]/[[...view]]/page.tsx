import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { TripApp } from "@/features/TripApp";
import { readAccount, readSession } from "@/server/auth";
import { getStore } from "@/server/db";
import { TRIP_ID } from "@/server/http";
import { googleConfigured } from "@/server/google";

export async function generateMetadata({ params }: { params: Promise<{ tripId: string }> }): Promise<Metadata> {
  const { tripId } = await params;
  const session = TRIP_ID.test(tripId) ? await readSession(tripId) : null;
  if (!session) return { title: "Join the trip" };
  const state = await getStore().get(tripId);
  return { title: state?.trip.name ?? "Trip" };
}

/** The trip, and when it was read (the app shows "up to date as of"). */
async function load(tripId: string) {
  const state = await getStore().get(tripId);
  return { state, readAt: Date.now() };
}

/**
 * Every screen of a trip renders from here; moving between them happens on
 * the phone (see client/router.ts), so they all open with no signal.
 */
export default async function TripPage({ params }: { params: Promise<{ tripId: string; view?: string[] }> }) {
  await connection();
  const { tripId } = await params;
  if (!TRIP_ID.test(tripId)) notFound();
  const session = await readSession(tripId);
  if (!session) redirect(`/t/${tripId}/join`);
  const { state, readAt } = await load(tripId);
  if (!state) notFound();

  if (googleConfigured()) {
    const account = await readAccount();
    if (account) {
      const store = getStore();
      const accounts = await store.tripAccounts(tripId);
      if (!accounts[session.name]) {
        await store.rememberTrip(account.id, tripId, session.name);
        accounts[session.name] = account.id;
      }
      const validPeople = state.trip.people.filter((p) => Boolean(accounts[p]) || p === session.name);
      if (validPeople.length !== state.trip.people.length) {
        state.trip.people = validPeople.length ? validPeople : [session.name];
        await store.apply(tripId, [{ op: "trip.update", set: { people: state.trip.people } }], {
          author: session.name,
          accountId: account.id,
        });
      }
    }
  }

  return <TripApp tripId={tripId} initial={state} me={session.name} serverNow={readAt} />;
}
