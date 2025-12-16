import { config } from '../config.js';
import { fetchJson } from '../http.js';

type Role = 'superadmin' | 'org_admin' | 'teacher' | 'student';

const ROLE_ENV: Record<Role, string> = {
	superadmin: 'RLS_SUPER_TOKEN',
	org_admin: 'RLS_ADMIN_TOKEN',
	teacher: 'RLS_TEACHER_TOKEN',
	student: 'RLS_STUDENT_TOKEN',
};

async function call(path: string, token: string | undefined, method: 'GET' | 'POST' = 'GET', body?: any) {
	const url = `${config.supabaseUrl}/functions/v1/${path}`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (token) headers['X-Agent-Token'] = token;
	return fetchJson(url, { method, headers, body, retries: 0, timeoutMs: 8000 });
}

export async function rlsProbe() {
	const roles: Role[] = ['superadmin','org_admin','teacher','student'];
	const results: Array<{
		role: string;
		check: string;
		status: number;
		ok: boolean;
		expectation: string;
	}> = [];
	const skipped: string[] = [];

	for (const role of roles) {
		const token = process.env[ROLE_ENV[role]];
		if (!token) { skipped.push(role); continue; }

		// Admin-only endpoints
		const adminChecks = ['get-org-settings', 'save-org-settings'];
		for (const check of adminChecks) {
			const isPost = check === 'save-org-settings';
			const res = await call(check, token, isPost ? 'POST' : 'GET', isPost ? { orgId: 'test', thresholds: { variantsCoverageMin: 0.1 } } : undefined);
			const shouldBeOK = role === 'superadmin' || role === 'org_admin';
			const ok = shouldBeOK ? (res.status !== 401 && res.status !== 403) : (res.status === 401 || res.status === 403);
			results.push({ role, check, status: res.status, ok, expectation: shouldBeOK ? 'allow' : 'deny' });
		}

		// Generic: list-jobs should be restricted to admin roles
		{
			const res = await call('list-jobs?limit=1', token, 'GET');
			const shouldBeOK = role === 'superadmin' || role === 'org_admin';
			const ok = shouldBeOK ? (res.status === 200) : (res.status === 401 || res.status === 403);
			results.push({ role, check: 'list-jobs', status: res.status, ok, expectation: shouldBeOK ? 'allow' : 'deny' });
		}
	}

	const ok = results.every(r => r.ok);
	return { ok, skipped, results };
}


