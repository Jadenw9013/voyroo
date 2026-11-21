import { expect, test } from "./fixtures";

declare global {
  interface Window {
    voiceTest: { grants: (() => void)[]; streams: MediaStream[] };
  }
}

test("cancelling a permission request releases a late microphone grant and preserves a new recording", async ({ page }) => {
  const uploads: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/transcribe")) uploads.push(request.url()); });
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill("Ana");
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
  await page.evaluate(() => {
    const streams: MediaStream[] = [];
    const grants: (() => void)[] = [];
    const getUserMedia = () => new Promise<MediaStream>((resolve) => {
      const audio = new AudioContext();
      const stream = audio.createMediaStreamDestination().stream;
      streams.push(stream);
      grants.push(() => resolve(stream));
    });
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia } });
    window.voiceTest = { grants, streams };
  });

  await page.getByRole("button", { name: "Ask Voyroo", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Ask Voyroo" });
  const capture = sheet.getByRole("button", { name: "Record voice" });
  const cancel = sheet.getByRole("button", { name: "Cancel voice" });
  const send = sheet.getByRole("button", { name: "Send", exact: true });
  const draft = sheet.getByRole("textbox", { name: "Message the assistant" });
  await draft.fill("Keep my draft");
  await capture.click();
  await expect(send).toBeDisabled();
  await cancel.click();
  await capture.click();
  const grant = (index: number) => page.evaluate((i) => window.voiceTest.grants[i](), index);
  const trackState = (index: number) => page.evaluate((i) => window.voiceTest.streams[i].getAudioTracks()[0].readyState, index);
  await expect.poll(() => page.evaluate(() => window.voiceTest.grants.length)).toBe(2);
  await grant(1);
  await expect(sheet.getByRole("button", { name: "Stop and transcribe" })).toBeVisible();
  await grant(0);
  await expect.poll(() => trackState(0)).toBe("ended");
  expect(await trackState(1)).toBe("live");
  await cancel.click();
  await expect.poll(() => trackState(1)).toBe("ended");
  await expect(send).toBeEnabled();
  await expect(draft).toHaveValue("Keep my draft");
  expect(uploads).toEqual([]);
});
