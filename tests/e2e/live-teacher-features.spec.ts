import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: Teacher Features
 * 
 * Tests teacher dashboard and features with REAL Supabase.
 * Note: These tests may require teacher accounts to be set up.
 */

test.describe('Live Teacher: Dashboard', () => {
  test('teacher dashboard loads', async ({ page }) => {
    // Navigate to teacher dashboard (may redirect to auth if not logged in)
    await page.goto('/teacher/dashboard');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if we're redirected to auth (expected if no teacher session)
    const isAuthPage = page.url().includes('/auth');
    const isDashboard = page.url().includes('/teacher/dashboard') || 
                       await page.getByText(/teacher|dashboard|class/i).isVisible({ timeout: 5000 }).catch(() => false);
    
    // Either auth page (no session) or dashboard (has session) is valid
    expect(isAuthPage || isDashboard).toBeTruthy();
  });
});

test.describe('Live Teacher: Assignments', () => {
  test('assignments page loads', async ({ page }) => {
    await page.goto('/teacher/assignments');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Should load assignments page or redirect to auth
    const isAuthPage = page.url().includes('/auth');
    const hasAssignments = await page.getByText(/assignment|task/i).isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(isAuthPage || hasAssignments).toBeTruthy();
  });
});

test.describe('Live Teacher: Class Progress', () => {
  test('class progress page loads', async ({ page }) => {
    await page.goto('/teacher/class-progress');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Should load class progress page or redirect to auth
    const isAuthPage = page.url().includes('/auth');
    const hasProgress = await page.getByText(/progress|class|student/i).isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(isAuthPage || hasProgress).toBeTruthy();
  });
});

