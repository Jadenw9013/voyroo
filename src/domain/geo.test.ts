import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import { boundsOf, clusterPoints, coordsFromMapsUrl, geocodeQueries, isShortMapsLink, locatable, stopsFor, unplaced } from "./geo";
import type { Item } from "./types";

describe("coordinates in Maps links", () => {
  it("prefers the place's own pin over where the view was centred", () => {
    const url = "https://www.google.com/maps/place/Caf%C3%A9+Sabe+Rico/@14.5590123,-90.7301,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d14.5586!4d-90.7295!16s%2Fg%2F1";
    expect(coordsFromMapsUrl(url)).toEqual({ lat: 14.5586, lng: -90.7295 });
  });

  it("falls back to the view centre when that is all there is", () => {
    expect(coordsFromMapsUrl("https://www.google.com/maps/@14.6907,-91.2025,13z")).toEqual({ lat: 14.6907, lng: -91.2025 });
  });

  it("reads coordinate queries in their usual spellings", () => {
    expect(coordsFromMapsUrl("https://maps.google.com/?q=14.5586,-90.7295")).toEqual({ lat: 14.5586, lng: -90.7295 });
    expect(coordsFromMapsUrl("https://www.google.com/maps?q=loc:14.5586+-90.7295")).toBeNull();
    expect(coordsFromMapsUrl("https://www.google.com/maps?q=loc:14.5586,+-90.7295")).toEqual({ lat: 14.5586, lng: -90.7295 });
    expect(coordsFromMapsUrl("https://www.google.com/maps/search/?api=1&query=14.5586%2C-90.7295")).toEqual({ lat: 14.5586, lng: -90.7295 });
    expect(coordsFromMapsUrl("https://www.google.com/maps/dir/?api=1&destination=14.5586,-90.7295")).toEqual({ lat: 14.5586, lng: -90.7295 });
    expect(coordsFromMapsUrl("https://www.google.com/maps/search/14.5586,+-90.7295")).toEqual({ lat: 14.5586, lng: -90.7295 });
    expect(coordsFromMapsUrl("https://maps.apple.com/?ll=14.5586,-90.7295&q=Cafe")).toEqual({ lat: 14.5586, lng: -90.7295 });
  });

  it("reads through Google's consent page to the link it guards", () => {
    const inner = "https://www.google.com/maps/place/X/@1.5,2.5,15z/data=!3d14.5586!4d-90.7295";
    expect(coordsFromMapsUrl(`https://consent.google.com/m?continue=${encodeURIComponent(inner)}&gl=GT`)).toEqual({ lat: 14.5586, lng: -90.7295 });
  });

  it("finds nothing in links without coordinates, off-Maps links and nonsense", () => {
    expect(coordsFromMapsUrl("https://www.google.com/maps/place/Caf%C3%A9+Sabe+Rico")).toBeNull();
    expect(coordsFromMapsUrl("https://www.google.com/maps?cid=1234567890")).toBeNull();
    expect(coordsFromMapsUrl("https://www.google.com/search?q=14.5,-90.7")).toBeNull();
    expect(coordsFromMapsUrl("https://example.com/maps/@14.5,-90.7,10z")).toBeNull();
    expect(coordsFromMapsUrl("https://www.google.com/maps/@95.1,-90.7,10z")).toBeNull();
    expect(coordsFromMapsUrl("https://www.google.com/maps/@0,0,3z")).toBeNull();
    expect(coordsFromMapsUrl("not a url")).toBeNull();
  });

  it("knows which links must be followed first", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/AbCdEf123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/AbCdEf")).toBe(false);
    expect(isShortMapsLink("https://www.google.com/maps/@14.5,-90.7,10z")).toBe(false);
  });
});

describe("what to ask the geocoder", () => {
  it("tries the address, a cleaner address, then the town", () => {
    expect(geocodeQueries({ name: "Meeting point", address: "2 calle oriente #22, Antigua Guatemala" }, "Guatemala")).toEqual([
      "2 calle oriente #22, Antigua Guatemala",
      "2 calle oriente, Antigua Guatemala",
      "Antigua Guatemala",
    ]);
  });

  it("adds the destination so short names land in the right country, and drops asides", () => {
    expect(geocodeQueries({ name: "San Marcos La Laguna, Lake Atitlán (Barrio 2)" }, "Guatemala")).toEqual([
      "San Marcos La Laguna, Lake Atitlán, Guatemala",
      "San Marcos La Laguna, Guatemala",
    ]);
    expect(geocodeQueries({ name: "Antigua" }, "Guatemala")).toEqual(["Antigua, Guatemala"]);
    expect(geocodeQueries({ name: "Guatemala City" }, "Guatemala")).toEqual(["Guatemala City"]);
  });

  it("asks nothing for places nobody has decided", () => {
    expect(geocodeQueries({ name: "airport hotel or Antigua" }, "Guatemala")).toEqual([]);
    expect(geocodeQueries({ name: "TBD" }, "Guatemala")).toEqual([]);
    expect(geocodeQueries({ name: "Meeting point" }, "Guatemala")).toEqual([]);
    expect(geocodeQueries({ name: "Somewhere nice?" }, "Guatemala")).toEqual([]);
    expect(geocodeQueries(undefined, "Guatemala")).toEqual([]);
  });

  it("only treats unplaced items with something to go on as locatable", () => {
    const item = (place?: Item["place"], links?: Item["links"]): Item => ({ id: "x", kind: "activity", title: "X", place, links });
    expect(locatable(item({ name: "Lake Atitlán" }))).toBe(true);
    expect(locatable(item({ name: "Lake Atitlán", lat: 14.69, lng: -91.2 }))).toBe(false);
    expect(locatable(item({ name: "TBD" }))).toBe(false);
    expect(locatable(item(undefined, [{ id: "l", url: "https://maps.app.goo.gl/x", kind: "maps", addedAt: 0 }]))).toBe(true);
    expect(locatable(item())).toBe(false);
  });
});

describe("stops on the map", () => {
  const trip = seedTrip();

  it("lists a day in day order, then that night's bed", () => {
    const stops = stopsFor(trip, "2026-11-26");
    expect(stops.map((s) => `${s.part}:${s.item.id}`)).toEqual([
      "end:lodging-atitlan",
      "start:activity-jet-ski",
      "start:transport-nov26-transfers",
      "start:activity-zipline",
      "start:lodging-nov26-28",
    ]);
    const middle = stopsFor(trip, "2026-11-27");
    expect(middle.at(-1)).toMatchObject({ part: "night", item: { id: "lodging-nov26-28" } });
  });

  it("shows each item once for the whole trip, ideas last", () => {
    const stops = stopsFor(trip);
    const ids = stops.map((s) => s.item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stops.at(-1)).toMatchObject({ part: "idea", item: { id: "flight-home" } });
    expect(ids.indexOf("flight-out")).toBeLessThan(ids.indexOf("hike-acatenango"));
  });

  it("asks about dated stops with no pin, and ideas only when someone gave them a place", () => {
    const ideaNoPlace: Item = { id: "idea-x", kind: "food", title: "Somewhere for tacos" };
    const missing = unplaced(stopsFor({ ...trip, items: [...trip.items, ideaNoPlace] }));
    expect(missing.some((s) => s.item.id === "lodging-nov24")).toBe(true);
    expect(missing.some((s) => s.item.id === "idea-x")).toBe(false);
  });
});

describe("grouping pins", () => {
  const pts = [
    { id: "a", lat: 14.5586, lng: -90.7295 },
    { id: "b", lat: 14.5587, lng: -90.7296 },
    { id: "c", lat: 14.6907, lng: -91.2025 },
  ];

  it("groups pins whose labels would overlap, and splits them as you zoom in", () => {
    const far = clusterPoints(pts, 6);
    expect(far).toHaveLength(1);
    expect(far[0].ids).toEqual(["a", "b", "c"]);
    expect(far[0].key).toBe("group:a|b|c");
    const mid = clusterPoints(pts, 12);
    expect(mid.map((c) => c.ids)).toEqual([["a", "b"], ["c"]]);
    expect(mid[1].key).toBe("c");
    const near = clusterPoints(pts, 19);
    expect(near.map((c) => c.key)).toEqual(["a", "b", "c"]);
  });

  it("frames every point", () => {
    expect(boundsOf(pts)).toEqual([[-91.2025, 14.5586], [-90.7295, 14.6907]]);
    expect(boundsOf([])).toBeNull();
  });
});
