import { describe, expect, it } from "vitest";
import { liveSchedule } from "./liveSchedule";
import type { Item, Trip } from "./types";

const trip: Trip = { id: "road-trip", schema: 2, name: "California to New York", destination: "New York", tz: "America/New_York", startDate: "2026-11-24", endDate: "2026-11-29", currency: "USD", people: [], items: [], todos: [] };
const flight: Item = { id: "flight", title: "SFO to JFK", kind: "flight", start: { date: "2026-11-24", time: "23:00", tz: "America/Los_Angeles" }, end: { date: "2026-11-25", time: "07:30" } };
const tour: Item = { id: "tour", title: "City tour", kind: "activity", start: { date: "2026-11-25", time: "08:00" }, place: { lat: 40.717, lng: -74.01 } };
const stay: Item = { id: "hotel", title: "Hotel", kind: "stay", start: { date: "2026-11-25", time: "15:00" }, end: { date: "2026-11-28", time: "11:00" } };

describe("current itinerary context", () => {
  it("distinguishes an overnight flight from the next timed start, using both endpoint time zones", () => {
    const result = liveSchedule({ ...trip, items: [tour, stay, flight] }, Date.parse("2026-11-25T03:00:00-05:00"));
    expect(result.inProgress.map((item) => item.id)).toEqual(["flight"]);
    expect(result.next?.id).toBe("tour");
    expect(result.minutesUntilNext).toBe(300);
    expect(result.freeMinutesBeforeNext).toBe(30);
  });
  it("uses the last occupied minute when multiple events overlap; a stay is not a continuous activity", () => {
    const ongoing = { ...tour, start: { date: "2026-11-25", time: "03:00" }, end: { date: "2026-11-25", time: "08:30" } };
    const result = liveSchedule({ ...trip, items: [stay, flight, ongoing, { ...tour, id: "another" }] }, Date.parse("2026-11-25T03:00:00-05:00"));
    expect(result.inProgress).toHaveLength(2);
    expect(result.freeMinutesBeforeNext).toBe(0);
    const duringStay = liveSchedule({ ...trip, items: [stay] }, Date.parse("2026-11-28T07:00:00-05:00"));
    expect(duringStay.inProgress).toEqual([]);
    expect(duringStay.next?.part).toBe("check-out");
    expect(duringStay.freeMinutesBeforeNext).toBe(240);
  });
  it("keeps uncertain schedules and completed itineraries from producing invented free time", () => {
    const untimed = { ...tour, id: "untimed", start: { date: "2026-11-25" } };
    const now = Date.parse("2026-11-25T12:00:00-05:00");
    expect(liveSchedule({ ...trip, items: [tour, stay] }, now).freeMinutesBeforeNext).toBeNull();
    expect(liveSchedule({ ...trip, items: [untimed, stay] }, now)).toMatchObject({ uncertainPlans: ["untimed"], minutesUntilNext: 180, freeMinutesBeforeNext: null });
    expect(liveSchedule({ ...trip, items: [flight] }, now)).toMatchObject({ inProgress: [], next: null, minutesUntilNext: null, freeMinutesBeforeNext: null });
  });
  it.each([
    { start: { date: "2026-11-24" }, end: { date: "2026-11-26" } },
    { start: { date: "2026-11-24", time: "18:00" }, end: { date: "2026-11-25" } },
    { start: { date: "2026-11-24" }, end: { date: "2026-11-25", time: "09:00" } },
    { start: { date: "2026-11-24", time: "18:00" }, sleepsHere: true },
  ])("keeps an overnight activity with incomplete endpoints out of available time", (times) => {
    const hike = { ...tour, id: "hike", ...times };
    const result = liveSchedule({ ...trip, items: [hike, tour] }, Date.parse("2026-11-25T06:00:00-05:00"));
    expect(result).toMatchObject({ next: { id: "tour" }, minutesUntilNext: 120, freeMinutesBeforeNext: null, uncertainPlans: ["hike"] });
  });
  it("checks untimed plans throughout the gap, in their local zone, and releases it after the known end", () => {
    const outing = { ...tour, id: "outing", start: { date: "2026-11-26", tz: "Asia/Tokyo" }, end: { date: "2026-11-26", time: "05:00", tz: "Asia/Tokyo" } };
    const next = { ...tour, start: { date: "2026-11-25", time: "19:00" } };
    const planned = { ...trip, items: [outing, next] };
    expect(liveSchedule(planned, Date.parse("2026-11-25T09:00:00-05:00")).uncertainPlans).toEqual(["outing"]);
    expect(liveSchedule(planned, Date.parse("2026-11-25T15:00:00-05:00")).freeMinutesBeforeNext).toBe(240);
  });
  it("blocks untimed checkout on its date while leaving the middle of a stay available", () => {
    const hotel = { ...stay, start: { date: "2026-11-24" }, end: { date: "2026-11-26" } };
    const planned = { ...trip, items: [hotel, tour] };
    expect(liveSchedule(planned, Date.parse("2026-11-25T07:00:00-05:00")).freeMinutesBeforeNext).toBe(60);
    planned.items.push({ ...tour, id: "dinner", start: { date: "2026-11-26", time: "18:00" } });
    expect(liveSchedule(planned, Date.parse("2026-11-26T07:00:00-05:00"))).toMatchObject({ freeMinutesBeforeNext: null, uncertainPlans: ["hotel"] });
  });
  it("offers destination-only directions for a saved address and never treats an arrival pin as a flight departure", () => {
    const pinnedFlight = { ...flight, place: { name: "JFK", lat: 40.64, lng: -73.78 } };
    const beforeFlight = liveSchedule({ ...trip, items: [pinnedFlight] }, Date.parse("2026-11-24T12:00:00-05:00"), { lat: 37.77, lng: -122.39 });
    expect(beforeFlight.next?.id).toBe(flight.id);
    expect(beforeFlight.next?.directionsUrl).toBeUndefined();
    expect(beforeFlight.straightLineMeters).toEqual({});
    const byAddress = { ...tour, place: { address: "12 Main St, New York" } };
    const nextStop = liveSchedule({ ...trip, items: [byAddress] }, Date.parse("2026-11-25T04:00:00-05:00"), { lat: 40.71, lng: -74.01 });
    const directions = new URL(nextStop.next!.directionsUrl!);
    expect(directions.searchParams.get("destination")).toBe(byAddress.place.address);
    expect(directions.searchParams.has("origin")).toBe(false);
  });
  it("returns only straight-line distances to pinned scheduled items when position is available", () => {
    const items = [tour, flight, { ...tour, id: "idea", start: null }, { ...tour, id: "bad-pin", place: { lat: 100, lng: 0 } }];
    const now = Date.parse("2026-11-25T07:30:00-05:00");
    const result = liveSchedule({ ...trip, items }, now, { lat: 40.707, lng: -74.01 });
    expect(result.straightLineMeters).toEqual({ tour: 1112 });
    expect(result.inProgress).toEqual([]);
    expect(result.freeMinutesBeforeNext).toBe(30);
    expect(liveSchedule({ ...trip, items }, now).straightLineMeters).toEqual({});
  });
});
