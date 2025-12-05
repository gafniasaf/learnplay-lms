import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080";

test.describe("Generic Plan UI", () => {
  test("loads generic list", async ({ page }) => {
    await page.goto(`${BASE_URL}/demo/generic`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Entity List" })).toBeVisible();
  });

  test("loads generic board", async ({ page }) => {
    await page.goto(`${BASE_URL}/demo/generic/board`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Generic Board" })).toBeVisible();
  });
});



