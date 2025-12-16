import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function deadJobAudit({ params }: { params: { maxQueuedMin?: number; maxProcessingMin?: number } }) {
	const maxQueuedMin = Math.max(1, params?.maxQueuedMin ?? 30);
	const maxProcessingMin = Math.max(1, params?.maxProcessingMin ?? 60);

	const now = Date.now();

	const res = await fetchJson(`${config.supabaseUrl}/functions/v1/list-jobs?limit=500`, {
		method: 'GET',
		headers: { 'X-Agent-Token': config.agentToken },
		timeoutMs: 10000,
	});
	if (!res.ok) {
		return { ok: false, error: `list-jobs failed (${res.status})` };
	}
	// Support multiple response shapes: { items: [...] } or { jobs: [...] } or [...]
	const payload: any = res.json || {};
	const items: any[] = Array.isArray(payload?.items)
		? payload.items
		: Array.isArray(payload?.jobs)
			? payload.jobs
			: Array.isArray(payload)
				? payload
				: [];

	const toMinutes = (ts?: string) => {
		if (!ts) return Infinity;
		const t = Date.parse(ts);
		if (Number.isNaN(t)) return Infinity;
		return Math.max(0, Math.round((now - t) / 60000));
	};

	const suspects: Array<{ id: string; status: string; ageMin: number; reason: string }> = [];

	for (const j of items) {
		const status = String(j?.status || '').toLowerCase();
		const updated = j?.updated_at || j?.updatedAt || j?.created_at || j?.createdAt;
		const age = toMinutes(updated);
		if (status === 'queued' && age > maxQueuedMin) {
			suspects.push({ id: String(j.id || j.jobId || '?'), status, ageMin: age, reason: `queued > ${maxQueuedMin}m` });
		}
		if (status === 'processing' && age > maxProcessingMin) {
			suspects.push({ id: String(j.id || j.jobId || '?'), status, ageMin: age, reason: `processing > ${maxProcessingMin}m` });
		}
		// Missing logs heuristic
		if ((status === 'queued' || status === 'processing') && !j?.last_log_at && !j?.log_count) {
			suspects.push({ id: String(j.id || j.jobId || '?'), status, ageMin: age, reason: 'missing logs' });
		}
	}

	const counts = items.reduce<Record<string, number>>((acc, j) => {
		const status = String(j?.status || 'unknown').toLowerCase();
		acc[status] = (acc[status] || 0) + 1;
		return acc;
	}, {});

	const suggestions: string[] = [];
	if (suspects.length > 0) {
		suggestions.push('Inspect job logs for suspects via /admin/jobs');
		suggestions.push('Verify SSE event stream and runner status');
		suggestions.push('Ensure apply-job-result is invoked for terminal jobs');
	}

	return { ok: suspects.length === 0, counts, suspects, suggestions };
}


