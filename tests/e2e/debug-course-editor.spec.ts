/**
 * Debug test for Course Editor V2
 */
import { test, expect } from '@playwright/test';

test.describe('Debug: Course Editor V2', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('debug course editor page structure', async ({ page }) => {
    // Capture console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Step 1: Go to course selector
    console.log('Step 1: Navigate to /admin/courses/select');
    await page.goto('/admin/courses/select');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Step 2: Click first Edit button
    console.log('Step 2: Click first Edit button');
    const editButton = page.locator('button:has-text("Edit")').first();
    const hasEditButton = await editButton.isVisible({ timeout: 10000 }).catch(() => false);
    console.log('Edit button visible:', hasEditButton);
    
    if (!hasEditButton) {
      console.log('ERROR: No Edit button found');
      await page.screenshot({ path: 'reports/debug-no-edit-button.png', fullPage: true });
      expect(hasEditButton).toBeTruthy();
      return;
    }

    await editButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // Step 3: Check URL
    const currentUrl = page.url();
    console.log('Step 3: Current URL:', currentUrl);
    expect(currentUrl).toContain('/admin/editor/');

    // Take screenshot
    await page.screenshot({ path: 'reports/debug-course-editor.png', fullPage: true });

    // Step 4: Check for navigator items
    console.log('Step 4: Check for navigator items');
    const navItems = page.locator('[data-cta-id*="nav-item"]');
    const navItemCount = await navItems.count();
    console.log('Navigator items with data-cta-id:', navItemCount);

    // Check for any buttons in navigator
    const navButtons = page.locator('.navigator button, [class*="navigator"] button');
    const navButtonCount = await navButtons.count();
    console.log('Buttons in navigator area:', navButtonCount);

    // Step 5: Check for editor tabs
    console.log('Step 5: Check for editor tabs');
    const stemTab = page.locator('[data-cta-id="cta-courseeditor-editor-tab-stem"]');
    const hasStemTab = await stemTab.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('Stem tab visible:', hasStemTab);

    const optionsTab = page.locator('[data-cta-id="cta-courseeditor-editor-tab-options"]');
    const hasOptionsTab = await optionsTab.isVisible({ timeout: 2000 }).catch(() => false);
    console.log('Options tab visible:', hasOptionsTab);

    const hintsTab = page.locator('[data-cta-id="cta-courseeditor-editor-tab-hints"]');
    const hasHintsTab = await hintsTab.isVisible({ timeout: 2000 }).catch(() => false);
    console.log('Hints tab visible:', hasHintsTab);

    // Step 6: Check for AI Rewrite button in Stem
    console.log('Step 6: Check for AI Rewrite button');
    const aiRewriteButton = page.locator('[data-cta-id="cta-courseeditor-stem-ai-rewrite"]');
    const hasAiRewrite = await aiRewriteButton.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('AI Rewrite button visible:', hasAiRewrite);

    // Check for any "AI" or "Rewrite" buttons
    const aiButtons = page.locator('button:has-text("AI")');
    const aiButtonCount = await aiButtons.count();
    console.log('Buttons with "AI" text:', aiButtonCount);

    const rewriteButtons = page.locator('button:has-text("Rewrite")');
    const rewriteButtonCount = await rewriteButtons.count();
    console.log('Buttons with "Rewrite" text:', rewriteButtonCount);

    // Step 7: Check page content
    console.log('Step 7: Page content analysis');
    const bodyText = await page.locator('body').textContent();
    
    // Check for key UI elements
    console.log('Has "Exercises" text:', bodyText?.includes('Exercises'));
    console.log('Has "Study Texts" text:', bodyText?.includes('Study Texts'));
    console.log('Has "Save" text:', bodyText?.includes('Save'));
    console.log('Has "Publish" text:', bodyText?.includes('Publish'));
    console.log('Has "Stem" text:', bodyText?.includes('Stem'));
    console.log('Has "Options" text:', bodyText?.includes('Options'));
    console.log('Has "Loading" text:', bodyText?.includes('Loading'));
    console.log('Has "Error" text:', bodyText?.includes('Error'));

    // Print first 3000 chars
    console.log('\nPage content (first 3000 chars):');
    console.log(bodyText?.substring(0, 3000));

    // Step 8: Console logs with errors
    console.log('\nConsole errors:');
    consoleLogs
      .filter((log) => log.includes('[error]') || log.includes('Error'))
      .slice(0, 20)
      .forEach((log) => console.log('  ', log));

    // Assert we have some content
    expect(bodyText?.length).toBeGreaterThan(100);
  });
});

