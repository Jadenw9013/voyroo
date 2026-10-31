import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

/*
 * Deciding together: two people vote on an idea and talk about it, the list
 * sorts by what's most wanted, what's new is marked, and none of it reaches
 * the view-only link.
 */

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function person(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext(PHONE)).newPage();
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill(name);
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
  return page;
}

/** Waits for the server to confirm a change (its toast gets Undo), then closes the toast. */
async function saved(page: Page, message: string) {
  const toast = page.getByRole("status").filter({ hasText: message });
  await expect(toast.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await toast.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(toast).toHaveCount(0);
}

/** Axe in both themes, set the way Trip, Display sets them (the app is dark unless asked for light). */
async function noSeriousProblems(page: Page) {
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(async (t) => {
      document.documentElement.setAttribute("data-theme", t);
      // Colors ease between themes: check the settled ones.
      await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
    }, theme);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${theme}: ${v.id} ${v.nodes.map((n) => `${n.target.join(" ")} (${n.failureSummary})`).join(", ")}`)).toEqual([]);
  }
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

const thread = async (page: Page, id: string) => {
  const { trip } = await (await page.request.get("/api/t/guatemala")).json();
  return trip.items.find((i: { id: string }) => i.id === id) as { reactions?: unknown[]; comments?: { text: string }[] } | undefined;
};

test("vote on an idea, talk it over, see what's new, and keep it off the public link", async ({ browser }) => {
  const title = `Sunrise boat ${Date.now().toString(36)}`;
  const ana = await person(browser, "Ana");
  const add = await ana.request.post("/api/t/guatemala/ops", { data: { ops: [{ op: "item.add", item: { id: "i_sunrise_boat", kind: "activity", title } }] } });
  expect(add.ok()).toBe(true);

  // Ana says she's in, from the list, with one tap.
  await ana.goto("/t/guatemala/plan/ideas");
  const anaVotes = ana.getByRole("group", { name: `Votes on ${title}` });
  await anaVotes.getByRole("button", { name: /^I'm in/ }).click();
  await expect(anaVotes.getByRole("button", { name: "I'm in (1)" })).toHaveAttribute("aria-pressed", "true");
  await expect(anaVotes).toContainText("1 person is in: Ana.");
  await saved(ana, `You're in for “${title}”`);

  // And starts the thread on the item page.
  await ana.getByRole("button", { name: new RegExp(title) }).first().click();
  await expect(ana.getByRole("heading", { name: title })).toBeVisible();
  await ana.getByLabel("Write a comment").fill("Worth the 4 AM alarm?");
  await ana.getByRole("button", { name: "Post", exact: true }).click();
  await expect(ana.getByRole("region", { name: /Comments/ })).toContainText("Worth the 4 AM alarm?");
  await saved(ana, "Comment posted");
  expect((await thread(ana, "i_sunrise_boat"))?.comments?.length).toBe(1);
  await noSeriousProblems(ana);

  // Ben sees the new comment marked, can't touch Ana's, and adds his maybe.
  const ben = await person(browser, "Ben");
  await ben.goto("/t/guatemala/plan/ideas");
  await ben.getByRole("radio", { name: "Most wanted" }).click();
  const first = ben.getByRole("region", { name: "Ideas" }).getByRole("listitem").first();
  await expect(first).toContainText(title);
  await expect(first).toContainText("1 new");
  const benVotes = ben.getByRole("group", { name: `Votes on ${title}` });
  await benVotes.getByRole("button", { name: /^Maybe/ }).click();
  await expect(benVotes).toContainText("1 person is in: Ana. 1 says maybe: Ben.");
  await saved(ben, `You said maybe to “${title}”`);
  await noSeriousProblems(ben);

  await first.getByRole("button", { name: new RegExp(title) }).first().click();
  const comments = ben.getByRole("region", { name: /Comments/ });
  await expect(comments).toContainText("1 new since you last looked");
  await expect(comments.getByRole("listitem").filter({ hasText: "Worth the 4 AM alarm?" })).toContainText("New");
  await expect(comments.getByRole("button", { name: "Edit your comment" })).toHaveCount(0);
  await expect(ben.getByRole("region", { name: "What everyone thinks" })).toContainText("1 person is in: Ana. 1 says maybe: Ben.");
  await ben.getByLabel("Write a comment").fill("Only if there's coffee on the boat.");
  await ben.getByRole("button", { name: "Post", exact: true }).click();
  await expect(comments).toContainText("Ben (you)");
  await saved(ben, "Comment posted");
  await noSeriousProblems(ben);

  // Back on the list, what Ben has read is no longer new.
  await ben.getByRole("button", { name: "Back" }).click();
  await ben.goto("/t/guatemala/plan/ideas");
  const benRow = ben.getByRole("region", { name: "Ideas" }).getByRole("listitem").filter({ hasText: title });
  await expect(benRow.getByRole("group", { name: `Votes on ${title}` })).toBeVisible();
  await expect(benRow).not.toContainText("1 new");

  // Ana can edit and delete only her own comment.
  await ana.reload();
  const anaComments = ana.getByRole("region", { name: /Comments/ });
  await expect(anaComments.getByRole("button", { name: "Edit your comment" })).toHaveCount(1);
  await anaComments.getByRole("button", { name: "Edit your comment" }).click();
  await anaComments.getByRole("textbox", { name: "Edit your comment" }).fill("Worth the 4:30 AM alarm?");
  await anaComments.getByRole("button", { name: "Save", exact: true }).click();
  await expect(anaComments).toContainText("· edited");
  await saved(ana, "Comment edited");
  const forged = await ben.request.post("/api/t/guatemala/ops", { data: { ops: [{ op: "reaction.set", itemId: "i_sunrise_boat", by: "Ana", vote: "out" }] } });
  expect(forged.status()).toBe(403);

  // None of it shows on the view-only link.
  const { path } = await (await ana.request.post("/api/t/guatemala/preview", { data: {} })).json();
  const guest = await (await browser.newContext(PHONE)).newPage();
  const response = await guest.goto(path);
  const html = await response!.text();
  expect(html).toContain(title);
  expect(html).not.toContain("4:30 AM alarm");
  expect(html).not.toContain("coffee on the boat");
  await expect(guest.getByRole("group", { name: /Votes on/ })).toHaveCount(0);
  // Tests share one trip: leave it without a viewing link, as the sharing test expects.
  expect((await ana.request.delete("/api/t/guatemala/preview")).ok()).toBe(true);

  // Deleting keeps the thread's place without the words.
  await anaComments.getByRole("button", { name: "Delete your comment" }).click();
  await expect(anaComments).toContainText("You deleted a comment.");
  await expect(anaComments).not.toContainText("4:30 AM alarm");
  await expect(anaComments).toContainText("coffee on the boat");
  await saved(ana, "Comment deleted");
});

test("the assistant posts a comment only when asked, marked as written by it", async ({ browser }) => {
  const cara = await person(browser, "Cara");
  await cara.goto("/t/guatemala/item/activity-zipline");
  await cara.getByRole("button", { name: "Ask about this" }).click();
  const box = cara.getByLabel("Message the assistant");
  await box.fill("comment that I'm in for the morning slot");
  await box.press("Enter");
  // The first message compiles the chat route in dev: give it time.
  await expect(cara.getByText("Commented on “Zip lining”")).toBeVisible({ timeout: 20_000 });
  await cara.keyboard.press("Escape");
  const comments = cara.getByRole("region", { name: /Comments/ });
  await expect(comments).toContainText("Count me in for the morning slot.");
  await expect(comments).toContainText("via assistant");
  // It's Cara's comment: hers to edit or delete, and nobody's vote changed.
  await expect(comments.getByRole("button", { name: "Delete your comment" })).toHaveCount(1);
  const { trip } = await (await cara.request.get("/api/t/guatemala")).json();
  expect(trip.items.find((i: { id: string }) => i.id === "activity-zipline").reactions).toBeUndefined();
});
