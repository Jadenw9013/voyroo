import type { Page } from "@playwright/test";
import { voiceWav, VOICE_SAMPLE_RATE } from "../src/domain/voiceAudio";
import { expect, test } from "./fixtures";

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-swiftshader"] },
});

const airportAnswer = [
  "**Aim to reach the terminal by 9:15 AM** for your 11:30 AM flight. If you’re checking a bag, give yourself another 15 minutes.",
  "### 1. Target terminal arrival",
  "For Alaska AS 501, plan to walk through the terminal doors between **9:00 and 9:15 AM**.",
  "### 2. Tuesday morning traffic",
  "* **Rush hour:** Expect the busiest stretch of the drive between 7:00 and 9:00 AM.",
  "* **Drive time:** Allow 25–45 minutes from downtown, plus time to park and walk to the terminal.",
  "* **By light rail:** Leave time to walk from the station to the ticket counters.",
  "### 3. Before you leave",
  "1. Check the [airport travel updates](https://www.portseattle.org/sea-tac) for current conditions.",
  "2. Have your boarding pass ready and confirm the departure gate.",
  "3. If you’re returning a rental car, budget time for the shuttle.",
  "### 4. At the airport",
  "Follow the signs to departures. Once you’re through security, check the boards before heading to the gate.",
].join("\n");

async function openAssistant(page: Page) {
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill("Sam");
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
  await page.getByRole("button", { name: "Ask Voyroo", exact: true }).click();
  return page.getByRole("dialog", { name: "Ask Voyroo" });
}

async function replyWith(page: Page, answer: string) {
  const events = [
    { type: "start", messageId: "test-answer" }, { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: answer },
    { type: "text-end", id: "text" }, { type: "finish" },
  ];
  await page.route("**/api/t/guatemala/chat", (route) => route.fulfill({
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
    body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n",
  }));
}

declare global {
  interface Window {
    testReplies: { open: () => void; chunk: (chunk: object) => void; close: () => void }[];
  }
}

/** Keep the browser on the real chat transport while controlling exactly when each SSE event arrives. */
async function controlReplies(page: Page) {
  await page.addInitScript(() => {
    window.testReplies = [];
    const realFetch = window.fetch;
    window.fetch = (input, init) => {
      if (input !== "/api/t/guatemala/chat") return realFetch(input, init);
      return new Promise<Response>((resolve, reject) => {
        const encoder = new TextEncoder();
        let controller: ReadableStreamDefaultController<Uint8Array>;
        const body = new ReadableStream<Uint8Array>({ start: (stream) => { controller = stream; } });
        window.testReplies.push({
          open: () => resolve(new Response(body, { headers: { "content-type": "text/event-stream" } })),
          chunk: (chunk) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)),
          close: () => controller.close(),
        });
        init?.signal?.addEventListener("abort", () => {
          const error = new DOMException("Stopped", "AbortError");
          reject(error);
          controller.error(error);
        }, { once: true });
      });
    };
  });
}

test("live reply progress shows motion, a quiet warning, and recovery after new text arrives", async ({ page }, info) => {
  await controlReplies(page);
  await page.setViewportSize({ width: 390, height: 650 });
  const sheet = await openAssistant(page);
  await page.clock.install();
  await sheet.getByRole("textbox", { name: "Message the assistant" }).fill("What’s nearby?");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  const progress = sheet.getByRole("status", { name: "Reply progress" });
  await expect(progress).toContainText("Sending your question");
  const bars = progress.locator(".reply-progress-bars i");
  await expect(bars.first()).toHaveCSS("animation-name", "reply-progress");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(bars.first()).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => window.testReplies[0].open());
  await expect(progress).toContainText("Waiting for the assistant");
  await page.evaluate(() => {
    const reply = window.testReplies[0];
    reply.chunk({ type: "start", messageId: "progress-test" });
    reply.chunk({ type: "tool-input-available", toolCallId: "map", toolName: "google_maps", input: {}, providerExecuted: true });
  });
  await expect(progress).toContainText("Checking Google Maps");
  await page.clock.fastForward(21_000);
  await expect(progress).toContainText("No update for 20 seconds");
  await expect(bars).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Stop", exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("reply-quiet.png") });
  await page.evaluate(() => {
    const reply = window.testReplies[0];
    reply.chunk({ type: "tool-output-available", toolCallId: "map", output: {}, providerExecuted: true });
    reply.chunk({ type: "text-start", id: "answer" });
    reply.chunk({ type: "text-delta", id: "answer", delta: "There’s a market nearby." });
  });
  await expect(progress).toContainText("Writing your reply");
  await page.screenshot({ path: info.outputPath("reply-writing.png") });
  await page.evaluate(() => {
    const reply = window.testReplies[0];
    reply.chunk({ type: "text-end", id: "answer" });
    reply.chunk({ type: "finish", finishReason: "stop" });
    reply.close();
  });
  await expect(progress).toBeEmpty();
  await expect(sheet.getByText("There’s a market nearby.")).toBeVisible();
});

test("a stopped reply holds a queued question, and an interrupted stream offers retry", async ({ page }) => {
  await controlReplies(page);
  const sheet = await openAssistant(page);
  const field = sheet.getByRole("textbox", { name: "Message the assistant" });
  await field.fill("What’s nearby?");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await field.fill("Is there a place for breakfast?");
  await field.press("Enter");
  await expect(sheet.getByText("Sends when this answer finishes")).toBeVisible();
  await sheet.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(sheet.getByRole("status", { name: "Reply progress" })).toContainText("Reply stopped");
  const sendQueued = sheet.getByRole("button", { name: "Send queued message" });
  await expect(sendQueued).toBeEnabled();
  expect(await page.evaluate(() => window.testReplies.length)).toBe(1);
  await sendQueued.click();
  await page.evaluate(() => {
    const reply = window.testReplies[1];
    reply.open();
    reply.chunk({ type: "start", messageId: "interrupted-test" });
    reply.close();
  });
  await expect(sheet.getByRole("alert")).toContainText("The connection closed before the reply finished");
  await sheet.getByRole("button", { name: "Try again" }).click();
  await page.evaluate(() => {
    const reply = window.testReplies[2];
    reply.open();
    reply.chunk({ type: "text-start", id: "retry" });
    reply.chunk({ type: "text-delta", id: "retry", delta: "The market opens at eight." });
    reply.chunk({ type: "text-end", id: "retry" });
    reply.chunk({ type: "finish" });
    reply.close();
  });
  await expect(sheet.getByText("The market opens at eight.")).toBeVisible();
});

for (const [name, viewport] of [
  ["phone", { width: 390, height: 650 }],
  ["desktop", { width: 1000, height: 760 }],
] as const) {
  test(`formatted answers scroll independently of the composer on ${name}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await replyWith(page, airportAnswer);
    const sheet = await openAssistant(page);
    const field = sheet.getByRole("textbox", { name: "Message the assistant" });
    await field.fill("When should I leave for my flight on Tuesday?");
    await sheet.getByRole("button", { name: "Send", exact: true }).click();
    const transcript = sheet.getByRole("region", { name: "Conversation", exact: true });
    await expect(transcript.getByRole("heading", { name: "1. Target terminal arrival" })).toHaveCount(1);
    await expect(transcript.getByRole("heading").first()).toHaveCSS("font-weight", "700");
    await expect(transcript.getByRole("listitem")).toHaveCount(6);
    await expect(transcript.locator("ul")).toHaveCSS("list-style-type", "disc");
    await expect(transcript.locator("li strong").first()).toHaveText("Rush hour:");
    await expect(transcript.getByRole("link", { name: "airport travel updates" })).toHaveAttribute("href", "https://www.portseattle.org/sea-tac");
    await expect(transcript.getByRole("link", { name: "airport travel updates" })).toHaveCSS("text-decoration-line", "underline");
    await expect(transcript).not.toContainText("###");

    for (const size of name === "phone" ? [viewport, { width: 360, height: 430 }] : [viewport]) {
      await page.setViewportSize(size);
      // visualViewport sends its resize event after the browser has resized the layout viewport.
      await expect.poll(() => field.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(size.height);
      await expect.poll(() => transcript.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const composerY = await field.evaluate((el) => el.getBoundingClientRect().top);
      const headerY = await sheet.getByRole("heading", { name: "Ask Voyroo" }).evaluate((el) => el.getBoundingClientRect().top);
      expect(await transcript.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(composerY);
      expect(await field.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(size.height);
      expect(await sheet.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await transcript.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      expect(await field.evaluate((el) => el.getBoundingClientRect().top)).toBe(composerY);
      expect(await sheet.getByRole("heading", { name: "Ask Voyroo" }).evaluate((el) => el.getBoundingClientRect().top)).toBe(headerY);
      await transcript.evaluate((el) => { el.scrollTop = 0; });
      if (size.width === viewport.width) await page.screenshot({ path: info.outputPath(`assistant-${name}.png`) });
    }
  });
}

test("cancel discards audio, stop transcribes into the draft, and Send submits the edited text", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/(chat|transcribe)$/.test(path)) requests.push(path.split("/").at(-1)!);
  });
  await replyWith(page, "Your next activity is the walking tour.");
  const sheet = await openAssistant(page);
  const field = sheet.getByRole("textbox", { name: "Message the assistant" });
  const record = sheet.getByRole("button", { name: "Record voice" });
  const send = sheet.getByRole("button", { name: "Send", exact: true });
  await field.fill("For our group:");
  await record.click();
  await expect(sheet.getByRole("button", { name: "Stop and transcribe" })).toBeVisible();
  await expect(send).toBeDisabled();
  await sheet.getByRole("button", { name: "Cancel voice" }).click();
  await expect(field).toHaveValue("For our group:");
  expect(requests).toEqual([]);

  await record.click();
  await expect(sheet.getByRole("button", { name: "Stop and transcribe" })).toBeVisible();
  // Capture enough synthetic audio for the browser's real encoder and minimum clip duration.
  await page.waitForTimeout(900);
  const response = page.waitForResponse("**/api/t/guatemala/transcribe");
  await sheet.getByRole("button", { name: "Stop and transcribe" }).click();
  expect((await response).status()).toBe(200);
  await expect(field).toHaveValue("For our group: What is next on our itinerary?");
  expect(requests).toEqual(["transcribe"]);
  const edited = "What time does our walking tour start?";
  await field.fill(edited);
  await send.click();
  await expect(sheet.getByRole("region", { name: "Conversation" })).toContainText(edited);
  await expect(sheet.getByText("Your next activity is the walking tour.")).toBeVisible();
  expect(requests).toEqual(["transcribe", "chat"]);
});

test("Listen plays Gemini audio for the visible reply and can be stopped", async ({ page }) => {
  const wav = Buffer.from(voiceWav(new Float32Array(4 * VOICE_SAMPLE_RATE)));
  await page.route("**/api/t/guatemala/speech", (route) => route.fulfill({ contentType: "audio/wav", body: wav }));
  await replyWith(page, "### Next activity\nYour **walking tour** starts at 2 PM.");
  const sheet = await openAssistant(page);
  await sheet.getByRole("textbox", { name: "Message the assistant" }).fill("What’s next?");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  const speech = page.waitForResponse("**/api/t/guatemala/speech");
  await sheet.getByRole("button", { name: "Listen to answer" }).click();
  expect((await speech).request().postDataJSON()).toMatchObject({ text: "Next activity\n\nYour walking tour starts at 2 PM." });
  await expect(sheet.getByText("Preparing audio…")).toBeHidden();
  const stop = sheet.getByRole("button", { name: "Stop reading" });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(sheet.getByRole("button", { name: "Listen to answer" })).toBeVisible();
});

test("Listen uses a local voice when Gemini speech is unavailable", async ({ page }) => {
  await page.route("**/api/t/guatemala/speech", (route) => route.fulfill({ status: 503 }));
  await page.addInitScript(() => {
    const synth = Object.assign(new EventTarget(), {
      getVoices: () => [{ localService: true, default: true, lang: "en-US" }],
      speak: (utterance: { text: string }) => { document.documentElement.dataset.spoken = utterance.text; },
      cancel: () => { document.documentElement.dataset.playback = "stopped"; },
    });
    Object.defineProperty(window, "speechSynthesis", { value: synth });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: class { constructor(public text: string) {} } });
  });
  await replyWith(page, "### Next activity\nYour **walking tour** starts at 2 PM.");
  const sheet = await openAssistant(page);
  await sheet.getByRole("textbox", { name: "Message the assistant" }).fill("What’s next?");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await sheet.getByRole("button", { name: "Listen to answer" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-spoken", "Next activity");
  await sheet.getByRole("button", { name: "Stop reading" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-playback", "stopped");
});
