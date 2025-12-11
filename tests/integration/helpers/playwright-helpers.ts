import { Page, expect } from '@playwright/test';
import { loadPlaywrightAuthState } from './auth';

/**
 * Playwright utilities for CTA integration testing
 * 
 * Provides utilities to test CTAs with real Edge Function calls.
 */

/**
 * Use authentication state for a specific role
 */
export async function useAuthState(
  page: Page,
  role: 'admin' | 'teacher' | 'parent' | 'student'
): Promise<void> {
  const authState = loadPlaywrightAuthState(role);
  
  // Set authentication cookies/storage
  await page.context().addCookies(authState.cookies || []);
  
  // Set localStorage if present
  if (authState.origins && authState.origins[0]?.localStorage) {
    await page.goto(authState.origins[0].origin);
    for (const item of authState.origins[0].localStorage) {
      await page.evaluate(([key, value]) => {
        localStorage.setItem(key, value);
      }, [item.name, item.value]);
    }
  }
}

/**
 * Intercept Edge Function calls and track them
 * 
 * Returns a promise that resolves to the calls array, which will be populated
 * as requests are made. The route handler is set up immediately.
 */
export async function interceptEdgeFunction(
  page: Page,
  functionName: string
): Promise<Array<{ params: Record<string, any>; response: any }>> {
  const calls: Array<{ params: Record<string, any>; response: any }> = [];
  
  await page.route(`**/functions/v1/${functionName}*`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    
    // Extract params from URL or body
    const params: Record<string, any> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    
    // If POST, get body
    if (request.method() === 'POST') {
      try {
        const body = request.postDataJSON();
        Object.assign(params, body);
      } catch {
        // Body might not be JSON
      }
    }
    
    // Continue the request and capture response
    const response = await route.fetch();
    const responseBody = await response.json().catch(() => null);
    
    calls.push({
      params,
      response: responseBody,
    });
    
    // Fulfill with actual response
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: JSON.stringify(responseBody),
    });
  });
  
  // Return a proxy that tracks calls
  return calls;
}

/**
 * Get all Edge Function requests for a specific function
 */
export async function getEdgeFunctionRequests(
  page: Page,
  functionName: string
): Promise<Array<{ params: Record<string, any>; timestamp: number }>> {
  // This requires intercepting requests - use interceptEdgeFunction instead
  // Or use Playwright's request interception API
  const requests: Array<{ params: Record<string, any>; timestamp: number }> = [];
  
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes(`/functions/v1/${functionName}`)) {
      const urlObj = new URL(url);
      const params: Record<string, any> = {};
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      
      requests.push({
        params,
        timestamp: Date.now(),
      });
    }
  });
  
  return requests;
}

/**
 * Mock Edge Function to return error
 */
export async function mockEdgeFunctionError(
  page: Page,
  functionName: string,
  statusCode: number = 400,
  errorMessage: string = 'Test error'
): Promise<void> {
  await page.route(`**/functions/v1/${functionName}*`, (route) => {
    route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify({
        error: errorMessage,
      }),
    });
  });
}

/**
 * Verify Edge Function was called with correct parameters
 */
export async function expectEdgeFunctionCalled(
  page: Page,
  functionName: string,
  expectedParams: Record<string, any>
): Promise<void> {
  // This is a helper that would verify the function was called
  // Implementation depends on how we track calls
  // For now, this is a placeholder showing the intended API
  
  // In practice, you'd use interceptEdgeFunction or getEdgeFunctionRequests
  // and then verify the params match
  const calls = await interceptEdgeFunction(page, functionName);
  
  expect(calls.length).toBeGreaterThan(0);
  
  const lastCall = calls[calls.length - 1];
  for (const [key, value] of Object.entries(expectedParams)) {
    expect(lastCall.params).toHaveProperty(key);
    if (value !== undefined) {
      expect(lastCall.params[key]).toBe(value);
    }
  }
}

/**
 * Wait for Edge Function call to complete
 */
export async function waitForEdgeFunctionCall(
  page: Page,
  functionName: string,
  options: { timeout?: number } = {}
): Promise<void> {
  await page.waitForResponse(
    (response) => {
      return response.url().includes(`/functions/v1/${functionName}`) && response.status() < 400;
    },
    { timeout: options.timeout || 10000 }
  );
}

/**
 * Verify no Edge Function errors occurred
 */
export async function expectNoEdgeFunctionErrors(page: Page): Promise<void> {
  const errors: string[] = [];
  
  page.on('response', (response) => {
    if (response.url().includes('/functions/v1/')) {
      if (response.status() >= 400) {
        errors.push(`${response.url()}: ${response.status()}`);
      }
    }
  });
  
  // Wait a bit for any pending requests
  await page.waitForTimeout(1000);
  
  if (errors.length > 0) {
    throw new Error(`Edge Function errors occurred: ${errors.join(', ')}`);
  }
}

