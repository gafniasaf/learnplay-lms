import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: Teacher Features
 * 
 * Tests teacher dashboard and features with REAL Supabase.
 * Uses admin auth state to access teacher pages.
 */

test.describe('Live Teacher: Dashboard', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('teacher dashboard loads', async ({ page }) => {
    // Navigate to teacher dashboard
    await page.goto('/teacher/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Check that page loaded with content
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);
    
    // Should have main content area
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
  });
});

test.describe('Live Teacher: Assignments', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('assignments page loads', async ({ page }) => {
    await page.goto('/teacher/assignments');
    await page.waitForLoadState('networkidle');
    
    // Page should load with content
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);
    
    // Should have main content area
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
  });
});

test.describe('Live Teacher: Class Progress', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });
  
  test('class progress page loads', async ({ page }) => {
    await page.goto('/teacher/class-progress');
    await page.waitForLoadState('networkidle');
    
    // Page should load with content  
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(100);
    
    // Should have main content area
    const hasMain = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMain).toBeTruthy();
  });
});

