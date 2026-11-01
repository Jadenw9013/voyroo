import { test as base, expect, type Page } from "@playwright/test";

export { expect };

/*
 * A trip page is drawn by the server first and comes alive when React hydrates
 * it. A tap before then does nothing, and on a slow CI machine that gap can
 * last seconds. So after any navigation that lands on a trip page (not its
 * join page), wait until the app marks itself hydrated (TripApp sets
 * html[data-hydrated]) before the test goes on to tap anything.
 */
async function settled(page: Page) {
  const path = new URL(page.url()).pathname;
  if (!/^\/t\/[^/]+(\/|$)/.test(path) || path.endsWith("/join")) return;
  await page.locator('html[data-hydrated="true"]').waitFor({ state: "attached", timeout: 30_000 });
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    const after =
      <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        const result = await fn(...args);
        await settled(page);
        return result;
      };
    page.goto = after(page.goto.bind(page));
    page.reload = after(page.reload.bind(page));
    page.waitForURL = after(page.waitForURL.bind(page));
    // E2E_CPU_THROTTLE=6 slows the browser like a small CI runner, to reproduce timing failures locally.
    const rate = Number(process.env.E2E_CPU_THROTTLE);
    if (rate > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
    await provide(page);
  },
});
