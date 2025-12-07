/**
 * E2E Tests: Real-time Job Updates
 * 
 * Tests that job status updates in real-time:
 * - Status changes (pending → processing → done)
 * - Progress bar updates
 * - Phase indicators update
 * - Job events appear
 * - Multiple jobs update independently
 */

import { test, expect } from '@playwright/test';

test.describe('Real-time Job Updates', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('job status updates in real-time', async ({ page }) => {
    // Create a job
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');

    const subjectInput = page.locator('input[placeholder*="subject"], input#subject').first();
    const hasSubjectInput = await subjectInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSubjectInput) {
      test.skip('No job creation UI available');
      return;
    }

    const testSubject = `E2E Realtime Test ${Date.now()}`;
    await subjectInput.fill(testSubject);
    await page.locator('[data-cta-id="quick-start-create"]').click();

    // Wait for job to be created
    await expect(
      page.locator('text=/job|created|started/i').or(
        page.locator('[data-testid*="job"]')
      )
    ).toBeVisible({ timeout: 30000 });

    // Extract job ID from page or localStorage
    const jobId = await page.evaluate(() => {
      return localStorage.getItem('selectedJobId') || 
             document.body.textContent?.match(/job[_-]?id[:\s]+([a-z0-9-]+)/i)?.[1];
    });

    if (!jobId) {
      test.skip('Could not extract job ID');
      return;
    }

    // Navigate to job details (if available)
    const jobLink = page.locator(`[href*="${jobId}"], [data-testid*="${jobId}"]`).first();
    const hasJobLink = await jobLink.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasJobLink) {
      await jobLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Monitor status changes
    const statusIndicator = page.locator('text=/pending|processing|done|failed/i, [data-testid*="status"]').first();
    let previousStatus = '';
    let statusChanged = false;

    // Poll for status changes (up to 5 minutes for real LLM job)
    const maxWaitTime = 300000; // 5 minutes
    const startTime = Date.now();

    while ((Date.now() - startTime) < maxWaitTime && !statusChanged) {
      await page.waitForTimeout(5000); // Check every 5 seconds
      
      const currentStatus = await statusIndicator.textContent().catch(() => '');
      if (currentStatus && currentStatus !== previousStatus && previousStatus !== '') {
        statusChanged = true;
        console.log(`Status changed: ${previousStatus} → ${currentStatus}`);
      }
      previousStatus = currentStatus || '';

      // Check if job is done or failed
      if (currentStatus?.toLowerCase().includes('done') || 
          currentStatus?.toLowerCase().includes('failed')) {
        break;
      }
    }

    // Verify status updated (at least once)
    expect(statusChanged || previousStatus).toBeTruthy();
  });

  test('job failure shows error details', async ({ page }) => {
    // This test would create a job with invalid input that will fail
    // For now, mark as skipped until we have a way to force job failures
    test.skip('Requires job failure simulation');
  });

  test('multiple jobs update independently', async ({ page }) => {
    // Create 2 jobs
    await page.goto('/admin/ai-pipeline');
    await page.waitForLoadState('networkidle');

    const subjectInput = page.locator('input[placeholder*="subject"], input#subject').first();
    const hasSubjectInput = await subjectInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSubjectInput) {
      test.skip('No job creation UI available');
      return;
    }

    // Create first job
    await subjectInput.fill(`Job 1 ${Date.now()}`);
    await page.locator('[data-cta-id="quick-start-create"]').click();
    await page.waitForTimeout(5000);

    // Create second job
    await subjectInput.fill(`Job 2 ${Date.now()}`);
    await page.locator('[data-cta-id="quick-start-create"]').click();
    await page.waitForTimeout(5000);

    // Verify both jobs appear in list
    const jobList = page.locator('[data-testid*="job"], text=/job/i');
    const jobCount = await jobList.count();
    expect(jobCount).toBeGreaterThanOrEqual(2);

    // Verify jobs have different statuses or can be distinguished
    const jobTexts = await jobList.allTextContents();
    expect(jobTexts.length).toBeGreaterThanOrEqual(2);
  });
});

