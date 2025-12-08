import { test, expect } from '@playwright/test';

// Skip: This test covers legacy PlanBlueprint functionality (/dashboard, /plans/editor)
// which is not part of LearnPlay LMS. LearnPlay uses different routes and workflows.
test.describe.skip('Critical User Flows', () => {
  test('create, navigate, and load plan', async ({ page }) => {
    // 1. Go to dashboard
    await page.goto('/dashboard');
    
    // 2. Enter title and create
    const uniqueTitle = `Test Plan ${Date.now()}`;
    await page.fill('input[data-field="title"]', uniqueTitle);
    await page.click('button:has-text("New Plan")');
    
    // 3. Should navigate to editor with ID
    await expect(page).toHaveURL(/\/plans\/editor\?id=/);
    
    // 4. Should load the plan
    // Wait for title to appear (it's fetched from backend)
    await expect(page.locator('h1')).toContainText(uniqueTitle, { timeout: 10000 });
    
    // 5. Verify default AI status
    await expect(page.locator('.message.ai').first()).toContainText('Ready to start');
    
    // 6. Make a change (send AI request)
    await page.fill('input[placeholder="Describe your app..."]', 'Make it a todo list');
    await page.click('button:has-text("Yes, Do It")'); // Or send button
    
    // 7. Verify toast appears
    await expect(page.locator('text=Job started')).toBeVisible();
    
    // 8. Save status
    await page.click('button:has-text("Export Golden Plan")');
    await expect(page.locator('text=Saved!')).toBeVisible();
    
    // 9. Return to dashboard
    await page.click('text=← Back to Dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // 10. Verify plan appears in list
    // Reload to refresh list if needed (auto-refresh might happen on mount)
    await page.reload();
    await expect(page.locator('table')).toContainText(uniqueTitle);
  });
});

