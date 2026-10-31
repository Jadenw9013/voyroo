import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

// Only a supplied local synthetic export is served, on a fresh loopback port.
if (!process.argv[2]) throw new Error("Pass a synthetic MP4 path.");
const bytes = await readFile(process.argv[2]);
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/export.mp4") { response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": bytes.length }); response.end(bytes); }
  else { response.writeHead(200, { "Content-Type": "text/html" }); response.end('<!doctype html><video controls muted playsinline src="/export.mp4"></video>'); }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    const metadata = await page.locator("video").evaluate(async (video) => {
      const media = video as HTMLVideoElement;
      await media.play();
      return { width: media.videoWidth, height: media.videoHeight, duration: media.duration };
    });
    if (metadata.width !== 1080 || metadata.height !== 1920 || Math.abs(metadata.duration - 15) > 0.08) throw new Error("Browser metadata did not match.");
    await page.waitForFunction(() => document.querySelector("video")?.ended, undefined, { timeout: 25_000 });
    const error = await page.locator("video").evaluate((video) => (video as HTMLVideoElement).error?.code ?? null);
    if (error) throw new Error(`Browser playback failed: ${error}`);
    console.log(`${mobile ? "Mobile emulation" : "Desktop"} Chromium: full 15-second playback passed.`);
    await page.close();
  }
} finally { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
