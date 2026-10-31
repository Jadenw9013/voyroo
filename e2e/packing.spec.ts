import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

async function join(page: Page, name: string) {
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill(name);
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });
const packing = async (page: Page) => (((await (await page.request.get("/api/t/guatemala")).json()).trip.packing ?? []) as { text: string }[]).length;

async function noSeriousProblems(page: Page, what: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`), what).toEqual([]);
}

/** Toasts come and go on their own; a scan shouldn't depend on one being on screen. */
async function dismissToast(page: Page, text: string) {
  await page.getByRole("status").filter({ hasText: text }).getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("status").getByRole("button", { name: "Dismiss" })).toHaveCount(0);
}

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test("who brings what: quick add, claim and pack, and your own list stays yours", async ({ page, browser }) => {
  await join(page, "Sam");
  await page.getByRole("button", { name: "Add or ask", exact: true }).click();
  await page.keyboard.type("bring speaker - Ben");
  const composer = page.getByRole("dialog", { name: "Add or ask", exact: true });
  await expect(composer.getByText("On the shared list, and Ben is bringing it")).toBeVisible();
  await composer.getByRole("button", { name: "Add to packing list" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Put Ben down to bring “Speaker”" })).toBeVisible();

  await page.getByRole("button", { name: "Add or ask", exact: true }).click();
  await page.keyboard.type("pack sunscreen");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Added “Sunscreen” to your packing list" })).toBeVisible();

  // The packing list has its own address, under To-do.
  await tab(page, "To-do").click();
  await page.getByRole("tab", { name: /^Packing/ }).click();
  await expect(page).toHaveURL(/\/todo\/packing$/);
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("listitem").filter({ hasText: "Speaker" }).getByText("Ben is bringing it")).toBeVisible();
  await expect(panel.getByText("Sunscreen")).toHaveCount(0);

  await panel.getByLabel("Add to the shared list").fill("First-aid kit");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  const kit = panel.getByRole("listitem").filter({ hasText: "First-aid kit" });
  await expect(kit.getByText("Nobody's bringing it yet")).toBeVisible();
  await kit.getByRole("button", { name: "I'll bring it" }).click();
  await expect(kit.getByText("You're bringing it")).toBeVisible();
  // Ticked, it moves into the Packed section.
  await kit.getByRole("checkbox", { name: "Packed: First-aid kit" }).click();
  await panel.getByText(/^Packed \(\d+\)$/).click();
  const packed = panel.getByRole("listitem").filter({ hasText: "First-aid kit" });
  await expect(packed.getByText("Packed by you")).toBeVisible();
  await expect(packed.getByRole("checkbox", { name: "Packed: First-aid kit" })).toBeChecked();

  await page.getByRole("tab", { name: /^Mine/ }).click();
  await expect(panel.getByText(/Only you see your list here/)).toBeVisible();
  await expect(panel.getByText("Sunscreen")).toBeVisible();

  // Ben sees the speaker is his, and none of Sam's own list.
  const other = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true });
  const ben = await other.newPage();
  await join(ben, "Ben");
  await ben.goto("/t/guatemala/todo/packing");
  const benPanel = ben.getByRole("tabpanel");
  await expect(benPanel.getByRole("listitem").filter({ hasText: "Speaker" }).getByText("You're bringing it")).toBeVisible();
  await ben.getByRole("tab", { name: /^Mine/ }).click();
  await expect(benPanel.getByText("Your list is empty.")).toBeVisible();
  await expect(benPanel.getByText("Sunscreen")).toHaveCount(0);
  await other.close();
});

test("suggestions from the plan are reviewed, and nothing is added until picked", async ({ page }) => {
  await join(page, "Cara");
  await page.goto("/t/guatemala/todo/packing");
  const before = await packing(page);
  await page.getByRole("button", { name: "Suggest from our plan" }).click();
  const sheet = page.getByRole("dialog", { name: "Suggestions from your plan" });
  // The first request compiles the route in dev: give it time.
  await expect(sheet.getByRole("checkbox", { name: /Headlamp/ })).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByRole("checkbox", { name: /Headlamp/ })).toHaveAccessibleName(/Acatenango/);
  expect(await packing(page)).toBe(before);

  await sheet.getByRole("checkbox", { name: /Headlamp/ }).check();
  await sheet.getByRole("checkbox", { name: /Dry bag/ }).check();
  await sheet.getByRole("button", { name: "Add 2 to the list" }).click();
  await expect(sheet).not.toBeVisible();
  await expect.poll(() => packing(page)).toBe(before + 2);

  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("checkbox", { name: "Packed: Dry bag" })).toBeVisible();
  await page.getByRole("tab", { name: /^Mine/ }).click();
  await expect(panel.getByRole("listitem").filter({ hasText: "Headlamp" }).getByRole("button", { name: /Acatenango/ })).toBeVisible();

  // One Undo takes both back off.
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => packing(page)).toBe(before);
});

test("a to-do shows who's on it and its note, and both can be changed", async ({ page }) => {
  await join(page, "Dana");
  await tab(page, "To-do").click();
  const row = page.getByRole("listitem").filter({ hasText: "Travel insurance" });
  await row.getByRole("button", { name: "Edit Travel insurance" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit to-do" });
  await sheet.getByRole("button", { name: "Dana (you)" }).click();
  await sheet.getByLabel("Note").fill("Compare two quotes");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).not.toBeVisible();
  await expect(row.getByText("You're on it")).toBeVisible();
  await expect(row.getByText("Compare two quotes")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`the packing list has no serious accessibility problems (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await join(page, "Eli");
    await page.goto("/t/guatemala/todo/packing");
    const panel = page.getByRole("tabpanel");
    await panel.getByLabel("Add to the shared list").fill(`Cards ${scheme}`);
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await expect(panel.getByText(`Cards ${scheme}`)).toBeVisible();
    await dismissToast(page, `Cards ${scheme}`);
    await noSeriousProblems(page, `Shared (${scheme})`);

    await page.getByRole("tab", { name: /^Mine/ }).click();
    await panel.getByLabel("Add to your list").fill(`Charger ${scheme}`);
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await panel.getByLabel(`Add to your list`).fill(`Swimsuit ${scheme}`);
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await panel.getByRole("checkbox", { name: `Packed: Swimsuit ${scheme}` }).click();
    await dismissToast(page, `Packed “Swimsuit ${scheme}”`);
    await panel.getByText(/^Packed \(\d+\)$/).click();
    await expect(panel.getByRole("checkbox", { name: `Packed: Swimsuit ${scheme}` })).toBeChecked();
    await noSeriousProblems(page, `Mine (${scheme})`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: `Edit Charger ${scheme}` }).click();
    await expect(page.getByRole("dialog", { name: `Edit Charger ${scheme}` })).toBeVisible();
    await noSeriousProblems(page, `Edit sheet (${scheme})`);
    await page.getByRole("dialog", { name: `Edit Charger ${scheme}` }).getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Suggest from our plan" }).click();
    const sheet = page.getByRole("dialog", { name: "Suggestions from your plan" });
    await expect(sheet.getByRole("checkbox").first()).toBeVisible({ timeout: 20_000 });
    await noSeriousProblems(page, `Suggestions (${scheme})`);
  });
}
