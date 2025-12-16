import { config } from '../config';
import { fetchJson } from '../http';

export function roundtripSeeds({ params }: { params: { method?: string } }) {
	const seeds = {
		'lms.getCourse': {
			minimal: { courseId: 'sample-course' },
		},
		'lms.applyJobResult': {
			minimal: { courseId: 'sample-course', jobId: 'dry-run', mergePlan: { patch: [] }, dryRun: true },
		},
		'lms.listJobs': {
			minimal: {},
		},
	};
	if (params?.method && seeds[params.method as keyof typeof seeds]) {
		return { ok: true, seeds: (seeds as any)[params.method] };
	}
	return { ok: true, seeds };
}

export async function roundtripTest({ params }: { params: { method: string; variant?: string; args?: any } }) {
	const { method, args } = params;

	// Map a few supported methods to edge calls for quick validation
	if (method === 'lms.getCourse') {
		const courseId = args?.courseId || 'sample-course';
		const res = await fetchJson(`${config.supabaseUrl}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`, {
			method: 'GET',
			headers: { 'X-Agent-Token': config.agentToken },
			timeoutMs: 8000,
		});
		if (!res.ok) return { ok: false, error: `edge_get_course_${res.status}` };
		const env = res.json;
		const issues: string[] = [];
		if (!env?.format) issues.push('missing format');
		if (!env?.content) issues.push('missing content');
		return { ok: issues.length === 0, issues };
	}

	if (method === 'lms.listJobs') {
		const res = await fetchJson(`${config.supabaseUrl}/functions/v1/list-jobs?limit=1`, {
			method: 'GET',
			headers: { 'X-Agent-Token': config.agentToken },
			timeoutMs: 8000,
		});
		return { ok: res.ok, status: res.status };
	}

	if (method === 'lms.applyJobResult') {
		const body = args || { courseId: 'sample-course', jobId: 'dry-run', mergePlan: { patch: [] }, dryRun: true };
		const res = await fetchJson(`${config.supabaseUrl}/functions/v1/apply-job-result`, {
			method: 'POST',
			headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
			body,
			timeoutMs: 8000,
		});
		return { ok: res.ok, status: res.status };
	}

	return { ok: false, error: 'unsupported_method' };
}


