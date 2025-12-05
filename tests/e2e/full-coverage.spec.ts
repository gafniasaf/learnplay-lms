import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080";

test.describe("Full Coverage - All Routes and CTAs", () => {
  
  test.beforeEach(async ({ page }) => {
    // Bypass auth for testing
    await page.addInitScript(() => {
      window.localStorage.setItem("ignite:bypassAuth", "true");
      (window as any).__BYPASS_AUTH__ = true;
    });
  });

  test.describe("Dashboard (/dashboard)", () => {
    test("renders dashboard with plan list", async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`);
      await expect(page.locator("h1")).toContainText("Plan Overview");
    });

    test("hamburger menu opens and navigates", async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Click hamburger
      await page.click('[data-cta-id="menu-toggle"]');
      
      // Verify menu is visible
      await expect(page.locator('text=Settings')).toBeVisible();
      await expect(page.locator('text=Job History')).toBeVisible();
      await expect(page.locator('text=Help')).toBeVisible();
      
      // Navigate to settings
      await page.click('text=Settings');
      await expect(page).toHaveURL(/\/settings/);
    });

    test("create new plan and navigate to editor", async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Enter title
      await page.fill('input[data-field="title"]', `Test Plan ${Date.now()}`);
      
      // Click create
      await page.click('button:has-text("New Plan")');
      
      // Should navigate to editor
      await expect(page).toHaveURL(/\/plans\/editor\?id=/);
    });
  });

  test.describe("Editor (/plans/editor)", () => {
    let planId: string;
    
    test.beforeEach(async ({ page }) => {
      // Create a plan first
      await page.goto(`${BASE_URL}/dashboard`);
      await page.fill('input[data-field="title"]', `Editor Test ${Date.now()}`);
      await page.click('button:has-text("New Plan")');
      await page.waitForURL(/\/plans\/editor\?id=/);
      const url = page.url();
      planId = new URL(url).searchParams.get("id") || "";
    });

    test("loads plan data", async ({ page }) => {
      await page.goto(`${BASE_URL}/plans/editor?id=${planId}`);
      // Should show loading then content
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('.main')).toBeVisible();
    });

    test("send AI message triggers job", async ({ page }) => {
      await page.goto(`${BASE_URL}/plans/editor?id=${planId}`);
      
      // Type a message
      await page.fill('input[placeholder="Describe your app..."]', 'Build a todo app');
      
      // Send it
      await page.click('.chat-input button');
      
      // Should show job started toast
      await expect(page.locator('text=Job started').or(page.locator('text=Running'))).toBeVisible({ timeout: 5000 });
    });

    test("export plan saves", async ({ page }) => {
      await page.goto(`${BASE_URL}/plans/editor?id=${planId}`);
      
      // Click export
      await page.click('button:has-text("Export Golden Plan")');
      
      // Should show saved toast
      await expect(page.locator('text=Saved!')).toBeVisible({ timeout: 5000 });
    });

    test("back to dashboard works", async ({ page }) => {
      await page.goto(`${BASE_URL}/plans/editor?id=${planId}`);
      
      await page.click('text=← Back to Dashboard');
      
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("Settings (/settings)", () => {
    test("renders settings form", async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      await expect(page.locator("h1")).toContainText("Settings");
      await expect(page.locator('select[data-field="default_status"]')).toBeVisible();
    });

    test("test connection works", async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      
      await page.click('[data-cta-id="test-connection"]');
      
      // Should show result
      await expect(
        page.locator('text=Connected').or(page.locator('text=Failed'))
      ).toBeVisible({ timeout: 10000 });
    });

    test("back to dashboard works", async ({ page }) => {
      await page.goto(`${BASE_URL}/settings`);
      
      await page.click('[data-cta-id="back-to-dashboard"]');
      
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("Jobs (/jobs)", () => {
    test("renders job history", async ({ page }) => {
      await page.goto(`${BASE_URL}/jobs`);
      await expect(page.locator("h1")).toContainText("Job History");
    });

    test("shows jobs or empty state", async ({ page }) => {
      await page.goto(`${BASE_URL}/jobs`);
      
      // Either shows jobs table or empty state
      await expect(
        page.locator('text=No Jobs Yet').or(page.locator('text=Job'))
      ).toBeVisible({ timeout: 5000 });
    });

    test("back to dashboard works", async ({ page }) => {
      await page.goto(`${BASE_URL}/jobs`);
      
      await page.click('[data-cta-id="back-dashboard"]');
      
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("Help (/help)", () => {
    test("renders help page", async ({ page }) => {
      await page.goto(`${BASE_URL}/help`);
      await expect(page.locator("h1")).toContainText("Help");
    });

    test("FAQ accordion works", async ({ page }) => {
      await page.goto(`${BASE_URL}/help`);
      
      // First FAQ should be open by default
      await expect(page.locator('text=Simply describe your app')).toBeVisible();
      
      // Click second FAQ
      await page.click('text=What AI models are used?');
      await expect(page.locator('text=Claude Sonnet')).toBeVisible();
    });

    test("back to dashboard works", async ({ page }) => {
      await page.goto(`${BASE_URL}/help`);
      
      await page.click('[data-cta-id="back-dashboard"]');
      
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });

  test.describe("Navigation Flow", () => {
    test("can navigate through all main routes", async ({ page }) => {
      // Start at dashboard
      await page.goto(`${BASE_URL}/dashboard`);
      await expect(page.locator("h1")).toContainText("Plan Overview");
      
      // Go to settings via hamburger
      await page.click('[data-cta-id="menu-toggle"]');
      await page.click('text=Settings');
      await expect(page.locator("h1")).toContainText("Settings");
      
      // Go to jobs
      await page.goto(`${BASE_URL}/jobs`);
      await expect(page.locator("h1")).toContainText("Job History");
      
      // Go to help
      await page.goto(`${BASE_URL}/help`);
      await expect(page.locator("h1")).toContainText("Help");
      
      // Back to dashboard
      await page.click('[data-cta-id="back-dashboard"]');
      await expect(page).toHaveURL(/\/dashboard/);
    });
  });
});

