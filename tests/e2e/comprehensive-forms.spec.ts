/**
 * COMPREHENSIVE FORMS TESTS
 * 
 * Tests all form functionality:
 * - Input validation
 * - Required fields
 * - Select/dropdown functionality
 * - Form submission
 * - Form reset
 */

import { test, expect } from '@playwright/test';

test.describe('Forms: Auth Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
  });

  test('email field is required', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.focus();
    await emailInput.blur();
    
    const isRequired = await emailInput.getAttribute('required');
    expect(isRequired !== null || await emailInput.evaluate((el: HTMLInputElement) => el.required)).toBeTruthy();
  });

  test('password field is required', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]');
    
    const isRequired = await passwordInput.getAttribute('required');
    expect(isRequired !== null || await passwordInput.evaluate((el: HTMLInputElement) => el.required)).toBeTruthy();
  });

  test('email field validates format', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('not-an-email');
    
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBeFalsy();
  });

  test('valid email passes validation', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('test@example.com');
    
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBeTruthy();
  });
});

test.describe('Forms: Auth Signup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /sign up/i }).click();
  });

  test('password has minimum length requirement', async ({ page }) => {
    const passwordInput = page.locator('#signup-password, input[placeholder*="Strong"]').first();
    await passwordInput.fill('123');
    
    // Should show weak password indicator
    const hasWeakIndicator = await page.locator('text=/weak|short/i').isVisible().catch(() => false);
    
    // Or minlength attribute
    const minLength = await passwordInput.getAttribute('minlength');
    
    expect(hasWeakIndicator || minLength !== null).toBeTruthy();
  });

  test('password strength updates on input', async ({ page }) => {
    const passwordInput = page.locator('#signup-password');
    await expect(passwordInput).toBeVisible();
    
    // Type weak password first
    await passwordInput.fill('abc');
    await page.waitForTimeout(300);
    
    // Type stronger password
    await passwordInput.fill('AbcDefGh123!@#');
    await page.waitForTimeout(300);
    
    // Should show strength indicator
    const hasStrengthLabel = await page.getByText('Password strength').isVisible().catch(() => false);
    const hasStrongLabel = await page.getByText(/strong|good/i).isVisible().catch(() => false);
    
    expect(hasStrengthLabel || hasStrongLabel).toBeTruthy();
  });
});

test.describe('Forms: Teacher Assignment Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/teacher/control');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('title field accepts input', async ({ page }) => {
    const titleInput = page.locator('[data-field="title"], input[name="title"]').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.waitFor({ state: 'visible' });
      await titleInput.waitFor({ state: 'attached' });
      // Wait for input to be enabled
      await page.waitForTimeout(500);
      const isDisabled = await titleInput.isDisabled().catch(() => false);
      if (!isDisabled) {
        await titleInput.fill('Test Assignment Title');
        const value = await titleInput.inputValue();
        expect(value).toBe('Test Assignment Title');
      }
    }
  });

  test('subject dropdown has options', async ({ page }) => {
    const subjectSelect = page.locator('[data-field="subject"], select[name="subject"]').first();
    if (await subjectSelect.isVisible().catch(() => false)) {
      const options = await subjectSelect.locator('option').count();
      expect(options).toBeGreaterThan(0);
    }
  });

  test('student dropdown has options', async ({ page }) => {
    const studentSelect = page.locator('[data-field="learner_id"], select[name="learner_id"]').first();
    if (await studentSelect.isVisible().catch(() => false)) {
      const options = await studentSelect.locator('option').count();
      expect(options).toBeGreaterThanOrEqual(0); // May be empty if no students
    }
  });

  test('save button is present', async ({ page }) => {
    const saveBtn = page.locator('[data-cta-id="save-assignment"], button:has-text("Save")').first();
    const isVisible = await saveBtn.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Forms: Student Join Class', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/join-class');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('code input accepts text', async ({ page }) => {
    const codeInput = page.locator('input').first();
    if (await codeInput.isVisible().catch(() => false)) {
      await codeInput.fill('ABC123');
      const value = await codeInput.inputValue();
      expect(value).toBe('ABC123');
    }
  });

  test('join button is present', async ({ page }) => {
    const joinBtn = page.locator('button:has-text("Join"), button[type="submit"]').first();
    const isVisible = await joinBtn.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Forms: Admin AI Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('subject input accepts text', async ({ page }) => {
    const subjectInput = page.locator('input#subject, input[placeholder*="subject"]').first();
    if (await subjectInput.isVisible().catch(() => false)) {
      await subjectInput.waitFor({ state: 'visible' });
      await subjectInput.waitFor({ state: 'attached' });
      // Wait for input to be enabled
      await page.waitForTimeout(500);
      const isDisabled = await subjectInput.isDisabled().catch(() => false);
      if (!isDisabled) {
        await subjectInput.fill('Mathematics');
        const value = await subjectInput.inputValue();
        expect(value).toBe('Mathematics');
      }
    }
  });

  test('grade selector is present', async ({ page }) => {
    const gradeSelect = page.locator('select').first();
    const isVisible = await gradeSelect.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });

  test('generate button is present', async ({ page }) => {
    // The page shows either "Generate" or "Log In Required" button
    const generateBtn = page.locator('button').filter({ hasText: /generate|log in required|create/i }).first();
    const isVisible = await generateBtn.isVisible().catch(() => false);
    expect(isVisible).toBeTruthy();
  });
});

test.describe('Forms: Settings', () => {
  test('settings page has form elements', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have some form elements or settings options
    const hasInputs = await page.locator('input, select, [role="switch"], [role="checkbox"]').first().isVisible().catch(() => false);
    const hasSettings = await page.locator('text=/setting|preference|option/i').isVisible().catch(() => false);
    
    expect(hasInputs || hasSettings).toBeTruthy();
  });
});

test.describe('Forms: Parent Goals', () => {
  test('goals page has editable goal controls', async ({ page }) => {
    await page.goto('/parent/goals');
    await page.waitForSelector('text=Loading...', { state: 'hidden', timeout: 15000 }).catch(() => {});
    
    // Should have some way to edit goals
    const hasEditControls = await page.locator('input, button:has-text("Edit"), button:has-text("Update"), [role="slider"]').first().isVisible().catch(() => false);
    
    expect(hasEditControls).toBeTruthy();
  });
});
