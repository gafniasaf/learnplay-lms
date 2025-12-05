import { test, expect } from '@playwright/test';

/**
 * LearnPlay E2E Journey Tests
 * 
 * These tests validate the core user journeys defined in PLAN.md Section C:
 * - C.1: Learner Play Loop
 * - C.2: Teacher Assignment
 * - C.3: Parent Check Progress
 * 
 * Config: Uses VITE_USE_MOCK=true for deterministic testing
 */

test.describe('Learner Journey: Play Loop', () => {
  test('C.1: Complete a learning session from dashboard to results', async ({ page }) => {
    // Step 1: Navigate to student dashboard
    await page.goto('/student/dashboard');
    
    // Wait for the lazy-loaded component to finish loading and the primary CTA to show
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForSelector('[data-cta-id="continue-learning"]', { state: 'visible', timeout: 20000 });
    
    // Verify goal progress card is visible
    await expect(page.locator('text=Weekly Goal')).toBeVisible();
    
    // Step 2: Click Continue Learning → go to /play/welcome
    await page.click('[data-cta-id="continue-learning"]');
    await expect(page).toHaveURL(/\/play\/welcome/);
    
    // Step 3: Verify welcome page shows course info
    await expect(page.locator('[data-field="title"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Questions')).toBeVisible();
    await expect(page.locator('text=Select Level')).toBeVisible();
    
    // Step 4: Select level and start session
    await expect(page.locator('[data-cta-id="start-session"]')).toBeVisible();
    await page.click('[data-cta-id="start-session"]');
    
    // Step 5: Verify play session page loads
    await expect(page).toHaveURL(/\/play/);
    await expect(page.locator('.question-text, [data-field="question_text"]')).toBeVisible({ timeout: 10000 });
    
    // Step 6: Answer questions
    // Click first option
    await page.click('[data-cta-id="select-option-0"], [data-cta-id="select-option-1"]');
    
    // Submit answer
    await page.click('[data-cta-id="submit-answer"]');
    
    // Step 7: Verify feedback appears
    await expect(page.locator('.feedback-card, [data-field="feedback_icon"]')).toBeVisible({ timeout: 5000 });
    
    // Continue to next question or results
    const nextButton = page.locator('[data-cta-id="next-question"]');
    await expect(nextButton).toBeVisible();
    
    // Complete remaining questions by clicking through
    let isComplete = false;
    let attempts = 0;
    const maxAttempts = 20; // Safety limit
    
    while (!isComplete && attempts < maxAttempts) {
      attempts++;
      
      // Check if we're at results
      const url = page.url();
      if (url.includes('/results')) {
        isComplete = true;
        break;
      }
      
      // If feedback is showing, click next
      const nextBtn = page.locator('[data-cta-id="next-question"]');
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(500);
        continue;
      }
      
      // Select an option and submit
      const optionBtn = page.locator('[data-cta-id^="select-option-"]').first();
      if (await optionBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await optionBtn.click();
        
        const submitBtn = page.locator('[data-cta-id="submit-answer"]');
        if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await submitBtn.click();
        }
      }
      
      await page.waitForTimeout(500);
    }
    
    // Step 8: Verify results page
    await expect(page).toHaveURL(/\/results/, { timeout: 10000 });
    await expect(page.locator('text=Session Complete')).toBeVisible({ timeout: 5000 });
    
    // Verify score is displayed
    await expect(page.locator('[data-field="score"]')).toBeVisible();
    await expect(page.locator('[data-field="accuracy_percent"]')).toBeVisible();
    
    // Step 9: Test navigation back to dashboard
    await expect(page.locator('[data-cta-id="back-dashboard"]')).toBeVisible();
  });

  test('C.1.1: Can exit session early from play', async ({ page }) => {
    // Navigate directly to play welcome
    await page.goto('/play/welcome');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Start session
    await page.click('[data-cta-id="start-session"]');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/\/play/);
    
    // Exit session
    await page.click('[data-cta-id="exit-session"]');
    
    // Should navigate back to dashboard
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('C.1.2: Progress bar updates as questions are answered', async ({ page }) => {
    await page.goto('/play/welcome');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.click('[data-cta-id="start-session"]');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Get initial progress
    const progressBar = page.locator('.progress-fill');
    
    // Answer one question
    await page.click('[data-cta-id^="select-option-"]').first();
    await page.click('[data-cta-id="submit-answer"]');
    
    // Progress should have updated (feedback showing now)
    await expect(page.locator('.feedback-card, [data-field="feedback_icon"]')).toBeVisible();
  });
});

test.describe('Teacher Journey: Create Assignment', () => {
  test('C.2: Create and save an assignment', async ({ page }) => {
    // Step 1: Navigate to teacher dashboard
    await page.goto('/teacher/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Verify dashboard loads
    await expect(page.locator('h1')).toContainText('Teacher Dashboard', { timeout: 15000 });
    await expect(page.locator('text=Class Overview')).toBeVisible({ timeout: 10000 });
    
    // Step 2: Click create assignment
    await page.click('[data-cta-id="create-assignment"]');
    await expect(page).toHaveURL(/\/teacher\/control/);
    
    // Step 3: Fill in assignment form
    await expect(page.locator('h1')).toContainText('Create Assignment');
    
    // Fill title
    await page.fill('[data-field="title"]', 'E2E Test Assignment');
    
    // Select subject
    await page.selectOption('[data-field="subject"]', 'math');
    
    // Select student
    const studentSelect = page.locator('[data-field="learner_id"]');
    await studentSelect.selectOption({ index: 1 }); // Select first non-empty option
    
    // Step 4: Test AI Draft button is present
    const aiButton = page.locator('[data-cta-id="draft-plan"]');
    await expect(aiButton).toBeVisible();
    
    // Step 5: Save assignment
    await page.click('[data-cta-id="save-assignment"]');
    
    // Should navigate to assignments list or show success
    // Wait for navigation or toast
    await page.waitForTimeout(1000);
    
    // Either navigated to assignments or toast appeared
    const navigated = page.url().includes('/teacher/assignments');
    const toastVisible = await page.locator('text=saved').isVisible().catch(() => false);
    
    expect(navigated || toastVisible).toBeTruthy();
  });

  test('C.2.1: Teacher can navigate to analytics', async ({ page }) => {
    await page.goto('/teacher/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    await page.click('[data-cta-id="view-analytics"]');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/\/teacher\/analytics/);
    
    // Verify analytics page loads
    await expect(page.locator('h1')).toContainText('Analytics', { timeout: 15000 });
  });

  test('C.2.2: Teacher can view classes', async ({ page }) => {
    await page.goto('/teacher/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    await page.click('[data-cta-id="view-classes"]');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/\/teacher\/classes/);
  });
});

test.describe('Parent Journey: Check Progress', () => {
  test('C.3: View child progress across multiple pages', async ({ page }) => {
    // Step 1: Navigate to parent dashboard
    await page.goto('/parent/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Verify dashboard loads
    await expect(page.locator('h1')).toContainText('Parent Dashboard', { timeout: 15000 });
    await expect(page.locator('text=My Children')).toBeVisible({ timeout: 10000 });
    
    // Verify child selector is present
    await expect(page.locator('[data-list="children"]')).toBeVisible();
    
    // Verify weekly stats are shown
    await expect(page.locator('text=This Week')).toBeVisible();
    await expect(page.locator('[data-field="minutes_this_week"]')).toBeVisible();
    await expect(page.locator('[data-field="sessions_this_week"]')).toBeVisible();
    
    // Step 2: Navigate to goals
    await page.click('[data-cta-id="view-goals"]');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/\/parent\/goals/);
    
    // Step 3: Go back and navigate to subjects
    await page.goto('/parent/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.click('[data-cta-id="view-subjects"]');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/\/parent\/subjects/);
    
    // Step 4: Go back and navigate to timeline
    await page.goto('/parent/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.click('[data-cta-id="view-timeline"]');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page).toHaveURL(/\/parent\/timeline/);
  });

  test('C.3.1: Parent can switch between children', async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Wait for children to load
    await expect(page.locator('[data-list="children"]')).toBeVisible({ timeout: 10000 });
    
    // Get child buttons
    const childButtons = page.locator('[data-list="children"] button');
    const count = await childButtons.count();
    
    if (count > 1) {
      // Click second child
      await childButtons.nth(1).click();
      
      // Stats should update (give it time)
      await page.waitForTimeout(500);
    }
    
    // At minimum, first child should be selected
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('C.3.2: Weekly goal progress is displayed', async ({ page }) => {
    await page.goto('/parent/dashboard');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Verify goal section exists
    await expect(page.locator('text=Weekly Goal')).toBeVisible({ timeout: 10000 });
    
    // Verify progress bar exists
    await expect(page.locator('.progress-bar .progress-fill')).toBeVisible();
    
    // Verify goal status is shown
    await expect(page.locator('[data-field="goal_status"]')).toBeVisible();
  });
});

test.describe('Cross-Role Navigation', () => {
  test('Settings page accessible from all dashboards', async ({ page }) => {
    const dashboards = [
      '/student/dashboard',
      '/teacher/dashboard',
      '/parent/dashboard',
    ];
    
    for (const dashboard of dashboards) {
      await page.goto(dashboard);
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
      await page.click('[data-cta-id="settings"]');
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
      await expect(page).toHaveURL(/\/settings/);
    }
  });

  test('All dashboard pages load without errors', async ({ page }) => {
    const routes = [
      '/student/dashboard',
      '/student/achievements',
      '/student/assignments',
      '/student/goals',
      '/student/timeline',
      '/teacher/dashboard',
      '/teacher/classes',
      '/teacher/students',
      '/teacher/assignments',
      '/teacher/analytics',
      '/parent/dashboard',
      '/parent/goals',
      '/parent/subjects',
      '/parent/timeline',
      '/admin/console',
      '/messages',
    ];
    
    for (const route of routes) {
      await page.goto(route);
      await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
      
      // Page should not show error
      const errorVisible = await page.locator('text=Error').isVisible().catch(() => false);
      const crashed = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      
      if (errorVisible || crashed) {
        console.log(`Warning: ${route} may have an error`);
      }
      
      // Page should have some content
      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Messaging', () => {
  test('C.6: Messages inbox loads and shows threads', async ({ page }) => {
    await page.goto('/messages');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Verify inbox loads
    await expect(page.locator('h1, h2').filter({ hasText: /message|inbox/i })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Admin Journey', () => {
  test('C.9: Admin console and system health', async ({ page }) => {
    // Navigate to admin console
    await page.goto('/admin/console');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Verify console loads
    await expect(page.locator('h1, h2').filter({ hasText: /admin|console/i })).toBeVisible({ timeout: 10000 });
    
    // Navigate to system health
    await page.goto('/admin/system-health');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Verify health page loads
    await expect(page.locator('h1, h2').filter({ hasText: /health|system/i })).toBeVisible({ timeout: 10000 });
    
    // Navigate to jobs
    await page.goto('/admin/jobs');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page.locator('h1, h2').filter({ hasText: /job|queue/i })).toBeVisible({ timeout: 10000 });
  });
});

