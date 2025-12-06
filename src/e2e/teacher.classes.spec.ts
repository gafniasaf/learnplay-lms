import { test, expect, Page } from '@playwright/test';

interface ClassMember {
  user_id: string;
  role: string;
  email: string | null;
  profiles: {
    id: string;
    full_name: string;
  };
}

interface TeacherClass {
  id: string;
  name: string;
  description?: string;
  owner: string;
  org_id: string;
  created_at: string;
  class_members: ClassMember[];
  student_count: number;
}

const STORAGE_KEYS = [
  'sb-placeholder-auth-token',
  'sb-placeholder.supabase.co-auth-token',
];

function buildSession() {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600;
  const user = {
    id: 'teacher-0001-uuid',
    email: 'teacher@example.com',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: { full_name: 'Teacher Example' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
  };

  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user,
  };
}

function createBaseHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

interface TeacherRouteCounters {
  listFetches: number;
}

async function setupTeacherRoutes(page: Page, classesState: TeacherClass[], counters: TeacherRouteCounters): Promise<void> {
  await page.route('**/functions/v1/list-classes', async (route) => {
    counters.listFetches += 1;
    const payload = {
      classes: classesState.map((cls) => ({
        ...cls,
        class_members: cls.class_members.map((member) => ({ ...member })),
      })),
    };

    await route.fulfill({
      status: 200,
      headers: createBaseHeaders(),
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/functions/v1/create-class', async (route) => {
    const request = route.request();
    const body = (request.postDataJSON() ?? {}) as { name?: string; description?: string };

    const now = new Date().toISOString();
    const newClass: TeacherClass = {
      id: `class-${classesState.length + 1}`,
      name: body.name ?? 'Untitled Class',
      description: body.description,
      owner: 'teacher-0001-uuid',
      org_id: 'org-001',
      created_at: now,
      student_count: 0,
      class_members: [],
    };

    classesState.push(newClass);

    await route.fulfill({
      status: 200,
      headers: createBaseHeaders(),
      body: JSON.stringify({
        class: {
          id: newClass.id,
          name: newClass.name,
          description: newClass.description,
          owner: newClass.owner,
          created_at: newClass.created_at,
        },
      }),
    });
  });

  await page.route('**/functions/v1/add-class-member', async (route) => {
    const request = route.request();
    const body = (request.postDataJSON() ?? {}) as { classId?: string; studentEmail?: string };

    const target = classesState.find((cls) => cls.id === body.classId);
    if (target) {
      const member: ClassMember = {
        user_id: 'student-alice-uuid',
        role: 'student',
        email: body.studentEmail ?? null,
        profiles: {
          id: 'student-alice-uuid',
          full_name: 'Alice Smith',
        },
      };

      if (!target.class_members.some((m) => m.user_id === member.user_id)) {
        target.class_members.push(member);
      }
      target.student_count = target.class_members.length;
    }

    await route.fulfill({
      status: 200,
      headers: createBaseHeaders(),
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/functions/v1/get-class-roster**', async (route) => {
    const url = new URL(route.request().url());
    const classId = url.searchParams.get('classId');
    const target = classesState.find((cls) => cls.id === classId);

    await route.fulfill({
      status: 200,
      headers: createBaseHeaders(),
      body: JSON.stringify({
        roster: target?.class_members ?? [],
        pendingInvites: [],
        className: target?.name ?? 'Unknown Class',
      }),
    });
  });
}

test.describe('Teacher classes flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ storageKeys, session }) => {
      localStorage.setItem('useMock', 'false');

      const payload = {
        currentSession: session,
        currentUser: session.user,
        expires_at: session.expires_at,
      };

      storageKeys.forEach((key: string) => {
        localStorage.setItem(key, JSON.stringify(payload));
      });

      const originalGetItem = localStorage.getItem.bind(localStorage);
      localStorage.getItem = (key: string) => {
        if (key && key.toLowerCase().includes('auth-token')) {
          return JSON.stringify(payload);
        }
        return originalGetItem(key);
      };
    }, { storageKeys: STORAGE_KEYS, session: buildSession() });
  });

  // Skipped due to Playwright route interception bug causing "Object with guid response@... was not bound" errors
  // TODO: Re-enable when Playwright fixes the connection issue or when we migrate to MSW
  test.skip('teacher can create class and add Alice to increase student count', async ({ page }) => {
    const classesState: TeacherClass[] = [];
    const counters: TeacherRouteCounters = { listFetches: 0 };
    await setupTeacherRoutes(page, classesState, counters);
    
    // Small delay to ensure routes are fully registered
    await page.waitForTimeout(500);

    // Go directly to teacher classes page (auth is mocked in beforeEach)
    await page.goto('/teacher/classes', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForLoadState('load');
    await expect(page.getByRole('heading', { name: 'Classes' })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /^Create Class$/ }).first().click();
    await page.getByLabel('Class Name').fill('Homeroom A');
    await page.getByLabel('Description (optional)').fill('Primary group for 2025 cohort');
    await page.getByRole('button', { name: /^Create Class$/ }).last().click();

    await page.reload();
    await expect.poll(() => counters.listFetches).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Homeroom A' })).toBeVisible();
    await expect(page.getByText('0 students').first()).toBeVisible();

    await page.getByRole('button', { name: 'Roster' }).click();
    await expect(page.getByRole('heading', { name: 'Homeroom A Roster' })).toBeVisible();

    await page.getByPlaceholder('student@example.com').fill('alice.student@example.com');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByRole('cell', { name: 'Alice Smith' })).toBeVisible();

    await page.getByRole('button', { name: 'Close' }).click();
    await page.reload();
    await expect(page.getByText('1 student').first()).toBeVisible();
  });
});


