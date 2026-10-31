import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * /api/photo can cost a model call, a Bing Images page and several image
 * downloads per request, so: only for people with trip access, rate limited,
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
import { forgetPhotosForTests } from "./photos";
import { MemoryBackend, TripStore } from "./store";
import { GET as photo } from "@/app/api/photo/route";

const JPEG = new Uint8Array(3000).fill(7);
const TOKEN = "f".repeat(64);
const BING = [
  "turl&quot;:&quot;https://internal.example/private.jpg&amp;",
  "turl&quot;:&quot;https://img.example/redirects-inward.jpg&amp;",
  "turl&quot;:&quot;https://img.example/drawing.svg&amp;",
  "turl&quot;:&quot;https://tse.mm.bing.net/th?id=OIP.good&amp;",
].join(" ");

const ask = (query = "title=Lake%20Atitlan&dest=Guatemala&kind=activity&idx=0&v=2", headers: Record<string, string> = {}) =>
  photo(new Request(`http://localhost/api/photo?${query}`, { headers }));
const fetched = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  jar.clear();
  forgetPhotosForTests();
  setStoreForTests(new TripStore(new MemoryBackend()));
  vi.stubEnv("CHAT_MOCK", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("https://www.bing.com/")) return new Response(BING, { headers: { "content-type": "text/html" } });
    if (url === "https://img.example/redirects-inward.jpg") return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    if (url === "https://img.example/drawing.svg") return new Response("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>".padEnd(3000), { headers: { "content-type": "image/svg+xml" } });
    if (url === "https://tse.mm.bing.net/th?id=OIP.good") return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
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
    expect(fetched()).toEqual(["https://tse.mm.bing.net/th?id=OIP.good"]);
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
});
