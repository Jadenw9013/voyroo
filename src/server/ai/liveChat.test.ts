import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Trip } from "@/domain/types";
import { cookieName, encodeSession } from "../auth";
import { setStoreForTests } from "../db";
import { MemoryBackend, TripStore } from "../store";
import { handleChat, readSharedLocation } from "./chat";
import { buildInstructions } from "./prompt";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined }) }));
const trip: Trip = { schema: 2, id: "paris", name: "France", destination: "Paris", startDate: "2026-05-17", endDate: "2026-05-20", tz: "Europe/Paris", currency: "EUR", people: ["Ana"], todos: [], items: [
  { id: "museum", title: "Museum ticket", kind: "activity", start: { date: "2026-05-17", time: "18:00" }, place: { lat: 48.86, lng: 2.33 }, booking: { state: "booked" } },
] };
const now = Date.parse("2026-05-17T15:00:00Z");
const location = { latitude: 48.858624, longitude: 2.345987, accuracy: 12, timestamp: now };

type GeminiRequest = {
  toolConfig?: { retrievalConfig?: { latLng?: unknown } };
  tools?: Record<string, unknown>[];
  systemInstruction?: { parts: { text: string }[] };
};

beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("CHAT_MOCK", "0"); vi.stubEnv("GEMINI_API_KEY", "test-only");
  const store = new TripStore(new MemoryBackend());
  await store.create(trip, "test-only");
  setStoreForTests(store);
  jar.set(cookieName(trip.id), encodeSession({ tripId: trip.id, name: "Ana" }));
});
afterEach(() => {
  jar.clear(); setStoreForTests(undefined); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  delete (globalThis as { builtinsOffUntil?: number }).builtinsOffUntil;
});

it("ignores malformed or stale readings and forwards only rounded coordinates and accuracy", () => {
  for (const invalid of [null, { ...location, latitude: "48" }, { ...location, latitude: 91 }, { ...location, longitude: Infinity }, { ...location, timestamp: now - 601_000 }, { ...location, timestamp: now + 61_000 }, { ...location, accuracy: -1 }]) {
    expect(readSharedLocation(invalid, now)).toBeNull();
  }
  expect(readSharedLocation({ ...location, timeZone: "bogus" }, now)).toEqual({ latitude: 48.859, longitude: 2.346, accuracy: 100 });
});

it("gives the speaker a separate schedule only for an explicit opt-out, regardless of who organizes an event", () => {
  const museum = trip.items[0];
  const planned: Trip = { ...trip, people: ["Ana", "Ben"], items: [
    { ...museum, id: "walk", start: { date: "2026-05-17" }, reactions: [{ by: "Ana", vote: "out" }] },
    { ...museum, who: "Ana", reactions: [{ by: "Ana", vote: "out" }] },
    { ...museum, id: "dinner", title: "Dinner", start: { date: "2026-05-17", time: "20:00" }, who: "Ben", reactions: [{ by: "Ana", vote: "maybe" }] },
  ] };
  function schedules(me: string) {
    const prompt = buildInstructions(planned, { me, nowMs: now, day: null, itemId: null, live: { location: null } });
    return JSON.parse(prompt.split("--- Trip data ---\n")[1]);
  }
  const ana = schedules("Ana");
  expect(ana).toMatchObject({
    liveSchedule: { next: { id: "museum" }, minutesUntilNext: 60, freeMinutesBeforeNext: null, uncertainPlans: ["walk"] },
    personalSchedule: { next: { id: "dinner" }, minutesUntilNext: 180, freeMinutesBeforeNext: 180, uncertainPlans: [] },
  });
  const ben = schedules("Ben");
  expect(ben.personalSchedule).toBeUndefined();
  expect(ben.liveSchedule).toEqual(ana.liveSchedule);
});

async function send(location?: unknown) {
  const response = await handleChat(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ location, context: { timeZone: "Europe/London" }, messages: [{ id: "m", role: "user", parts: [{ type: "text", text: "Food near me before the museum?" }] }] }) }), trip.id);
  expect(response.status).toBe(200);
  return response.text();
}

function provider(requests: GeminiRequest[], rejectMapsStatus?: number) {
  vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as GeminiRequest;
    requests.push(body);
    if (rejectMapsStatus && body.tools?.some((t) => t.googleMaps)) return Response.json({ error: { code: rejectMapsStatus, message: "Grounding unavailable", status: "PERMISSION_DENIED" } }, { status: rejectMapsStatus });
    const data = { candidates: [{ content: { role: "model", parts: [{ text: "Check the itinerary." }] }, finishReason: "STOP", groundingMetadata: rejectMapsStatus ? undefined : { groundingChunks: [{ maps: { uri: "https://maps.google.com/?cid=123", title: "Museum Café" } }] } }] };
    return new Response(`data: ${JSON.stringify(data)}\n\n`, { headers: { "content-type": "text/event-stream" } });
  }));
}

it("sends the rounded Maps origin for one turn, exact schedule gap and local clock, and streams source links", async () => {
  const requests: GeminiRequest[] = [];
  provider(requests);
  expect(await send(location)).toContain("https://maps.google.com/?cid=123");
  const request = requests[0];
  expect(request.toolConfig?.retrievalConfig?.latLng).toEqual({ latitude: 48.859, longitude: 2.346 });
  const instructions = request.systemInstruction?.parts.map((p) => p.text).join(" ");
  expect(instructions).toContain("Device local time: 2026-05-17 16:00 (Europe/London)");
  expect(instructions).toContain('"minutesUntilNext":60');
  expect(instructions).not.toContain("48.858624");
  await send();
  expect(requests[1].toolConfig?.retrievalConfig).toBeUndefined();
  const noLocation = requests[1].systemInstruction?.parts.map((p) => p.text).join(" ");
  expect(noLocation).toContain("No device position was shared");
  expect(noLocation).toContain("Device local time: 2026-05-17 16:00 (Europe/London)");
});

it.each([400, 403, 429])("drops location and falls back to saved trip context when Maps returns %i", async (status) => {
  const requests: GeminiRequest[] = [];
  provider(requests, status);
  expect(await send(location)).toContain("Check the itinerary.");
  expect(requests).toHaveLength(2);
  expect(requests[1].toolConfig?.retrievalConfig).toBeUndefined();
  expect(requests[1].systemInstruction?.parts.map((p) => p.text).join(" ")).toContain("Live Google Maps and Google Search are unavailable");
});
