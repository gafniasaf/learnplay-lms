import { config } from '../config';
import { fetchJson } from '../http';

export async function checkStorageIntegrity({ params }: { params: { courseId: string; autoRepair?: boolean } }) {
	const { courseId } = params;

	// Attempt to fetch via Edge get-course
	const url = `${config.supabaseUrl}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`;
	const res = await fetchJson(url, {
		method: 'GET',
		headers: { 'X-Agent-Token': config.agentToken },
		timeoutMs: 10000,
	});

	const issues: string[] = [];
	let envelope: any = null;

	if (!res.ok || !res.json) {
		issues.push(`get-course failed: status=${res.status}`);
	} else {
		envelope = res.json;
	}

	// Validate minimal envelope shape
	const validations: Array<{ check: boolean; message: string }> = [
		{ check: !!envelope, message: 'missing envelope' },
		{ check: typeof envelope?.id === 'string' && envelope.id.length > 0, message: 'missing id' },
		{ check: typeof envelope?.format === 'string' && envelope.format.length > 0, message: 'missing format' },
		{ check: typeof envelope?.content === 'object' && envelope.content !== null, message: 'missing content object' },
	];
	for (const v of validations) {
		if (!v.check) issues.push(v.message);
	}

	// Additional sanity checks
	if (envelope?.version === undefined) {
		issues.push('missing version');
	}

	// Variant axes presence (non-fatal)
	if (envelope?.variants && typeof envelope.variants !== 'object') {
		issues.push('invalid variants structure');
	}

	const ok = issues.length === 0;

	const suggestions: string[] = [];
	if (!ok) {
		suggestions.push('Verify Storage object exists: bucket "courses", path "{courseId}/course.json"');
		suggestions.push('Run editor Auto-Fix or re-save course to regenerate envelope');
	}

	return { ok, issues, suggestions, envelopeSummary: ok ? { id: envelope.id, format: envelope.format, version: envelope.version } : null };
}


