import { createHmac } from "node:crypto";
import { expect, test } from "./fixtures";

test("the trip owner can reset the passcode from Trip and Share trip", async ({ page, context, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Issue a synthetic account to the isolated Playwright server, which runs without OAuth.
  const payload = Buffer.from(JSON.stringify({
    purpose: "account",
    expires: Date.now() + 120_000,
    value: { id: "c".repeat(64), name: "Ana", email: "ana@example.com" },
  })).toString("base64url");
  const signature = createHmac("sha256", "test-only-playwright-session-secret").update(payload).digest("base64url");
  await context.addCookies([{ name: "travel_account", value: `${payload}.${signature}`, url: baseURL! }]);
  const oldPasscode = "test-old-code";
  const newPasscode = "test-new-code";
  const created = await page.request.post("/api/trips", { data: {
    name: "Passcode settings", destination: "Lima", startDate: "2027-05-01", endDate: "2027-05-04",
    tz: "America/Lima", currency: "PEN", me: "Ana", passcode: oldPasscode,
  } });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  const tripPath = `/t/${id}`;
  const member = await browser.newContext({ baseURL });
  const newcomer = await browser.newContext({ baseURL });
  const join = (guest: typeof member, passcode: string) => guest.request.post(`/api${tripPath}/join`, { data: { name: "Bo", passcode } });
  try {
    expect((await join(member, oldPasscode)).status()).toBe(200);
    await page.goto(`${tripPath}/trip`);
    const change = page.getByRole("button", { name: "Change passcode", exact: true });
    await expect(change).toBeInViewport();
    await change.click();
    const sheet = page.getByRole("dialog", { name: "Change trip passcode" });
    await expect(sheet.getByLabel("Current passcode")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: "Share trip", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share trip", exact: true });
    await share.getByRole("button", { name: "Change passcode" }).click();
    const passcode = sheet.getByLabel("New passcode", { exact: true });
    await expect(passcode).toBeFocused();
    await passcode.fill(newPasscode);
    await sheet.getByRole("button", { name: "Show passcode" }).click();
    await expect(passcode).toHaveAttribute("type", "text");
    await sheet.getByRole("button", { name: "Hide passcode" }).click();
    await sheet.getByRole("button", { name: "Save new passcode" }).click();
    await expect(sheet.getByRole("status")).toHaveText("Passcode changed.");
    await expect(sheet.getByText(newPasscode)).toHaveCount(0);
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(share).toBeVisible();

    expect((await join(newcomer, oldPasscode)).status()).toBe(403);
    expect((await join(newcomer, newPasscode)).status()).toBe(200);
    expect((await member.request.get(`/api${tripPath}`)).status()).toBe(200);
    const memberPage = await member.newPage();
    await memberPage.goto(`${tripPath}/trip`);
    await expect(memberPage.getByRole("heading", { name: "Passcode settings" })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Change passcode", exact: true })).toHaveCount(0);
  } finally {
    await Promise.all([member.close(), newcomer.close()]);
  }
});
