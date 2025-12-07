import { test, expect } from "@playwright/test";

// REQUIRED env var per NO-FALLBACK policy
// Note: Could use Playwright's baseURL config and relative URLs instead
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
if (!BASE_URL) {
  throw new Error('❌ PLAYWRIGHT_BASE_URL is REQUIRED - set env var before running tests');
}

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



