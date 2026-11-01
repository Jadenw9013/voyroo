import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/types";
import { publicTrip, safeBookingUrl } from "./preview";

describe("booking links on the viewing link", () => {
  it("keeps a plain booking or listing page", () => {
    expect(safeBookingUrl("https://www.airbnb.com/rooms/53920139")).toBe("https://www.airbnb.com/rooms/53920139");
    expect(safeBookingUrl("https://www.getyourguide.com/lake-atitlan-l1234/zipline-t5678/?date=2026-11-26")).toBe("https://www.getyourguide.com/lake-atitlan-l1234/zipline-t5678/?date=2026-11-26");
  });

  it("leaves out a link that carries the confirmation or a key to the booking", () => {
    expect(safeBookingUrl("https://www.airbnb.com/trips/v1/reservation-details/HMX4Q2", "HMX4Q2")).toBeNull();
    expect(safeBookingUrl("https://example.com/manage/hmx-4q2", "HMX 4Q2")).toBeNull();
    for (const q of ["conf=HMX4Q2", "confirmation=1", "code=1", "pin=1234", "token=abc", "email=a@b.c", "last=Wong", "lastName=Wong", "pnr=ABC123", "ref=1", "auth=1"]) {
      expect(safeBookingUrl(`https://example.com/manage?${q}`), q).toBeNull();
    }
    expect(safeBookingUrl("https://example.com/manage#token=abc")).toBeNull();
    expect(safeBookingUrl("https://example.com/r/AbC123dEf456GhI789jKl012")).toBeNull();
    expect(safeBookingUrl("https://user:pass@example.com/")).toBeNull();
    expect(safeBookingUrl("javascript:alert(1)")).toBeNull();
    expect(safeBookingUrl("not a link")).toBeNull();
  });
});

describe("publicTrip", () => {
  const trip: Trip = {
    schema: 2,
    id: "t",
    name: "Trip",
    destination: "Guatemala",
    startDate: "2026-11-24",
    endDate: "2026-12-01",
    tz: "America/Guatemala",
    currency: "GTQ",
    people: ["Ana"],
    todos: [],
    items: [],
    essentials: { emergency: "Police: 110", water: "Bottled only", checkedBy: "Ana", checkedOn: "2026-11-01", sources: [{ url: "https://travel.state.gov/", title: "travel.state.gov" }] },
  } as Trip;

  it("shows the essentials and when they were checked, not who checked them", () => {
    expect(publicTrip(trip).essentials).toEqual({ emergency: "Police: 110", water: "Bottled only", checkedOn: "2026-11-01", sources: [{ url: "https://travel.state.gov/", title: "travel.state.gov" }] });
  });

  it("gives a restaurant's or a flight's contact no place on the link", () => {
    const withItems = { ...trip, items: [{ id: "f", kind: "food", title: "Dinner", contact: { phone: "+502 1" } }, { id: "s", kind: "stay", title: "Casa", contact: { phone: "+502 2", email: "x@y.z" } }] } as Trip;
    const [food, stay] = publicTrip(withItems).items;
    expect(food.contact).toBeUndefined();
    expect(stay.contact).toEqual({ phone: "+502 2" });
  });
});
