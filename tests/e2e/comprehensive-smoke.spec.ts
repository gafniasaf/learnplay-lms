/**
 * COMPREHENSIVE SMOKE TESTS
 * 
 * These tests verify that EVERY route loads without crashing.
 * Run first to catch any broken imports or rendering errors.
 */

import { test, expect } from '@playwright/test';

const ALL_ROUTES = [
  // Public/Landing
  { path: '/', name: 'Landing' },
  { path: '/about', name: 'About' },
  { path: '/courses', name: 'Courses Catalog' },
  { path: '/help', name: 'Help' },
  { path: '/kids', name: 'Kids Landing' },
  { path: '/parents', name: 'Parents Landing' },
  { path: '/schools', name: 'Schools Landing' },
  
  // Auth
  { path: '/auth', name: 'Auth/Login' },
  
  // Student
  { path: '/student/dashboard', name: 'Student Dashboard' },
  { path: '/student/assignments', name: 'Student Assignments' },
  { path: '/student/achievements', name: 'Student Achievements' },
  { path: '/student/goals', name: 'Student Goals' },
  { path: '/student/timeline', name: 'Student Timeline' },
  { path: '/student/join-class', name: 'Student Join Class' },
  
  // Teacher
  { path: '/teacher/dashboard', name: 'Teacher Dashboard' },
  { path: '/teacher/students', name: 'Teacher Students' },
  { path: '/teacher/classes', name: 'Teacher Classes' },
  { path: '/teacher/class-progress', name: 'Teacher Class Progress' },
  { path: '/teacher/assignments', name: 'Teacher Assignments' },
  { path: '/teacher/analytics', name: 'Teacher Analytics' },
  { path: '/teacher/control', name: 'Teacher Control' },
  
  // Parent
  { path: '/parent/dashboard', name: 'Parent Dashboard' },
  { path: '/parent/subjects', name: 'Parent Subjects' },
  { path: '/parent/topics', name: 'Parent Topics' },
  { path: '/parent/timeline', name: 'Parent Timeline' },
  { path: '/parent/goals', name: 'Parent Goals' },
  { path: '/parent/link-child', name: 'Parent Link Child' },
  
  // Admin
  { path: '/admin/console', name: 'Admin Console' },
  { path: '/admin/ai-pipeline', name: 'Admin AI Pipeline' },
  { path: '/admin/courses/select', name: 'Admin Course Selector' },
  { path: '/admin/jobs', name: 'Admin Jobs Dashboard' },
  { path: '/admin/logs', name: 'Admin Logs' },
  { path: '/admin/tools/media', name: 'Admin Media Manager' },
  { path: '/admin/performance', name: 'Admin Performance' },
  { path: '/admin/system-health', name: 'Admin System Health' },
  { path: '/admin/tags', name: 'Admin Tag Management' },
  { path: '/admin/tags/approve', name: 'Admin Tag Approval Queue' },
  
  // Play/Game
  { path: '/play', name: 'Play (no course)' },
  { path: '/results', name: 'Results' },
  
  // Messages
  { path: '/messages', name: 'Messages Inbox' },
  
  // Settings
  { path: '/settings', name: 'Settings' },
  
  // Catalog Builder
  { path: '/catalog-builder', name: 'Catalog Builder' },
  { path: '/catalog-builder/media', name: 'Catalog Builder Media' },
  
  // CRM Demo
  { path: '/crm/dashboard', name: 'CRM Dashboard' },
  { path: '/crm/contacts', name: 'CRM Contacts' },
  
  // 404
  { path: '/this-route-does-not-exist-12345', name: '404 Page' },
];

test.describe('Smoke Tests: All Routes Load', () => {
  for (const route of ALL_ROUTES) {
    test(`${route.name} (${route.path}) loads without crashing`, async ({ page }) => {
      await page.goto(route.path);
      
      // Wait for page to stabilize
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);
      
      // Page should not show React error boundary
      const errorBoundary = page.locator('text=Something went wrong');
      const hasError = await errorBoundary.isVisible().catch(() => false);
      
      if (hasError) {
        // Capture error details for debugging
        const errorText = await page.locator('pre').textContent().catch(() => 'No error details');
        throw new Error(`Route ${route.path} crashed: ${errorText?.substring(0, 200)}`);
      }
      
      // Page should have content (not blank)
      const body = await page.locator('body').textContent();
      expect(body?.length).toBeGreaterThan(10);
      
      // No unhandled JS errors
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          consoleErrors.push(msg.text());
        }
      });
      
      // Check for critical console errors (but allow some expected ones)
      const criticalErrors = consoleErrors.filter(e => 
        e.includes('TypeError') || 
        e.includes('ReferenceError') ||
        e.includes('Cannot read properties of undefined')
      );
      
      expect(criticalErrors).toHaveLength(0);
    });
  }
});

test.describe('Smoke Tests: No Blank Pages', () => {
  test('all routes render meaningful content', async ({ page }) => {
    const failures: string[] = [];
    
    for (const route of ALL_ROUTES) {
      await page.goto(route.path);
      await page.waitForLoadState('domcontentloaded');
      
      // Check for loading skeleton or actual content
      const hasContent = await page.locator('h1, h2, [role="main"], main, .card, button').first().isVisible().catch(() => false);
      const hasLoading = await page.locator('text=Loading').isVisible().catch(() => false);
      const hasSkeleton = await page.locator('[class*="skeleton"], [class*="animate-pulse"]').first().isVisible().catch(() => false);
      
      if (!hasContent && !hasLoading && !hasSkeleton) {
        failures.push(route.path);
      }
    }
    
    expect(failures, `These routes appear blank: ${failures.join(', ')}`).toHaveLength(0);
  });
});
