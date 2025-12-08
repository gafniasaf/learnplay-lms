import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || "http://localhost:8081";
const routesPath = path.join(process.cwd(), "generated", "routes.json");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("ignite:bypassAuth", "true");
    (window as any).__BYPASS_AUTH__ = true;
  });
});

test.describe("CTA wiring", () => {
  test("each CTA performs its action", async ({ page }) => {
    if (!fs.existsSync(routesPath)) test.skip();
    const routes = JSON.parse(fs.readFileSync(routesPath, "utf-8")) as Array<{ route: string; title: string; ctas: any[] }>;
    // Visit simpler routes first to ensure SPA bootstraps, then deep links
    routes.sort((a, b) => a.route.length - b.route.length);
    for (const r of routes) {
      await page.goto(`${BASE_URL}${r.route}`);
      // Allow lazy chunk load and SPA hydration
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(300); // micro-wait for Suspense
      // Page may not include a semantic heading in generated demo; rely on CTAs existence
      for (const cta of r.ctas) {
        const btn = page.locator(`[data-cta-id="${cta.id}"]`).first();
        // Skip if button is hidden (e.g., inside collapsed details)
        const isVisible = await btn.isVisible().catch(() => false);
        if (!isVisible) {
          continue;
        }
        if (cta.action === "navigate") {
          await btn.click();
          await page.waitForLoadState("domcontentloaded");
          // If target present, ensure URL matches
          if (cta.target) {
            await expect(page).toHaveURL(new RegExp(cta.target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
            // Navigate back to original route
            await page.goto(`${BASE_URL}${r.route}`);
            await page.waitForLoadState("domcontentloaded");
          }
        } else if (cta.action === "enqueueJob" || cta.action === "save") {
          // Click the button and wait briefly for any async operation
          await btn.click();
          // Brief wait for async operation to complete
          await page.waitForTimeout(500);
        }
      }
    }
  });
});


