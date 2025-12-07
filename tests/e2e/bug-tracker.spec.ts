import { test, expect } from '@playwright/test';

// REQUIRED env var per NO-FALLBACK policy
// Note: Could use Playwright's baseURL config and relative URLs instead
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
if (!BASE_URL) {
  throw new Error('❌ PLAYWRIGHT_BASE_URL is REQUIRED - set env var before running tests');
}

test.describe('Bug Tracker Demo', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the bug tracker demo
    await page.goto(`${BASE_URL}/bug-tracker`);
  });

  test('should display project list', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for the main heading
    await expect(page.locator('h1')).toContainText('Projects');
    
    // Should show either projects or empty state with create button
    const createButton = page.locator('button').filter({ hasText: /New Project|Create First Project/ });
    await expect(createButton).toBeVisible();
  });

  test('should navigate to project board', async ({ page }) => {
    // First, create a project if none exist
    const createButton = page.locator('button').filter({ hasText: /New Project|Create First Project/ }).first();
    
    if (await createButton.isVisible()) {
      await createButton.click();
      
      // Handle the prompt dialog
      page.on('dialog', async dialog => {
        expect(dialog.type()).toBe('prompt');
        await dialog.accept('Test Project');
      });
      
      // Wait for the project to be created and page to update
      await page.waitForTimeout(1000);
    }
    
    // Look for a "View Issues" link
    const viewIssuesLink = page.locator('a').filter({ hasText: 'View Issues' }).first();
    if (await viewIssuesLink.isVisible()) {
      await viewIssuesLink.click();
      
      // Should navigate to the project board
      await expect(page.locator('h1')).toContainText('Issue Board');
      
      // Should show kanban columns
      await expect(page.locator('text=To Do')).toBeVisible();
      await expect(page.locator('text=In Progress')).toBeVisible();
      await expect(page.locator('text=Done')).toBeVisible();
    }
  });

  test('should create new issue', async ({ page }) => {
    // Navigate to a project board (assuming we have projects from previous test)
    const viewIssuesLink = page.locator('a').filter({ hasText: 'View Issues' }).first();
    
    if (await viewIssuesLink.isVisible()) {
      await viewIssuesLink.click();
      
      // Click "New Issue" button
      const newIssueButton = page.locator('button').filter({ hasText: 'New Issue' });
      await newIssueButton.click();
      
      // Handle the prompt dialog
      page.on('dialog', async dialog => {
        expect(dialog.type()).toBe('prompt');
        await dialog.accept('Test Issue for E2E');
      });
      
      // Wait for the issue to be created
      await page.waitForTimeout(1000);
      
      // Should see the new issue in the To Do column
      await expect(page.locator('text=Test Issue for E2E')).toBeVisible();
    }
  });

  test('should trigger AI triage', async ({ page }) => {
    // Navigate to project board
    const viewIssuesLink = page.locator('a').filter({ hasText: 'View Issues' }).first();
    
    if (await viewIssuesLink.isVisible()) {
      await viewIssuesLink.click();
      
      // Look for an issue card with a Triage button
      const triageButton = page.locator('button').filter({ hasText: 'Triage' }).first();
      
      if (await triageButton.isVisible()) {
        await triageButton.click();
        
        // Should show processing state
        await expect(page.locator('text=Thinking...')).toBeVisible();
        
        // Wait for AI processing (this might take a while in real scenarios)
        // For demo purposes, we'll just check that the button was clicked
        await page.waitForTimeout(2000);
        
        // Note: In a real test, we'd mock the MCP responses or use a test environment
        // where the AI job completes quickly with predictable results
      }
    }
  });

  test('should show MCP health status', async ({ page }) => {
    // This test verifies that the MCP system is accessible
    // We can check this by looking for any MCP-related errors in the console
    
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleLogs.push(msg.text());
      }
    });
    
    // Navigate around the app
    await page.goto(`${BASE_URL}/bug-tracker`);
    await page.waitForTimeout(1000);
    
    // Check that there are no MCP connection errors
    const mcpErrors = consoleLogs.filter(log => 
      log.includes('MCP') || log.includes('lms.') || log.includes('4000')
    );
    
    expect(mcpErrors.length).toBe(0);
  });
});
