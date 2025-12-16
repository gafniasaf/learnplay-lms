import { test, expect } from '@playwright/test';
import { gotoStable } from './journeyAdapter';

const cases: Array<{ from: string; expectText: RegExp }> = [
  { from: '/admin/courses', expectText: /Select Course to Edit|Loading courses/i },
  { from: '/admin/course-versions', expectText: /Select Course to Edit|Loading courses/i },
  { from: '/admin/media-manager', expectText: /Media Manager|Upload File/i },
  { from: '/admin/tag-approval', expectText: /Tag Approval Queue/i },
  { from: '/admin/metrics', expectText: /MCP Metrics/i },
  { from: '/teacher/assignment-progress', expectText: /Assignments/i },
  { from: '/play/welcome', expectText: /Play/i },
  { from: '/messages/inbox', expectText: /Inbox/i },
];

test.describe('legacy parity: dashboard route aliases', () => {
  for (const c of cases) {
    test(`legacy URL loads without 404: ${c.from}`, async ({ page }) => {
      await gotoStable(page, c.from);

      // Ensure we didn't hit the React 404 route.
      await expect(page.getByRole('heading', { name: '404' })).not.toBeVisible();

      // Ensure something route-specific rendered.
      await expect(page.getByText(c.expectText)).toBeVisible({ timeout: 45_000 });
    });
  }
});


