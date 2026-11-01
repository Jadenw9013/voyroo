import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * /api/photo can cost several searches, image downloads and model checks
 * per request, so: only for people with trip access, rate limited,
 * cached across servers, and every download checked for private addresses.
 * No real network here: DNS and fetch are stand-ins.
 */

const { jar, fetchMock } = vi.hoisted(() => ({ jar: new Map<string, string>(), fetchMock: vi.fn<typeof fetch>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => void jar.set(name, value),
}) }));
vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => [{ address: host === "internal.example" ? "10.0.0.8" : "93.184.216.34", family: 4 }],
}));

import { writeSession } from "./auth";
import { getStore, setStoreForTests } from "./db";
import { requester } from "./http";
import { forgetPhotosForTests, photoQueries, setPhotoCheckForTests } from "./photos";
import { MemoryBackend, TripStore } from "./store";
import { GET as photo } from "@/app/api/photo/route";

const JPEG = new Uint8Array(3000).fill(7);
const WRONG = new Uint8Array(3000).fill(9);
const TOKEN = "f".repeat(64);
/** Search answers: Commons and Openverse candidates, interleaved by the server, best first. */
const COMMONS = JSON.stringify({ query: { pages: {
  "1": { index: 1, imageinfo: [{ thumburl: "https://internal.example/private.jpg", mime: "image/jpeg" }] },
  "2": { index: 2, imageinfo: [{ thumburl: "https://img.example/redirects-inward.jpg", mime: "image/jpeg" }] },
  "3": { index: 3, imageinfo: [{ thumburl: "https://img.example/map.svg", mime: "image/svg+xml" }] },
} } });
const OPENVERSE = JSON.stringify({ results: [
  { url: "https://img.example/cartoon.jpg", filetype: "jpg" },
  { url: "https://img.example/drawing.jpg", filetype: "jpg" },
  { url: "https://upload.example/good.jpg", filetype: "jpg" },
] });
const GOOD = "https://upload.example/good.jpg";
const isSearch = (u: string) => /commons\.wikimedia\.org|api\.openverse\.org|en\.wikipedia\.org/.test(u);

const ask = (query = "title=Lake%20Atitlan&dest=Guatemala&kind=activity&idx=0&v=2", headers: Record<string, string> = {}) =>
  photo(new Request(`http://localhost/api/photo?${query}`, { headers }));
const fetched = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  jar.clear();
  forgetPhotosForTests();
  setStoreForTests(new TripStore(new MemoryBackend()));
  vi.stubEnv("CHAT_MOCK", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  // The model's look at each picture: the cartoon fails, everything else passes.
  setPhotoCheckForTests(async (img) => img.bytes[0] !== 9);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("https://commons.wikimedia.org/")) return new Response(COMMONS, { headers: { "content-type": "application/json" } });
    if (url.startsWith("https://api.openverse.org/")) return new Response(OPENVERSE, { headers: { "content-type": "application/json" } });
    if (url.startsWith("https://en.wikipedia.org/")) return new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } });
    if (url === "https://img.example/redirects-inward.jpg") return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    if (url === "https://img.example/drawing.jpg") return new Response("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>".padEnd(3000), { headers: { "content-type": "image/svg+xml" } });
    if (url === "https://img.example/cartoon.jpg") return new Response(WRONG, { headers: { "content-type": "image/jpeg" } });
    if (url === GOOD) return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("/api/photo", () => {
  it("gives anyone without trip access the stock picture and looks nothing up", async () => {
    const res = await ask();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/lake-atitlan-hero\.jpg$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds a picture for someone in a trip, skipping private addresses, inward redirects and SVGs", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    const res = await ask();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
    const urls = fetched();
    expect(urls.some((u) => u.includes("internal.example"))).toBe(false);
    expect(urls).toContain("https://img.example/redirects-inward.jpg");
    expect(urls.some((u) => u.includes("169.254.169.254"))).toBe(false);
    expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
  });

  it("accepts a valid viewing link instead of a session, and nothing else", async () => {
    await getStore().claimPreview("guatemala", TOKEN);
    expect((await ask(`title=Lake&dest=Guatemala&kind=activity&trip=guatemala&token=${TOKEN}`)).status).toBe(200);
    fetchMock.mockClear();
    expect((await ask(`title=Other&dest=Guatemala&kind=activity&trip=guatemala&token=${"0".repeat(64)}`)).status).toBe(307);
    expect((await ask(`title=Other&dest=Guatemala&kind=activity&trip=another-trip&token=${TOKEN}`)).status).toBe(307);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares what it found with other servers, so the search isn't repeated", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    expect((await ask()).status).toBe(200);
    forgetPhotosForTests();
    fetchMock.mockClear();
    expect((await ask()).status).toBe(200);
    expect(fetched()).toEqual([GOOD]);
  });

  it("remembers when there's no picture, so the search isn't repeated either", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    fetchMock.mockImplementation(async () => new Response("", { headers: { "content-type": "text/html" } }));
    expect((await ask()).status).toBe(307);
    fetchMock.mockClear();
    forgetPhotosForTests();
    expect((await ask()).status).toBe(307);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops looking things up for one person after the hourly limit, but still serves what's cached", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    expect((await ask()).status).toBe(200);
    const who = await requester(new Request("http://localhost/api/photo"));
    for (let i = 0; i < 200; i++) await getStore().hit(`photo:${who}`, 3600);
    fetchMock.mockClear();
    const limited = await ask("title=Somewhere%20new&dest=Guatemala&kind=food");
    expect(limited.status).toBe(307);
    expect(limited.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await ask()).status).toBe(200);
  });

  it("searches with the place's own short name, most specific first", () => {
    expect(photoQueries({ title: "Hobbitenango", place: "Hobbitenango", dest: "Antigua Guatemala", kind: "activity" })).toEqual(["Hobbitenango Antigua Guatemala", "Hobbitenango"]);
    expect(photoQueries({ title: "Krabi Heritage Hotel", dest: "Krabi", kind: "stay" })).toEqual(["Krabi Heritage Hotel"]);
    expect(photoQueries({ title: "Krabi", dest: "Krabi", kind: "destination" })).toEqual(["Krabi landscape", "Krabi city", "Krabi"]);
  });

  it("shows only a picture the model confirms shows the place", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    const res = await ask();
    expect(res.status).toBe(200);
    // The cartoon downloaded first but was turned down.
    expect(fetched()).toContain("https://img.example/cartoon.jpg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
  });

  it("falls back to a confirmed picture of the destination, then to stock, never to a wrong picture", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    setPhotoCheckForTests(async (img, params) => params.kind === "destination" && img.bytes[0] === 7);
    const res = await ask("title=Krabi%20Heritage%20Hotel&dest=Krabi&kind=stay");
    expect(res.status).toBe(200);
    expect(fetched().filter(isSearch).at(-1)).toMatch(/Krabi%20(landscape|city)|=Krabi&/);

    forgetPhotosForTests();
    setPhotoCheckForTests(async () => false);
    const none = await ask("title=Somewhere%20else&dest=Krabi&kind=activity");
    expect(none.status).toBe(307);
    expect(none.headers.get("location")).toMatch(/\/photo-placeholder\.jpg$/);
  });

  it("with no model to check pictures, shows stock instead of an unchecked one", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    setPhotoCheckForTests(null);
    const res = await ask("title=Unchecked&dest=Guatemala&kind=activity");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/lake-atitlan-hero\.jpg$/);
  });

  it("never searches for flights or transfers: they get the plane picture", async () => {
    await writeSession({ tripId: "guatemala", name: "Sam" });
    const res = await ask("title=Flight%20SEA%20to%20TPE&dest=Taipei&kind=flight");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/flight-sunset-wing\.jpg$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("outside Guatemala, the stand-in is a plain placeholder, not a Guatemala photo", async () => {
    const res = await ask("title=Railay%20Beach&dest=Krabi&kind=activity");
    expect(res.headers.get("location")).toMatch(/\/photo-placeholder\.jpg$/);
    expect((await ask("title=Night%20market&dest=Krabi&kind=stay")).headers.get("location")).toMatch(/\/hotel-room-night\.jpg$/);
  });
});
