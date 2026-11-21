import type { Page } from "@playwright/test";
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

test("Listen reads the visible reply with a local voice and can be stopped", async ({ page }) => {
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
