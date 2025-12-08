import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || "http://localhost:8081";

// Skip: This test covers legacy demo routes (/demo/generic) which are not part of LearnPlay LMS core functionality
test.describe.skip("Generic Plan UI", () => {
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



