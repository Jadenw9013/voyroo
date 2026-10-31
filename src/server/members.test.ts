import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Opening a trip must never change who's in it. The trip page used to keep
 * only names with a linked Google account, so the first signed-in viewer
 * silently removed every earlier member and every passcode-only guest.
 */

const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => void jar.set(name, value),
}) }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));
// The page's job here is what it hands the app; the app itself isn't rendered.
vi.mock("@/features/TripApp", () => ({ TripApp: () => null }));

import { hashPasscode, writeAccount, writeSession } from "./auth";
import { getStore, setStoreForTests } from "./db";
import { MemoryBackend, TripStore } from "./store";
import TripPage from "@/app/t/[tripId]/[[...view]]/page";
import { POST as joinTrip } from "@/app/api/t/[tripId]/join/route";

const accountA = { id: "a".repeat(64), name: "Ana Lopez", email: "ana@example.com" };
const trip = {
  schema: 2 as const, id: "group-trip", name: "Trip", destination: "Tokyo",
  startDate: "2027-04-01", endDate: "2027-04-05", tz: "Asia/Tokyo", currency: "JPY",
  people: ["Creator", "Bea", "Sam"], items: [], todos: [],
};
const open = async () => (await TripPage({ params: Promise.resolve({ tripId: "group-trip" }) })) as ReactElement<{ initial: { trip: { people: string[] } }; verified: string[] }>;
const join = (name: string) => joinTrip(new Request("http://localhost/api/t/group-trip/join", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, passcode: "secretpass" }),
}), { params: Promise.resolve({ tripId: "group-trip" }) });

beforeEach(async () => {
  jar.clear();
  vi.stubEnv("SESSION_SECRET", "test-only-fixed-session-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/google/callback");
  setStoreForTests(new TripStore(new MemoryBackend()));
  await getStore().create(trip, await hashPasscode("secretpass"));
});

describe("the group list", () => {
  it("is left alone when a Google member opens the trip, even if nobody else has a linked account", async () => {
    await writeAccount(accountA);
    await writeSession({ tripId: "group-trip", name: "Ana" });
    const before = await getStore().get("group-trip");

    const page = await open();

    const after = await getStore().get("group-trip");
    expect(after?.trip.people).toEqual(["Creator", "Bea", "Sam"]);
    expect(after?.version).toBe(before?.version);
    expect(await getStore().history("group-trip")).toEqual([]);
    expect(page.props.initial.trip.people).toEqual(["Creator", "Bea", "Sam"]);
    // Who joined with Google is shown, not enforced.
    expect(page.props.verified).toEqual(["Ana"]);
  });

  it("is left alone when a passcode-only guest opens the trip", async () => {
    await writeSession({ tripId: "group-trip", name: "Bea" });
    await open();
    expect((await getStore().get("group-trip"))?.trip.people).toEqual(["Creator", "Bea", "Sam"]);
    expect(await getStore().history("group-trip")).toEqual([]);
  });

  it("gains passcode-only friends and Google members alike when they join, and keeps them on later visits", async () => {
    expect((await join("Dee")).status).toBe(200);
    await writeAccount(accountA);
    expect((await join("Ignored")).status).toBe(200);
    expect((await getStore().get("group-trip"))?.trip.people).toEqual(["Creator", "Bea", "Sam", "Dee", "Ana"]);

    const page = await open();
    expect(page.props.initial.trip.people).toEqual(["Creator", "Bea", "Sam", "Dee", "Ana"]);
    expect(page.props.verified).toEqual(["Ana"]);
    // Two joins, nothing from opening the page.
    expect((await getStore().history("group-trip")).map((e) => e.author)).toEqual(["Ana", "Dee"]);
  });
});
