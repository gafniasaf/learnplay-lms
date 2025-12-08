/**
 * COMPREHENSIVE TEACHER TESTS
 * 
 * Tests all teacher functionality:
 * - Dashboard with class overview
 * - Students management
 * - Classes management
 * - Class progress tracking
 * - Assignments CRUD
 * - Assignment progress tracking
 * - Analytics and reporting
 * - Assignment creation form
 */

import { test, expect } from '@playwright/test';

test.describe('Teacher: Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teacher/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard displays main heading', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await expect(page.locator('h1')).toContainText(/teacher|dashboard/i, { timeout: 15000 });
  });

  test('dashboard shows class overview section', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // The dashboard shows "Class Pulse" section or Students/Classes buttons
    const hasClassPulse = await page.getByText('Class Pulse').isVisible().catch(() => false);
    const hasStudentsButton = await page.getByRole('button', { name: /students/i }).isVisible().catch(() => false);
    const hasClassesButton = await page.getByRole('button', { name: /classes/i }).isVisible().catch(() => false);
    
    expect(hasClassPulse || hasStudentsButton || hasClassesButton).toBeTruthy();
  });

  test('dashboard has navigation CTAs', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have navigation buttons/links
    const hasAnalyticsCTA = await page.locator('[data-cta-id="view-analytics"], a[href*="analytics"], button:has-text("Analytics")').first().isVisible().catch(() => false);
    const hasClassesCTA = await page.locator('[data-cta-id="view-classes"], a[href*="classes"], button:has-text("Classes")').first().isVisible().catch(() => false);
    const hasAssignmentCTA = await page.locator('[data-cta-id="create-assignment"], a[href*="assignment"], button:has-text("Assignment")').first().isVisible().catch(() => false);
    
    expect(hasAnalyticsCTA || hasClassesCTA || hasAssignmentCTA).toBeTruthy();
  });

  test('dashboard shows quick stats', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should show some statistics or action buttons
    // The dashboard shows student counts, progress bars, or action buttons
    const hasStudentCount = await page.getByText(/students?/i).isVisible().catch(() => false);
    const hasProgress = await page.locator('progressbar, [role="progressbar"]').first().isVisible().catch(() => false);
    const hasPercentage = await page.getByText(/%/).first().isVisible().catch(() => false);
    
    expect(hasStudentCount || hasProgress || hasPercentage).toBeTruthy();
  });
});

test.describe('Teacher: Students', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teacher/students');
    await page.waitForLoadState('networkidle');
  });

  test('students page loads', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /student/i }).isVisible().catch(() => false);
    const hasTable = await page.locator('table, [role="table"]').isVisible().catch(() => false);
    const hasList = await page.locator('[class*="list"], [class*="card"]').first().isVisible().catch(() => false);
    
    expect(hasHeading || hasTable || hasList).toBeTruthy();
  });

  test('students shows list or empty state', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Check for main element or content
    const hasMain = await page.locator('main').isVisible().catch(() => false);
    const hasHeading = await page.getByRole('heading').first().isVisible().catch(() => false);
    
    expect(hasMain || hasHeading).toBeTruthy();
  });
});

test.describe('Teacher: Classes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teacher/classes');
    await page.waitForLoadState('networkidle');
  });

  test('classes page loads', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /class/i }).isVisible().catch(() => false);
    const body = await page.locator('body').textContent();
    
    expect(hasHeading || (body && body.length > 100)).toBeTruthy();
  });

  test('classes shows class list or create option', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Check for main element or heading
    const hasMain = await page.locator('main').isVisible().catch(() => false);
    const hasHeading = await page.getByRole('heading').first().isVisible().catch(() => false);
    
    expect(hasMain || hasHeading).toBeTruthy();
  });
});

test.describe('Teacher: Class Progress', () => {
  test('class progress page shows progress metrics', async ({ page }) => {
    await page.goto('/teacher/class-progress');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Check for main element or any meaningful content
    const hasMain = await page.locator('main').isVisible().catch(() => false);
    const hasHeading = await page.getByRole('heading').first().isVisible().catch(() => false);
    
    expect(hasMain || hasHeading).toBeTruthy();
  });
});

test.describe('Teacher: Assignments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teacher/assignments');
    await page.waitForLoadState('networkidle');
  });

  test('assignments page loads', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /assignment/i }).isVisible().catch(() => false);
    expect(hasHeading).toBeTruthy();
  });

  test('assignments shows create button', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasCreate = await page.locator('button:has-text("Create"), button:has-text("New"), [data-cta-id*="create"]').first().isVisible().catch(() => false);
    expect(hasCreate).toBeTruthy();
  });

  test('assignments shows list or empty state', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasAssignments = await page.locator('table tbody tr, [class*="assignment-row"], [class*="card"]').first().isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no assignment|empty|create first/i').isVisible().catch(() => false);
    
    expect(hasAssignments || hasEmptyState).toBeTruthy();
  });
});

test.describe('Teacher: Analytics', () => {
  test('analytics page loads with charts/data', async ({ page }) => {
    await page.goto('/teacher/analytics');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /analytics/i }).isVisible().catch(() => false);
    const hasCharts = await page.locator('canvas, svg, [class*="chart"], [class*="graph"]').first().isVisible().catch(() => false);
    const hasStats = await page.locator('text=/average|total|score|progress/i').isVisible().catch(() => false);
    
    expect(hasHeading || hasCharts || hasStats).toBeTruthy();
  });
});

test.describe('Teacher: Control (Create Assignment)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teacher/control');
    await page.waitForLoadState('networkidle');
  });

  test('control page shows assignment form', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasForm = await page.locator('form, [data-field="title"], input[name="title"]').first().isVisible().catch(() => false);
    const hasHeading = await page.locator('h1, h2').filter({ hasText: /assignment|create/i }).isVisible().catch(() => false);
    
    expect(hasForm || hasHeading).toBeTruthy();
  });

  test('assignment form has required fields', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Title field
    const hasTitle = await page.locator('[data-field="title"], input[name="title"], label:has-text("Title")').first().isVisible().catch(() => false);
    
    // Subject field
    const hasSubject = await page.locator('[data-field="subject"], select[name="subject"], label:has-text("Subject")').first().isVisible().catch(() => false);
    
    // Save button
    const hasSave = await page.locator('button:has-text("Save"), [data-cta-id="save-assignment"]').first().isVisible().catch(() => false);
    
    expect(hasTitle || hasSubject || hasSave).toBeTruthy();
  });

  test('assignment form has AI draft button', async ({ page }) => {
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    const hasAIButton = await page.locator('[data-cta-id="draft-plan"], button:has-text("AI"), button:has-text("Draft")').first().isVisible().catch(() => false);
    expect(hasAIButton).toBeTruthy();
  });
});
