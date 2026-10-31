import { expect, test } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { validateEdit } from "../domain/edit";
import collection from "../fixtures/collection.json" with { type: "json" };

test("replacement and crop persist in the downloaded edit; invalid choices preserve it", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByLabel("Replace this shot").selectOption("synthetic-8");
  await expect(page.getByRole("alert")).toContainText("must-include");
  await expect(page.getByLabel("Replace this shot")).toHaveValue("synthetic-1");
  await page.getByLabel("Must include this moment").uncheck();
  await page.getByLabel("Replace this shot").selectOption("synthetic-8");
  await page.getByLabel("Framing", { exact: true }).selectOption("cover");
  await page.getByLabel("Horizontal crop").fill("0.25");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save edit for export" }).click();
  const download = await pending;
  const path = await download.path();
  const draft = validateEdit(collection, JSON.parse(await readFile(path!, "utf8"))).draft;
  expect(draft.shots[0]).toMatchObject({ assetId: "synthetic-8", crop: { layout: "cover", x: 0.25 } });
  expect(draft.shots.reduce((sum, shot) => sum+shot.duration, 0)).toBe(450);
  await mkdir("artifacts", { recursive: true });
  await download.saveAs("artifacts/edited-fixture.json");
  await page.screenshot({ path: "artifacts/editor-desktop.png", fullPage: true });
  expect(failures).toEqual([]);
});

test("phone editor has no horizontal overflow and private responses are uncached", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("button", { name: "Edit shot 6", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit shot 6", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shot 6", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((items) => items.length))).toBe(0);
  await page.screenshot({ path: "artifacts/editor-mobile.png", fullPage: true });
});

test("importing a collection keeps the existing draft until moments are explicitly chosen", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Excluded moments and local files", { exact: true }).click();
  await page.getByLabel("Open collection").setInputFiles({ name: "collection.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(collection)) });
  const picker = page.getByRole("region", { name: "Choose collection moments" });
  await expect(picker).toBeVisible();
  await expect(page.getByLabel("Replace this shot")).toHaveValue("synthetic-1");
  await picker.getByLabel("synthetic-8", { exact: false }).check();
  await picker.getByLabel("synthetic-3", { exact: false }).check();
  await picker.getByLabel("synthetic-1", { exact: false }).check();
  await picker.getByRole("button", { name: "Create edit from selected moments" }).click();
  await expect(picker).not.toBeVisible();
  await expect(page.getByLabel("Replace this shot")).toHaveValue("synthetic-8");
  await page.getByRole("button", { name: "Edit shot 2", exact: true }).click();
  await expect(page.getByLabel("Replace this shot")).toHaveValue("synthetic-3");
  await page.getByLabel("Replace this shot").selectOption("synthetic-2");
  await expect(page.getByLabel("Replace this shot")).toHaveValue("synthetic-2");
});
