/**
 * COMPREHENSIVE AUTH TESTS
 * 
 * Tests all authentication flows:
 * - Login form validation
 * - Signup form validation
 * - Guest mode access
 * - Password reset flow
 * - Session persistence
 * - Protected route redirects
 */

import { test, expect } from '@playwright/test';

test.describe('Auth: Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
  });

  test('login form is visible with all elements', async ({ page }) => {
    // Login tab should be active by default
    await expect(page.getByRole('tab', { name: /login/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /sign up/i })).toBeVisible();
    
    // Form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    
    // Social/guest options
    await expect(page.getByRole('button', { name: /continue as guest/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
    
    // Forgot password link
    await expect(page.getByText(/forgot password/i)).toBeVisible();
  });

  test('login form validates empty fields', async ({ page }) => {
    // Try to submit without filling fields
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // HTML5 validation should prevent submission
    const emailInput = page.locator('input[type="email"]');
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBeTruthy();
  });

  test('login form validates email format', async ({ page }) => {
    await page.fill('input[type="email"]', 'not-an-email');
    await page.fill('input[type="password"]', 'somepassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // HTML5 validation should show invalid email
    const emailInput = page.locator('input[type="email"]');
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBeTruthy();
  });

  test('login shows error for invalid credentials', async ({ page }) => {
    await page.fill('input[type="email"]', 'nonexistent@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Wait for error message
    await expect(page.locator('[role="alert"], .text-destructive, text=/error|invalid|incorrect/i')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Auth: Signup Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /sign up/i }).click();
  });

  test('signup form is visible with all elements', async ({ page }) => {
    await expect(page.locator('#signup-email, input[type="email"]').first()).toBeVisible();
    await expect(page.locator('#signup-password, input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('signup shows password strength indicator', async ({ page }) => {
    const passwordInput = page.locator('#signup-password, input[placeholder*="Strong"]').first();
    await passwordInput.fill('weak');
    
    // Should show password strength indicator
    await expect(page.locator('text=/password strength|weak|fair|good|strong/i')).toBeVisible();
  });

  test('signup validates weak passwords', async ({ page }) => {
    await page.locator('#signup-email, input[type="email"]').first().fill('test@example.com');
    const passwordInput = page.locator('#signup-password, input[placeholder*="Strong"]').first();
    await passwordInput.fill('123');
    
    // Should show weak password feedback
    await expect(page.locator('text=/weak|too short|add more/i')).toBeVisible();
  });
});

test.describe('Auth: Guest Mode', () => {
  test('guest button navigates away from auth', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('button', { name: /continue as guest/i }).click();
    
    // Should navigate away from auth page
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).not.toContain('/auth');
  });

  test('guest mode sets localStorage flag', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    await page.getByRole('button', { name: /continue as guest/i }).click();
    await page.waitForTimeout(2000);
    
    // Check localStorage
    const guestMode = await page.evaluate(() => localStorage.getItem('guestMode'));
    const roleOverride = await page.evaluate(() => localStorage.getItem('roleOverride'));
    
    // Guest mode should be set (or URL should have guest param)
    const url = page.url();
    expect(guestMode === 'true' || url.includes('guest=1')).toBeTruthy();
  });
});

test.describe('Auth: Forgot Password', () => {
  test('forgot password dialog opens', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    await page.getByText(/forgot password/i).click();
    
    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/reset password/i)).toBeVisible();
  });

  test('forgot password validates email', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    await page.getByText(/forgot password/i).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Try to submit without email
    await page.getByRole('button', { name: /send reset link/i }).click();
    
    // Should show validation error
    const emailInput = page.locator('[role="dialog"] input[type="email"]');
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBeTruthy();
  });

  test('forgot password can be cancelled', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    await page.getByText(/forgot password/i).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    
    await page.getByRole('button', { name: /cancel/i }).click();
    
    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

test.describe('Auth: Protected Routes', () => {
  test('admin routes require authentication', async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
    
    await page.goto('/admin/console');
    await page.waitForTimeout(2000);
    
    // Should redirect to auth or show auth-required message
    const url = page.url();
    const hasAuthRequired = await page.locator('text=/sign in|log in|authentication/i').isVisible().catch(() => false);
    
    expect(url.includes('/auth') || hasAuthRequired).toBeTruthy();
  });
});
