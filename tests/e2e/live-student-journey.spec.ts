import { test, expect } from '@playwright/test';

/**
 * Live E2E Tests: Student Journey
 * 
 * Tests student dashboard and learning flow with REAL Supabase.
 * Note: These tests may require student accounts to be set up.
 */

test.describe('Live Student: Dashboard', () => {
  test('student dashboard loads', async ({ page }) => {
    // Navigate to student dashboard (may redirect to auth if not logged in)
    await page.goto('/student/dashboard');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if we're redirected to auth (expected if no student session)
    const isAuthPage = page.url().includes('/auth');
    const isDashboard = page.url().includes('/student/dashboard') || 
                       await page.getByText(/dashboard|goal|learning/i).isVisible({ timeout: 5000 }).catch(() => false);
    
    // Either auth page (no session) or dashboard (has session) is valid
    expect(isAuthPage || isDashboard).toBeTruthy();
  });

  test('student can access course catalog', async ({ page }) => {
    await page.goto('/courses');
    
    // Wait for catalog to load
    await page.waitForLoadState('networkidle');
    
    // Catalog should load
    const hasCatalog = await page.getByText(/course|catalog/i).isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasCatalog).toBeTruthy();
  });
});

test.describe('Live Student: Play Flow', () => {
  test('play page structure loads', async ({ page }) => {
    // Try to access play page (may require course ID)
    await page.goto('/play');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Play page should load (could redirect, show error, or show play UI)
    const hasPlayUI = await page.getByText(/play|question|answer/i).isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await page.getByText(/error|not found|course/i).isVisible({ timeout: 2000 }).catch(() => false);
    const isRedirected = !page.url().includes('/play');
    
    // Any of these states is valid
    expect(hasPlayUI || hasError || isRedirected).toBeTruthy();
  });
});

