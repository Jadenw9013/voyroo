import AxeBuilder from "@axe-core/playwright";
import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * Travel time between stops. The server runs with ROUTING_MOCK=1 (see
 * playwright.config.ts): road-ish times worked out locally, never a call to
 * a real routing service.
 */

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

const DAY = "2026-11-25";
const stops = [
  { id: "e2e_coffee", kind: "food", title: "Coffee at Fernando's", start: { date: DAY, time: "08:00" }, end: { date: DAY, time: "08:45" }, place: { name: "Fernando's", lat: 14.5601, lng: -90.7328 } },
  { id: "e2e_tour", kind: "activity", title: "Hobbitenango morning", start: { date: DAY, time: "09:00" }, place: { name: "Hobbitenango", lat: 14.5432, lng: -90.696 } },
];

async function join(page: Page, name = "Sam") {
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill(name);
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });
// The connector right after the coffee stop. Other stops that day can have pins too (the map places the
// seed trip when an earlier test opens it), so match this one leg rather than any "min drive" row.
const leg = (scope: Page | Locator) => scope.getByRole("listitem").filter({ hasText: "Coffee at Fernando's" }).locator("xpath=following-sibling::li[1]");

async function noSeriousProblems(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`), where).toEqual([]);
}

test.afterEach(async ({ page }) => {
  await page.request.post("/api/t/guatemala/ops", { data: { ops: stops.map((s) => ({ op: "item.remove", id: s.id })) } });
});

test("shows the drive between two stops, flags a tight gap, and keeps the route for offline", async ({ page, context }) => {
  await join(page);
  const added = await page.request.post("/api/t/guatemala/ops", { data: { ops: stops.map((item) => ({ op: "item.add", item })) } });
  expect(added.ok()).toBe(true);

  await page.goto(`/t/guatemala/day/${DAY}`);
  const today = leg(page);
  await expect(today).toHaveCount(1);
  await expect(today).toContainText("About 10 min drive · 5.7 km");
  await expect(today).toContainText("Leave by 8:45 AM");
  // Coffee ends 8:45 and the tour starts at 9:00: a word and an icon, not just a color.
  await expect(today).toContainText("Tight: 10 min drive, 15 min gap");
  await expect(today).not.toContainText("estimate");
  // The connector sits between the two stops.
  // (With pins on the seed trip, the drive from last night's hotel can come before the coffee.)
  await expect(today.locator("xpath=preceding-sibling::li[1]")).toContainText("Coffee at Fernando's");
  await expect(today.locator("xpath=following-sibling::li[1]")).toContainText("Hobbitenango morning");

  // Kept on the phone with the trip.
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("trip:guatemala:routes") ?? "{}").routes ?? {}).length)).toBeGreaterThanOrEqual(1);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await noSeriousProblems(page, `Today with a connector (${scheme})`);
  }
  await page.emulateMedia({ colorScheme: "light" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await tab(page, "Plan").click();
  await expect(leg(page.locator(`#day-${DAY}`))).toContainText("Leave by 8:45 AM");

  await page.locator(`#day-${DAY}`).getByRole("button", { name: /Hobbitenango morning/ }).click();
  const from = page.getByRole("region", { name: "From previous stop" });
  await expect(from).toContainText("Coffee at Fernando's");
  await expect(from).toContainText("About 10 min drive · 5.7 km");
  await expect(from).toContainText("Leave by 8:45 AM");
  await expect(from).toContainText("Tight: 10 min drive, 15 min gap");
  await expect(from.getByRole("link", { name: "Directions from Coffee at Fernando's" })).toHaveAttribute("href", /travelmode=driving/);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await noSeriousProblems(page, `Item page with From previous stop (${scheme})`);
  }
  await page.emulateMedia({ colorScheme: "light" });

  // No route service reachable: the saved route still shows, not a guess.
  await page.route("**/api/t/guatemala/routes", (r) => r.abort("internetdisconnected"));
  await page.goto(`/t/guatemala/day/${DAY}`);
  await expect(leg(page)).toContainText("About 10 min drive · 5.7 km");
  await context.setOffline(true);
  await tab(page, "Plan").click();
  await expect(leg(page.locator(`#day-${DAY}`))).not.toContainText("estimate");
  await context.setOffline(false);
});

test("with no road times, shows a straight-line estimate that says so", async ({ page }) => {
  await join(page);
  const added = await page.request.post("/api/t/guatemala/ops", { data: { ops: stops.map((item) => ({ op: "item.add", item })) } });
  expect(added.ok()).toBe(true);
  // A server with no routing key set up.
  await page.route("**/api/t/guatemala/routes", (r) => r.fulfill({ json: { routes: {}, pending: 0, provider: null } }));
  await page.evaluate(() => localStorage.removeItem("trip:guatemala:routes"));
  await page.goto(`/t/guatemala/day/${DAY}`);
  await expect(leg(page)).toContainText("(estimate)");
  await expect(leg(page)).toContainText("Leave by");
  await leg(page).locator("xpath=following-sibling::li[1]").getByRole("button", { name: /Hobbitenango morning/ }).click();
  const from = page.getByRole("region", { name: "From previous stop" });
  await expect(from).toContainText("(estimate)");
  await expect(from).toContainText("Rough estimate from the straight-line distance");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await noSeriousProblems(page, `Estimate on the item page (${scheme})`);
  }
});
