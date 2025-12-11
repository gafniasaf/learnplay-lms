import { config } from '../config.ts';
import { fetchJson } from '../http.ts';
import { ENDPOINT_PROBES } from '../config/endpointHealth.ts';

export async function checkAuthHealth() {
	const base = `${config.supabaseUrl}/functions/v1/`;
	const results: Array<{
		path: string;
		method: 'GET' | 'POST';
		status: number;
		ok: boolean;
		expected: number;
		durationMs: number;
		body?: any;
		suggestion?: string;
	}> = [];
	const unauthorized: string[] = [];
	for (const probe of ENDPOINT_PROBES) {
		const url = `${base}${probe.path}`;
		const start = Date.now();
		const resp = await fetchJson(url, {
			method: probe.method,
			headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
			body: probe.method === 'POST' ? (probe.body ?? {}) : undefined,
			timeoutMs: 8000,
			retries: 0,
		});
		const durationMs = Date.now() - start;
		const ok = resp.status === probe.expected || (probe.expected === 200 && resp.status >= 200 && resp.status < 300);
		const suggestion = (resp.status === 401 || resp.status === 403) ? 'Check AGENT_TOKEN and Edge env configuration.' : undefined;
		if (resp.status === 401 || resp.status === 403) unauthorized.push(probe.path);
		results.push({
			path: probe.path,
			method: probe.method,
			status: resp.status,
			ok,
			expected: probe.expected,
			durationMs,
			body: resp.json ?? resp.text,
			suggestion,
		});
	}
	const ok = unauthorized.length === 0 && results.every(r => r.ok);
	return { ok, results, unauthorized };
}


