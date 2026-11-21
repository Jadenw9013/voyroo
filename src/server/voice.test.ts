import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as transcribe } from "@/app/api/t/[tripId]/transcribe/route";
import { MAX_VOICE_BYTES, VOICE_SAMPLE_RATE, VOICE_SECONDS, validVoiceWav, voiceWav } from "@/domain/voiceAudio";
import { cookieName, encodeSession } from "./auth";
import { setStoreForTests } from "./db";
import { TripStore, MemoryBackend } from "./store";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined }) }));
const tripId = "test-trip";
const ctx = { params: Promise.resolve({ tripId }) };
const bytes = Buffer.from(voiceWav(Float32Array.of(-1, 0, 0.5, 1)));
function post(audio: string) {
  return new Request("http://localhost/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio }) });
}
const join = () => jar.set(cookieName(tripId), encodeSession({ tripId, name: "Ana" }));
beforeEach(() => { setStoreForTests(new TripStore(new MemoryBackend())); vi.stubEnv("CHAT_MOCK", "0"); vi.stubEnv("GEMINI_API_KEY", "test-only"); });
afterEach(() => { jar.clear(); setStoreForTests(undefined); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("encodes and bounds mono PCM so duration is known before calling Gemini", () => {
  expect(bytes.readUInt32LE(24)).toBe(VOICE_SAMPLE_RATE);
  expect([44, 46, 48, 50].map((offset) => bytes.readInt16LE(offset))).toEqual([-32768, 0, 16384, 32767]);
  expect(validVoiceWav(bytes)).toBe(true);
  expect(voiceWav(new Float32Array((VOICE_SECONDS + 1) * VOICE_SAMPLE_RATE)).byteLength).toBe(MAX_VOICE_BYTES);
  expect(validVoiceWav(Buffer.alloc(MAX_VOICE_BYTES + 2))).toBe(false);
  const incorrectSize = Buffer.from(bytes);
  incorrectSize.writeUInt32LE(4, 40);
  expect(validVoiceWav(incorrectSize)).toBe(false);
});

it("requires access to the trip, a valid recording and an available provider", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  expect((await transcribe(post(bytes.toString("base64")), ctx)).status).toBe(401);
  join();
  expect((await transcribe(post("bm90IGEgd2F2"), ctx)).status).toBe(400);
  const crossSite = post(bytes.toString("base64")); crossSite.headers.set("sec-fetch-site", "cross-site");
  expect((await transcribe(crossSite, ctx)).status).toBe(403);
  vi.stubEnv("GEMINI_API_KEY", "");
  expect((await transcribe(post(bytes.toString("base64")), ctx)).status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sends only the bounded audio to the transcription model and returns an editable draft", async () => {
  join();
  const captured: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: "  ¿Qué sigue?  " }] }, finishReason: "STOP" }] });
  }));
  const response = await transcribe(post(bytes.toString("base64")), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toEqual({ text: "¿Qué sigue?" });
  expect(captured).toHaveLength(1);
  expect(captured[0]).toMatchObject({ contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: bytes.toString("base64") } }] }] });
  expect(captured[0].tools).toBeUndefined();
  expect(JSON.stringify(captured[0])).not.toContain(tripId);
});

it("rejects oversized and rate-limited requests before any provider call", async () => {
  join();
  const provider = vi.fn(); vi.stubGlobal("fetch", provider);
  const oversized = post("");
  oversized.headers.set("Content-Length", "3000000");
  expect((await transcribe(oversized, ctx)).status).toBe(413);
  for (let i = 1; i < 60; i++) expect((await transcribe(post(""), ctx)).status).toBe(400);
  expect((await transcribe(post(bytes.toString("base64")), ctx)).status).toBe(429);
  expect(provider).not.toHaveBeenCalled();
});

it("keeps inaudible audio out of the user's draft", async () => {
  join();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [{ content: { role: "model", parts: [{ text: "[inaudible]" }] }, finishReason: "STOP" }] })));
  expect((await transcribe(post(bytes.toString("base64")), ctx)).status).toBe(422);
});
