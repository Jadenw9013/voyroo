import { afterEach, expect, it, vi } from "vitest";
import type { Trip } from "@/domain/types";
import { extractBookings, extractReceipt } from "./documents";

const trip: Trip = { schema: 2, id: "test", name: "Trip", destination: "Paris", startDate: "2026-12-01", endDate: "2026-12-02", tz: "Europe/Paris", currency: "EUR", people: [], items: [], todos: [] };

/** Exercise the installed AI SDK and Google adapter, replacing just the network. */
function providerResponse(output: unknown) {
  vi.stubEnv("GEMINI_API_KEY", "unused-test-key");
  vi.stubEnv("CHAT_MOCK", "0");
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    expect(request.tools).toBeUndefined();
    expect(request.generationConfig.responseMimeType).toBe("application/json");
    const wire = JSON.stringify(request.generationConfig.responseJsonSchema);
    expect(wire).not.toMatch(/"(?:pattern|minLength|maxLength|exclusiveMinimum|\$schema)":/);
    return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(output) }] }, finishReason: "STOP" }] });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("serializes a multi-leg booking schema for Gemini and validates provider output", async () => {
  const booked = { title: "Train to Paris", kind: "transport", start: { date: "2026-12-01" }, booking: { state: "booked", source: "Rail", confirmation: "RAIL123" } };
  const fetch = providerResponse({ bookings: [booked] });
  expect(await extractBookings("Train reservation", trip)).toEqual([booked]);
  expect(fetch).toHaveBeenCalledOnce();
  providerResponse({ bookings: [{ ...booked, start: { date: "unreadable" } }] });
  await expect(extractBookings("Train reservation", trip)).rejects.toThrow();
});

it("uses a compact receipt schema while rejecting invalid dates and amounts locally", async () => {
  providerResponse({ title: "Dinner", amount: 20, currency: "EUR", date: "2026-12-01" });
  expect(await extractReceipt(Buffer.from("test-image"))).toMatchObject({ amount: 20, currency: "EUR" });
  providerResponse({ amount: -2, date: "2026-99-01" });
  await expect(extractReceipt(Buffer.from("test-image"))).rejects.toThrow();
});
