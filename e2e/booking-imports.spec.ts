import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, test } from "./fixtures";

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test.describe(`booking imports at ${viewport.width}px`, () => {
    test.use({ viewport });
    test("email to itinerary, offline download, receipt to group balances", async ({ page, context }) => {
      const created = await page.request.post("/api/trips", { data: {
        name: "Import test", destination: "Guatemala", startDate: "2026-12-01", endDate: "2026-12-04",
        tz: "America/Guatemala", currency: "USD", me: "Sam", passcode: "fixture-passcode",
      } });
      expect(created.ok()).toBe(true);
      const { id } = await created.json();
      const path = `/t/${id}`;
      const group = await page.request.post(`/api${path}/ops`, { data: {
        ops: [{ op: "trip.update", set: { people: ["Sam", "Ana"] } }],
      } });
      expect(group.ok()).toBe(true);
      await page.goto(`${path}/plan`);
      await page.getByRole("button", { name: "Import booking email", exact: true }).click();
      const mail = page.getByRole("dialog", { name: "Booking emails" });
      await mail.getByLabel("Or paste a confirmation email").fill(`Hotel confirmation TEST123. ${viewport.width}`);
      await mail.getByRole("button", { name: "Add bookings to itinerary" }).click();
      await expect(mail.getByRole("status")).toContainText(/Added 1 booking|already on your plan/);
      await mail.getByRole("button", { name: "Close", exact: true }).click();
      const state = (await (await page.request.get(`/api${path}`)).json()).trip;
      const hotel = state.items.find((i: { booking?: { confirmation?: string } }) => i.booking?.confirmation === "TEST123");
      expect(hotel.booking.source).toBe("Expedia.com");
      await page.goto(`${path}/item/${hotel.id}`);
      await expect(page.getByText("Expedia.com", { exact: true })).toBeVisible();
      await page.goto(`${path}/plan`);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Save bookings offline" }).click();
      const download = await downloadPromise;
      const html = await readFile((await download.path())!, "utf8");
      const offline = await context.newPage();
      await context.setOffline(true);
      await offline.setContent(html);
      await expect(offline.getByText("TEST123", { exact: true })).toBeVisible();
      await expect(offline.getByText("Expedia.com", { exact: true })).toBeVisible();
      await offline.close();
      await context.setOffline(false);
      await page.goto(`${path}/expenses`);
      await page.getByRole("button", { name: "Log expense", exact: true }).click();
      const form = page.getByRole("dialog", { name: "Log expense" });
      const photo = await sharp({ create: { width: 200, height: 400, channels: 3, background: "white" } }).png().toBuffer();
      await form.getByLabel("Receipt photo").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: photo });
      await expect(form.getByLabel("Amount", { exact: true })).toHaveValue("120");
      await expect(form.getByRole("img", { name: "Attached receipt" })).toBeVisible();
      // Correct the model's total before saving; balances must use the corrected amount.
      await form.getByLabel("Amount", { exact: true }).fill("100");
      await form.getByRole("button", { name: "Log expense", exact: true }).click();
      await expect(form).not.toBeVisible();
      await expect(page.getByRole("region", { name: "Balances" })).toContainText("You get back $50");
      await expect(page.getByRole("region", { name: "Settle up" })).toContainText("Ana pays you $50");
      const after = (await (await page.request.get(`/api${path}`)).json()).trip;
      expect(after.expenses[0].amount).toBe(100);
      expect(after.expenses[0].receiptId).toMatch(/^r-/);
      expect((await page.request.get(`/api${path}/receipts/${after.expenses[0].receiptId}`)).ok()).toBe(true);
    });
  });
}
