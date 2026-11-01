import { describe, expect, it } from "vitest";
import { seedTrip } from "@/server/seed";
import { prepareChange } from "./change";
import { drivable, driverPhrase, driverStays, driverText, emergencyLines, guessNationality, hasEssentials } from "./essentials";
import type { Op } from "./ops";
import type { TripState } from "./types";

const state = (): TripState => ({ trip: seedTrip(), version: 1 });
const run = (s: TripState, ops: unknown[], author = "Sam") => {
  const r = prepareChange(s, ops, { author, now: 1 });
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("; "));
  return { state: { trip: r.trip, version: r.entry.version }, entry: r.entry };
};

describe("essentials in the trip", () => {
  it("merges edits one field at a time, so two people's corrections both land, and undoes cleanly", () => {
    const a = run(state(), [{ op: "trip.update", set: { essentials: { emergency: "Police: 110", water: "Bottled only", draftedOn: "2026-10-31" } } }]);
    expect(a.entry.summary).toEqual(["updated the trip essentials"]);
    const b = run(a.state, [{ op: "trip.update", set: { essentials: { water: "Filtered is fine", checkedBy: "Ana", checkedOn: "2026-11-01" } } }], "Ana");
    expect(b.state.trip.essentials).toEqual({ emergency: "Police: 110", water: "Filtered is fine", draftedOn: "2026-10-31", checkedBy: "Ana", checkedOn: "2026-11-01" });
    const undone = run(b.state, b.entry.inverse);
    expect(undone.state.trip.essentials).toEqual(a.state.trip.essentials);
    const cleared = run(undone.state, a.entry.inverse);
    expect(cleared.state.trip).not.toHaveProperty("essentials");
  });

  it("removes a field with null and the whole card when nothing's left", () => {
    const a = run(state(), [{ op: "trip.update", set: { essentials: { plugs: "A/B, 120 V" } } }]);
    const b = run(a.state, [{ op: "trip.update", set: { essentials: { plugs: null } } }]);
    expect(b.state.trip).not.toHaveProperty("essentials");
  });

  it("rejects what doesn't belong: unknown fields, bad dates, links that aren't web links", () => {
    const bad: Op[][] = [
      [{ op: "trip.update", set: { essentials: { visa: "no" } } } as unknown as Op],
      [{ op: "trip.update", set: { essentials: { checkedOn: "yesterday" } } } as unknown as Op],
      [{ op: "trip.update", set: { essentials: { sources: [{ url: "javascript:alert(1)" }] } } } as unknown as Op],
    ];
    for (const ops of bad) expect(prepareChange(state(), ops, { author: "Sam" }).ok).toBe(false);
  });
});

describe("essentials helpers", () => {
  it("reads emergency lines as label and number", () => {
    expect(emergencyLines("Police: 110\nAmbulance – 128\n\nTourist police (PROATUR): +502 2421 2810\nCall your bank if a card is stolen")).toEqual([
      { label: "Police", number: "110" },
      { label: "Ambulance", number: "128" },
      { label: "Tourist police (PROATUR)", number: "+502 2421 2810" },
      "Call your bank if a card is stolen",
    ]);
  });

  it("knows when there's anything to show", () => {
    expect(hasEssentials(undefined)).toBe(false);
    expect(hasEssentials({ nationality: "United States" })).toBe(false);
    expect(hasEssentials({ water: "Bottled" })).toBe(true);
  });

  it("guesses the group's passports from home, and only when it's fairly sure", () => {
    expect(guessNationality({ homeTz: "America/Los_Angeles" })).toBe("United States");
    expect(guessNationality({ homeTz: "Europe/London" })).toBe("United Kingdom");
    expect(guessNationality({ homeCurrency: "CAD" })).toBe("Canada");
    expect(guessNationality({ homeCurrency: "EUR" })).toBe("");
  });

  it("asks the driver in the local language", () => {
    expect(driverPhrase({ tz: "America/Guatemala" })).toMatchObject({ lang: "es", please: "Por favor, lléveme a esta dirección:" });
    expect(driverPhrase({ tz: "America/Sao_Paulo" }).lang).toBe("pt");
    expect(driverPhrase({ tz: "Asia/Bangkok" }).lang).toBe("en");
  });

  it("lists stays with somewhere to go, in order, and copies name and address", () => {
    const trip = seedTrip();
    const stays = driverStays(trip);
    expect(stays.length).toBeGreaterThan(0);
    expect(stays.every((s) => s.kind === "stay" && (s.place?.name || s.place?.address))).toBe(true);
    expect(driverText({ id: "x", kind: "stay", title: "Casa", place: { name: "Casa Santo Domingo", address: "3a Calle Oriente 28, Antigua Guatemala" } })).toBe("Casa Santo Domingo\n3a Calle Oriente 28, Antigua Guatemala");
    expect(driverText({ id: "x", kind: "stay", title: "Casa", place: { address: "3a Calle Oriente 28" } })).toBe("Casa\n3a Calle Oriente 28");
    // A place "name" that's only the area: the stay's own name leads, so the driver knows which door.
    expect(driverText({ id: "x", kind: "stay", title: "Lumina, AMATE Atitlán", place: { name: "San Marcos La Laguna" } })).toBe("Lumina, AMATE Atitlán\nSan Marcos La Laguna");
  });

  it("offers a driver card only where a driver can go", () => {
    expect(drivable({ kind: "stay", place: { name: "San Marcos La Laguna" } })).toBe(true);
    expect(drivable({ kind: "activity", place: { name: "Lake Atitlán" } })).toBe(false);
    expect(drivable({ kind: "food", place: { address: "4a Avenida Norte 14, Antigua" } })).toBe(true);
    expect(drivable({ kind: "flight", place: { address: "La Aurora International Airport" } })).toBe(false);
  });
});
