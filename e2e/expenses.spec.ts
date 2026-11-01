import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * Expenses on a phone: logging from the + box and an item's page, who owes
 * whom, settling up with Undo, editing a split, offline logging, the
 * assistant, and accessibility in both themes. Rates come from the server's
 * made-up set (RATES_MOCK): 1 USD = Q7.7.
 */

const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

const TRIP = "/t/guatemala";

async function join(page: Page, name = "Sam") {
  await page.goto(`${TRIP}/join`);
  await page.getByLabel("Your first name").fill(name);
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
}

type Json = Record<string, unknown>;
const tripNow = async (page: Page) => (await (await page.request.get(`/api${TRIP}`)).json()).trip as { expenses?: Json[]; items: Json[] };

async function ops(page: Page, list: Json[]) {
  const r = await page.request.post(`/api${TRIP}/ops`, { data: { ops: list } });
  expect(r.ok(), await r.text()).toBe(true);
}

/** The tests share one in-memory trip: start each from no expenses and a known group. */
async function reset(page: Page) {
  const trip = await tripNow(page);
  await ops(page, [...(trip.expenses ?? []).map((e) => ({ op: "expense.remove", id: e.id })), { op: "trip.update", set: { people: ["Sam", "Ana", "Ben", "Cy"] } }]);
}

const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });

test("log a dinner in one line, see who owes whom, settle up and undo", async ({ page }) => {
  await join(page);
  await reset(page);
  await page.reload();

  // To-do leads to Expenses, at its own address.
  await tab(page, "To-do").click();
  await page.getByRole("button", { name: "Open expenses" }).click();
  await expect(page).toHaveURL(/\/t\/guatemala\/expenses$/);
  await expect(page.getByRole("heading", { name: "Expenses", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing logged yet")).toBeVisible();

  await page.getByRole("button", { name: "Add or ask", exact: true }).click();
  await page.keyboard.type("dinner 420 GTQ paid by Ana split all");
  const sheet = page.getByRole("dialog", { name: "Add or ask", exact: true });
  await expect(sheet.getByText("An expense, split 4 ways")).toBeVisible();
  await expect(sheet.getByLabel("Paid by")).toHaveValue("Ana");
  await expect(sheet.getByText("About $54.55", { exact: false })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(sheet).not.toBeVisible();
  await expect(toast(page, "Logged “Dinner”, Q420 paid by Ana")).toBeVisible();

  const balances = page.getByRole("region", { name: "Balances" });
  await expect(balances.getByText("You owe Q105")).toBeVisible();
  await expect(balances.getByRole("listitem").filter({ hasText: "Ana" })).toContainText("Gets back Q315");

  const settle = page.getByRole("region", { name: "Settle up" });
  const mine = settle.getByRole("listitem").filter({ hasText: "You pay Ana Q105" });
  await mine.getByRole("button", { name: "Mark settled" }).click();
  await expect(toast(page, "Recorded Sam paid Ana Q105")).toBeVisible();
  await expect(balances.getByText("You're square")).toBeVisible();
  await expect(settle.getByText("You pay Ana")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Logged" })).toContainText("You paid Ana back");

  await toast(page, "Recorded Sam paid Ana Q105").getByRole("button", { name: "Undo" }).click();
  await expect(balances.getByText("You owe Q105")).toBeVisible();
  await expect.poll(async () => (await tripNow(page)).expenses?.length).toBe(1);

  // Back returns to To-do, the way it came.
  await page.goBack();
  await expect(page).toHaveURL(/\/t\/guatemala\/todo$/);
});

test("log a booking's price from its page, change the split, then remove it", async ({ page }) => {
  await join(page);
  await reset(page);
  await ops(page, [{ op: "item.update", id: "activity-zipline", set: { booking: { price: { amount: 450, currency: "GTQ" } } } }]);
  await page.goto(`${TRIP}/item/activity-zipline`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Reservation price Q450", { exact: false })).toBeVisible();
  const sheet = page.getByRole("dialog", { name: "Log expense" });
  // Opened before the page has finished loading (other sites' embeds): tap again until it responds.
  await expect(async () => {
    await page.getByRole("button", { name: "Log expense" }).click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(sheet.getByLabel("What for")).toHaveValue("Zip lining");
  await expect(sheet.getByLabel("Amount", { exact: true })).toHaveValue("450");
  await sheet.getByRole("checkbox", { name: "Cy" }).uncheck();
  await expect(sheet.getByRole("listitem").filter({ hasText: "Sam (you)" })).toContainText("Q150");
  await sheet.getByRole("button", { name: "Log expense" }).click();
  await expect(sheet).not.toBeVisible();
  const logged = page.getByRole("button", { name: /Zip lining You paid, split 3 ways Q450/ });
  await expect(logged).toBeVisible();

  await logged.click();
  const edit = page.getByRole("dialog", { name: "Edit expense" });
  await edit.getByRole("radio", { name: "Set amounts" }).click();
  await edit.getByLabel("Amount for Sam").fill("250");
  await expect(edit.getByText("Q100 more than was paid")).toBeVisible();
  await edit.getByLabel("Amount for Ana").fill("50");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  await expect.poll(async () => (await tripNow(page)).expenses?.[0]?.split).toEqual({
    how: "exact",
    among: [
      { name: "Sam", amount: 250 },
      { name: "Ana", amount: 50 },
      { name: "Ben", amount: 150 },
    ],
  });

  await page.getByRole("button", { name: /Zip lining You paid, set amounts/ }).click();
  await page.getByRole("dialog", { name: "Edit expense" }).getByRole("button", { name: "Remove expense" }).click();
  await expect(toast(page, "Removed the expense “Zip lining”")).toBeVisible();
  await expect.poll(async () => (await tripNow(page)).expenses).toBeUndefined();
});

test("an expense logged offline syncs later with the rate it was logged at", async ({ page, context }) => {
  await join(page);
  await reset(page);
  await page.goto(`${TRIP}/expenses`);
  // The phone keeps the day's rates for when there's no signal.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("fx:rates"))).toContain("GTQ");

  await context.setOffline(true);
  await page.getByRole("button", { name: "Log expense" }).click();
  const sheet = page.getByRole("dialog", { name: "Log expense" });
  await sheet.getByLabel("What for").fill("Tuk tuk");
  await sheet.getByLabel("Amount", { exact: true }).fill("60");
  await expect(sheet.getByText("About $7.79", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Log expense" }).click();
  await expect(toast(page, "Logged “Tuk tuk”, Q60 paid by Sam. Saved on this phone")).toBeVisible();
  await expect(page.getByRole("region", { name: "Logged" })).toContainText("Tuk tuk");
  await expect(page.getByText("1 edit waiting to sync", { exact: false })).toBeVisible();

  await context.setOffline(false);
  await expect.poll(async () => (await tripNow(page)).expenses?.find((e) => e.title === "Tuk tuk")?.fx).toEqual({ to: "USD", rate: 0.12987013, on: "2026-11-01" });
});

test("the assistant logs what someone paid, with Undo", async ({ page }) => {
  await join(page);
  await reset(page);
  await page.reload();
  await page.getByRole("button", { name: "Ask Voyroo" }).click();
  const box = page.getByLabel("Message the assistant");
  await box.fill("log 80 for the taxi");
  await box.press("Enter");
  await expect(page.getByText("Logged “Test taxi”, Q80 paid by Sam")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "See who owes whom" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect.poll(async () => (await tripNow(page)).expenses?.[0]).toMatchObject({ title: "Test taxi", amount: 80, paidBy: "Sam", split: { how: "equal", among: ["Sam", "Ana", "Ben", "Cy"] } });
});

for (const scheme of ["light", "dark"] as const) {
  test(`no serious accessibility problems on Expenses (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await join(page);
    await reset(page);
    const expense = (id: string, title: string, amount: number, currency: string, paidBy: string, among: string[]) => ({
      op: "expense.add",
      expense: { id, title, amount, currency, paidBy, split: { how: "equal", among }, date: "2026-11-26", addedAt: 1 },
    });
    await ops(page, [expense("e_axe_1", "Boat to San Marcos", 300, "GTQ", "Ben", ["Sam", "Ana", "Ben", "Cy"]), expense("e_axe_2", "Hostel deposit", 40, "USD", "Sam", ["Sam", "Ana"])]);
    await page.goto(`${TRIP}/expenses`);
    await expect(page.getByRole("radio", { name: "All in USD" })).toBeChecked();
    const check = async (where: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`), `${where} (${scheme})`).toEqual([]);
    };
    await check("Expenses, all in USD");
    await page.getByRole("radio", { name: "In GTQ" }).click();
    await expect(page.getByRole("region", { name: "Settle up" })).toContainText("pays Ben Q");
    await check("Expenses, in GTQ");
    await page.getByRole("button", { name: /Boat to San Marcos/ }).click();
    await expect(page.getByRole("dialog", { name: "Edit expense" })).toBeVisible();
    await check("Edit expense sheet");
    await page.getByRole("dialog", { name: "Edit expense" }).getByRole("radio", { name: "By shares" }).click();
    await check("Split by shares");

    await page.setViewportSize({ width: 360, height: 740 });
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
