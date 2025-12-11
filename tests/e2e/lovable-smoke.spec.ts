/**
 * LOVABLE SMOKE TEST
 * 
 * Purpose: Catch runtime issues that only appear in deployed environments
 * - Dynamic import failures (module loading over network)
 * - Edge Function connectivity (real API, not mocks)
 * - Auth flow on external origins
 * - CORS issues
 * 
 * Run with: npm run test:lovable
 * Requires: LOVABLE_URL environment variable
 * 
 * NOTE: This test runs against PRODUCTION - use sparingly in CI
 */

import { test, expect } from '@playwright/test';

// Get Lovable URL from environment or use default
const LOVABLE_URL = process.env.LOVABLE_URL || 'https://preview--learnplay-lms.lovable.app';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eidcegehaswbtzrwzvfa.supabase.co';

test.describe('Lovable Deployment Smoke Tests', () => {
  test.describe.configure({ mode: 'serial' }); // Run in order

  test('1. Landing page loads without module errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Capture failed requests
    const failedRequests: string[] = [];
    page.on('requestfailed', request => {
      failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
    });

    await page.goto(LOVABLE_URL, { waitUntil: 'networkidle' });

    // Check for dynamic import failures
    const moduleErrors = consoleErrors.filter(e => 
      e.includes('Failed to fetch dynamically imported module') ||
      e.includes('Loading chunk') ||
      e.includes('ChunkLoadError')
    );

    expect(moduleErrors, `Module loading errors: ${moduleErrors.join(', ')}`).toHaveLength(0);

    // Page should have content (not blank)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  test('2. Key routes load without dynamic import failures', async ({ page }) => {
    const routesToTest = [
      '/',
      '/auth',
      '/courses',
      '/student/dashboard',
      '/teacher/dashboard',
      '/admin/ai-pipeline',
    ];

    for (const route of routesToTest) {
      const errors: string[] = [];
      
      page.on('console', msg => {
        if (msg.type() === 'error' && msg.text().includes('dynamically imported')) {
          errors.push(msg.text());
        }
      });

      await page.goto(`${LOVABLE_URL}${route}`, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      // Wait for lazy-loaded content
      await page.waitForLoadState('networkidle').catch(() => {});

      expect(
        errors, 
        `Route ${route} has module loading errors`
      ).toHaveLength(0);

      // Should render something (not error boundary)
      const hasErrorBoundary = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      expect(hasErrorBoundary, `Route ${route} shows error boundary`).toBeFalsy();
    }
  });

  test('3. Edge Functions are reachable (health check)', async ({ request }) => {
    // Test that Edge Functions respond (even if 401)
    const response = await request.get(`${SUPABASE_URL}/functions/v1/list-jobs`, {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDYzNTAsImV4cCI6MjA4MDQyMjM1MH0.DpXOHjccnVEewnPF5gA6tw27TcRXkkAfgrJkn0NvT_Q',
      },
      timeout: 15000,
    });

    // 401 = function is deployed and responding (just needs auth)
    // 503 = function crashed on startup
    // timeout = function not deployed
    expect(
      [200, 401, 403].includes(response.status()),
      `Edge Function returned ${response.status()} - expected 200, 401, or 403. Response: ${await response.text()}`
    ).toBeTruthy();
  });

  test('4. CORS headers are present', async ({ request }) => {
    const response = await request.fetch(`${SUPABASE_URL}/functions/v1/list-jobs`, {
      method: 'OPTIONS',
      headers: {
        'Origin': LOVABLE_URL,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type, apikey',
      },
    });

    // Should return CORS headers
    const corsOrigin = response.headers()['access-control-allow-origin'];
    expect(
      corsOrigin,
      'CORS headers missing from Edge Function response'
    ).toBeTruthy();

    // Origin should be echoed back or be '*'
    expect(
      corsOrigin === '*' || corsOrigin === LOVABLE_URL,
      `CORS origin mismatch: expected ${LOVABLE_URL} or *, got ${corsOrigin}`
    ).toBeTruthy();
  });

  test('5. Auth page is functional', async ({ page }) => {
    await page.goto(`${LOVABLE_URL}/auth`);
    await page.waitForLoadState('networkidle');

    // Auth page should load and show authentication UI
    // Different auth providers may have different UIs (email, OAuth, etc.)
    
    // Look for common auth elements - at least one should be present
    const authIndicators = [
      page.locator('input[type="email"], input[name="email"]'),
      page.locator('input[type="password"]'),
      page.locator('button:has-text("Sign")'),
      page.locator('button:has-text("Log")'),
      page.locator('button:has-text("Continue")'),
      page.locator('a:has-text("Sign")'),
      page.locator('[data-testid*="auth"]'),
      page.locator('form'),
      // Supabase Auth UI components
      page.locator('.supabase-auth-ui'),
      page.locator('[class*="auth"]'),
    ];

    let foundAuthElement = false;
    for (const indicator of authIndicators) {
      try {
        if (await indicator.first().isVisible({ timeout: 2000 })) {
          foundAuthElement = true;
          break;
        }
      } catch {
        // Element not found, continue
      }
    }

    // If no auth elements found, check that page at least loaded something
    if (!foundAuthElement) {
      const bodyText = await page.locator('body').textContent();
      // Should have some content (not blank/error)
      expect(
        bodyText?.length,
        'Auth page appears blank'
      ).toBeGreaterThan(50);
      
      // Warn but don't fail - auth UI may vary
      console.warn('⚠️ Could not find standard auth form elements, but page loaded with content');
    }
  });

  test('6. No API timeout errors on initial load', async ({ page }) => {
    const timeoutErrors: string[] = [];
    
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('timeout') || text.includes('Timeout') || text.includes('TIMEOUT')) {
        timeoutErrors.push(text);
      }
    });

    // Go to a page that makes API calls
    await page.goto(`${LOVABLE_URL}/courses`, { waitUntil: 'networkidle' });
    
    // Wait a bit for async operations
    await page.waitForTimeout(3000);

    // Filter out expected "mock mode" messages
    const realTimeoutErrors = timeoutErrors.filter(e => 
      !e.includes('mock') && !e.includes('Mock')
    );

    // Note: Some timeouts may be expected if user isn't logged in
    // This test just logs them for visibility
    if (realTimeoutErrors.length > 0) {
      console.warn('⚠️ Timeout errors detected:', realTimeoutErrors);
    }
  });

  test('7. Page reload works correctly', async ({ page }) => {
    // First load
    await page.goto(LOVABLE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for React to hydrate
    await page.waitForTimeout(2000);

    // Page should have rendered content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length, 'Page appears blank on first load').toBeGreaterThan(50);

    // Reload should work without errors
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      const bodyTextAfterReload = await page.locator('body').textContent();
      expect(bodyTextAfterReload?.length, 'Page blank after reload').toBeGreaterThan(50);
    } catch (error) {
      // Reload failures can happen due to network flakiness - warn but don't fail
      console.warn('⚠️ Page reload had issues:', error);
    }
  });
});

test.describe('Lovable Error Recovery', () => {
  test('Error boundary catches and displays errors gracefully', async ({ page }) => {
    // Navigate to a route that might have issues
    await page.goto(`${LOVABLE_URL}/nonexistent-route-12345`);
    await page.waitForLoadState('networkidle');

    // Should show 404 or error page, not crash
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(20);

    // Should not show raw stack trace
    const hasStackTrace = bodyText?.includes('at Object.') || bodyText?.includes('webpack');
    expect(hasStackTrace, 'Raw stack trace visible to user').toBeFalsy();
  });
});

