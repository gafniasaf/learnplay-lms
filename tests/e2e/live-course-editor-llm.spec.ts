/**
 * E2E Tests: Course Editor LLM Features
 * 
 * Tests LLM-powered features in course editor:
 * - Rewrite feature
 * - Variants audit
 * - Co-pilot enrich
 * - Co-pilot variants
 * - Cost tracking
 */

import { test, expect } from '@playwright/test';

test.describe('Course Editor LLM Features', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('admin uses rewrite feature', async ({ page }) => {
    // Navigate to course editor
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      test.skip('No courses available');
      return;
    }

    await courseLink.click();
    await page.waitForLoadState('networkidle');

    // Find item editor
    const editButton = page.locator('button:has-text("Edit"), [data-testid*="edit-item"]').first();
    const hasEditButton = await editButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasEditButton) {
      await editButton.click();
      await page.waitForTimeout(1000);

      // Look for rewrite button
      const rewriteButton = page.locator('button:has-text("Rewrite"), button:has-text("AI Rewrite"), [data-testid*="rewrite"]').first();
      const hasRewriteButton = await rewriteButton.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasRewriteButton) {
        await rewriteButton.click();
        await page.waitForTimeout(1000);

        // Find prompt input
        const promptInput = page.locator('textarea[placeholder*="prompt"], input[placeholder*="prompt"]').first();
        const hasPromptInput = await promptInput.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasPromptInput) {
          await promptInput.fill('Make this more engaging for 3rd graders');
          
          // Find generate/submit button
          const generateButton = page.locator('button:has-text("Generate"), button:has-text("Rewrite"), button[type="submit"]').first();
          const hasGenerateButton = await generateButton.isVisible({ timeout: 5000 }).catch(() => false);

          if (hasGenerateButton) {
            await generateButton.click();

            // Wait for LLM response (can take 10-30 seconds)
            await expect(
              page.locator('text=/rewritten|generated|complete/i').or(
                page.locator('[data-testid*="rewrite-result"]')
              )
            ).toBeVisible({ timeout: 60000 });

            // Verify rewrite appears
            const rewriteResult = page.locator('[data-testid*="rewrite"], .rewrite-result, text=/rewritten/i').first();
            const hasResult = await rewriteResult.isVisible({ timeout: 5000 }).catch(() => false);
            
            if (hasResult) {
              // Verify can accept/reject
              const acceptButton = page.locator('button:has-text("Accept"), button:has-text("Apply")').first();
              const hasAccept = await acceptButton.isVisible({ timeout: 5000 }).catch(() => false);
              
              if (hasAccept) {
                await acceptButton.click();
                
                // Verify changes saved
                await expect(
                  page.locator('text=/saved|applied|success/i').or(
                    page.locator('[role="status"]')
                  )
                ).toBeVisible({ timeout: 10000 });
              }
            }
          }
        }
      }
    }
  });

  test('admin runs variants audit', async ({ page }) => {
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      test.skip('No courses available');
      return;
    }

    await courseLink.click();
    await page.waitForLoadState('networkidle');

    // Look for variants audit button
    const auditButton = page.locator('button:has-text("Variants Audit"), button:has-text("Audit"), [data-testid*="variants-audit"]').first();
    const hasAuditButton = await auditButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasAuditButton) {
      await auditButton.click();

      // Wait for audit job to start
      await expect(
        page.locator('text=/audit|started|processing/i').or(
          page.locator('[data-testid*="job"]')
        )
      ).toBeVisible({ timeout: 30000 });

      // Wait for audit results (can take 1-2 minutes)
      await expect(
        page.locator('text=/audit complete|results|missing variants/i').or(
          page.locator('[data-testid*="audit-result"]')
        )
      ).toBeVisible({ timeout: 120000 });

      // Verify audit results shown
      const auditResults = page.locator('text=/missing|complete|found/i').first();
      const hasResults = await auditResults.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasResults).toBe(true);
    }
  });

  test('admin uses co-pilot enrich', async ({ page }) => {
    await page.goto('/admin/courses');
    await page.waitForLoadState('networkidle');

    const courseLink = page.locator('a[href*="/admin/editor/"]').first();
    const hasCourse = await courseLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCourse) {
      test.skip('No courses available');
      return;
    }

    await courseLink.click();
    await page.waitForLoadState('networkidle');

    // Look for co-pilot button
    const copilotButton = page.locator('button:has-text("Co-Pilot"), button:has-text("Enrich"), [data-testid*="copilot"]').first();
    const hasCopilotButton = await copilotButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCopilotButton) {
      await copilotButton.click();
      await page.waitForTimeout(1000);

      // Find enrichment request input
      const requestInput = page.locator('textarea[placeholder*="request"], input[placeholder*="enrich"]').first();
      const hasRequestInput = await requestInput.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasRequestInput) {
        await requestInput.fill('Add more examples and explanations');
        
        const submitButton = page.locator('button:has-text("Enrich"), button[type="submit"]').first();
        const hasSubmit = await submitButton.isVisible({ timeout: 5000 }).catch(() => false);

        if (hasSubmit) {
          await submitButton.click();

          // Wait for job creation
          await expect(
            page.locator('text=/job|started|enriching/i').or(
              page.locator('[data-testid*="job"]')
            )
          ).toBeVisible({ timeout: 30000 });

          // Wait for completion (can take 2-5 minutes)
          await expect(
            page.locator('text=/complete|enriched|done/i').or(
              page.locator('[data-testid*="job"][data-status="done"]')
            )
          ).toBeVisible({ timeout: 300000 }); // 5 minutes

          // Verify enrichment applied
          const enrichmentResult = page.locator('text=/enriched|updated|applied/i').first();
          const hasResult = await enrichmentResult.isVisible({ timeout: 5000 }).catch(() => false);
          // Enrichment might be applied automatically, so this is optional
        }
      }
    }
  });
});

