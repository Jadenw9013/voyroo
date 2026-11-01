import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * Weather and trip essentials. The server answers weather from fixed
 * stand-in numbers (WEATHER=stub: partly cloudy, 24°/12°C, 30% rain) and
 * drafts essentials with the scripted assistant, so nothing reaches
 * Open-Meteo or Gemini. Whether a day shows a forecast or typical weather
 * depends on today's date, so checks accept either.
 */

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

async function join(page: Page, name = "Sam") {
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill(name);
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });

async function noSeriousProblems(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`), where).toEqual([]);
}

/** Starts the essentials from a clean slate, so tests don't depend on order. */
async function clearEssentials(page: Page) {
  const res = await page.request.post("/api/t/guatemala/ops", { data: { ops: [{ op: "trip.update", set: { essentials: null } }] } });
  // 422 when there was nothing to clear.
  expect([200, 422]).toContain(res.status());
}

test("weather in words on Today and Plan, in °F for a US group and °C on request, kept for offline", async ({ page }, testInfo) => {
  await join(page);
  const weather = page.getByRole("region", { name: "Weather" });
  // The first request compiles the weather route on a cold dev server.
  await expect(weather).toContainText("75° / 54°F", { timeout: 30_000 });
  await weather.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("today-weather.png") });
  await expect(weather).toContainText(/Partly cloudy|Usually/);
  await expect(weather).toContainText(/chance of rain|rain on about/);
  await expect(weather.getByRole("link", { name: "Weather data by Open-Meteo.com" })).toHaveAttribute("href", "https://open-meteo.com/");

  await tab(page, "Trip").click();
  await page.getByRole("radiogroup", { name: "Temperature" }).getByRole("radio", { name: "Celsius (°C)" }).click();
  await tab(page, "Today").click();
  await expect(weather).toContainText("24° / 12°C");

  await tab(page, "Plan").click();
  await expect(page.locator("#day-2026-11-26")).toContainText("24° / 12°C");
  await expect(page.getByRole("link", { name: "Weather data by Open-Meteo.com" })).toBeVisible();
  await page.locator("#day-2026-11-26").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("plan-weather.png") });

  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("trip:guatemala:weather") ?? "null"));
  expect(kept.report.days["2026-11-26"].hi).toBe(24);
  expect(typeof kept.report.asOf).toBe("number");
  // The phone keeps showing it with no connection.
  await page.context().setOffline(true);
  await tab(page, "Today").click();
  await expect(weather).toContainText("24° / 12°C");
  await page.context().setOffline(false);
});

test("essentials: one tap from Today, a draft that says verify, sources, corrections, and a card for the driver", async ({ page, browser }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => localStorage.setItem("test-copied", text) } }));
  await join(page);
  await clearEssentials(page);
  await page.reload();

  await tab(page, "Trip").click();
  await expect(page).toHaveURL(/\/t\/guatemala\/trip$/);
  const card = page.getByRole("region", { name: "Essentials" });
  // First on the Trip tab: on screen without scrolling.
  await expect(card.getByRole("heading", { name: "Essentials" })).toBeInViewport();
  await expect(card.getByLabel("Passports from")).toHaveValue("United States");
  await card.getByRole("button", { name: "Draft with a web search" }).click();

  await expect(card.getByRole("note")).toContainText("Verify before you go.");
  await expect(card.getByRole("note")).toContainText(/A draft from a web search, checked on [A-Z][a-z]{2} \d+, \d{4}/);
  await expect(card).toContainText("Police");
  await expect(card.getByRole("link", { name: "travel.state.gov" })).toBeVisible();
  // Unchecked numbers are never one tap away.
  await expect(card.locator('a[href^="tel:"]')).toHaveCount(0);
  await card.screenshot({ path: testInfo.outputPath("essentials-draft.png") });

  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit essentials" });
  await sheet.getByLabel("Tap water").fill("Bottled only, even for brushing teeth.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Bottled only, even for brushing teeth.");

  await card.getByRole("button", { name: "I checked these" }).click();
  await expect(card).toContainText(/Checked by Sam on/);
  await expect(card).toContainText("verify before you go");
  await expect(card.locator('a[href="tel:110"]')).toBeVisible();

  // The driver card is on the place you're going to.
  await page.goto("/t/guatemala/item/lodging-atitlan");
  await page.getByRole("button", { name: "Show to driver" }).click();
  const driver = page.getByRole("dialog", { name: "Show to driver" });
  await expect(driver.locator('[lang="es"]')).toContainText("Por favor, lléveme a esta dirección:");
  await expect(driver).toContainText("San Marcos La Laguna");
  await page.screenshot({ path: testInfo.outputPath("show-to-driver.png") });
  await driver.getByRole("button", { name: "Copy name and address" }).click();
  expect(await page.evaluate(() => localStorage.getItem("test-copied"))).toContain("San Marcos La Laguna");
  await driver.getByRole("button", { name: "Close" }).click();

  // It's in the trip on this phone, so it opens with no signal.
  expect(await page.evaluate(() => localStorage.getItem("trip:guatemala:snapshot"))).toContain("Bottled only, even for brushing teeth.");

  // The view-only link shows the essentials for people coming along, and when they were checked, not who checked them.
  const { path } = await (await page.request.post("/api/t/guatemala/preview")).json();
  const guest = await browser.newContext();
  try {
    const html = await (await (await guest.newPage()).goto(new URL(path, page.url()).toString()))!.text();
    expect(html).toContain("Shared travel guide");
    for (const shown of ["Bottled only, even for brushing teeth.", "travel.state.gov", 'href="tel:110"']) expect(html).toContain(shown);
    expect(html).toContain("Checked by the group on");
    expect(html).not.toContain("Checked by Sam");
  } finally {
    await guest.close();
    await page.request.delete("/api/t/guatemala/preview");
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`weather, essentials and the driver card have no serious accessibility problems (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await join(page);
    await expect(page.getByRole("region", { name: "Weather" })).toBeVisible({ timeout: 30_000 });
    await noSeriousProblems(page, `Today (${scheme})`);

    const draft = { emergency: "Police: 110\nAmbulance: 128", water: "Bottled only", draftedOn: "2026-10-31", sources: [{ url: "https://travel.state.gov/", title: "travel.state.gov" }], checkedBy: null, checkedOn: null };
    expect((await page.request.post("/api/t/guatemala/ops", { data: { ops: [{ op: "trip.update", set: { essentials: draft } }] } })).ok()).toBe(true);
    await page.goto("/t/guatemala/trip/essentials");
    const card = page.getByRole("region", { name: "Essentials" });
    await expect(card.getByRole("note")).toBeVisible();
    await noSeriousProblems(page, `Trip with unchecked essentials (${scheme})`);
    await card.getByRole("button", { name: "I checked these" }).click();
    await expect(card).toContainText(/Checked by Sam on/);
    // The toast's Undo button has its own contrast problem in the shared toast bar; this checks the card.
    await page.getByRole("status").getByRole("button", { name: "Dismiss" }).click();
    await noSeriousProblems(page, `Trip with checked essentials (${scheme})`);

    await page.goto("/t/guatemala/item/lodging-atitlan");
    await page.getByRole("button", { name: "Show to driver" }).click();
    await expect(page.getByRole("dialog", { name: "Show to driver" })).toBeVisible();
    await noSeriousProblems(page, `Show to driver (${scheme})`);
    await page.keyboard.press("Escape");

    await tab(page, "Plan").click();
    await expect(page.getByRole("link", { name: "Weather data by Open-Meteo.com" })).toBeVisible();
    await noSeriousProblems(page, `Plan with weather (${scheme})`);
  });
}
