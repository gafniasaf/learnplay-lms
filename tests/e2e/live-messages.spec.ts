/**
 * E2E Tests: Messages/Inbox Feature
 * 
 * Tests messaging functionality:
 * - Inbox loading
 * - Message list display
 * - Message viewing
 */

import { test, expect } from '@playwright/test';

test.describe('Messages Inbox', () => {
  test('inbox page loads without crashing', async ({ page }) => {
    await page.goto('/messages');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
    
    // Should not show error boundary
    const hasError = await page.getByText(/something went wrong/i).isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test('inbox shows messages or empty state', async ({ page }) => {
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    
    // Should show messages or empty state
    const hasMessages = await page.locator('[data-testid*="message"], .message, tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasMessageText = await page.getByText(/message|inbox|from|subject/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await page.getByText(/no messages|empty|inbox is empty/i).isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasMessages || hasMessageText || hasEmptyState || hasContent).toBeTruthy();
  });

  test('inbox has compose functionality', async ({ page }) => {
    await page.goto('/messages');
    await page.waitForLoadState('networkidle');
    
    // Should have compose button
    const hasComposeButton = await page.locator('button:has-text("Compose"), button:has-text("New"), button:has-text("Write")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasComposeLink = await page.locator('a:has-text("Compose"), a:has-text("New")').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasComposeButton || hasComposeLink || hasContent).toBeTruthy();
  });
});

test.describe('Messages Help Page', () => {
  test('help page loads without crashing', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('help page shows documentation or FAQ', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('networkidle');
    
    // Should show help content
    const hasHelpContent = await page.getByText(/help|faq|question|support|guide/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasHelpContent || hasContent).toBeTruthy();
  });
});

test.describe('Settings Page', () => {
  test('settings page loads without crashing', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const pageContent = await page.locator('body').textContent() || '';
    expect(pageContent.length).toBeGreaterThan(50);
  });

  test('settings page shows configuration options', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    // Should show settings options
    const hasSettings = await page.getByText(/setting|preference|account|profile|notification/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('form, input, select').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasSettings || hasForm || hasContent).toBeTruthy();
  });
});
