import { config } from '../config';
import { fetchJson } from '../http';

export async function fallbackAudit({ params }: { params: { courseId: string } }) {
	const { courseId } = params;

	// Primary: get-course
	const primary = await fetchJson(`${config.supabaseUrl}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`, {
		method: 'GET',
		headers: { 'X-Agent-Token': config.agentToken },
		timeoutMs: 8000,
	});

	const issues: string[] = [];
	let stale = false;
	const missingFields: string[] = [];

	if (!primary.ok || !primary.json) {
		issues.push(`get-course failed (${primary.status})`);
	} else {
		const env = primary.json;
		if (!env?.format) missingFields.push('format');
		if (!env?.content) missingFields.push('content');
		if (env?.version === undefined) missingFields.push('version');
	}

	// Heuristic stale check: compare content_version in course metadata if exposed via edge (optional in our stack).
	// Probe list-jobs as a recency proxy is not reliable; skip strict stale computation.

	if (missingFields.length > 0) {
		stale = true;
	}

	const suggestions: string[] = [];
	if (!primary.ok) {
		suggestions.push('Verify Edge get-course function health and token');
	} else if (stale) {
		suggestions.push('Re-save course or run Auto-Fix to regenerate envelope');
	}

	return {
		ok: issues.length === 0 && !stale,
		issues,
		stale,
		missingFields,
		suggestions,
	};
}


