import { config } from '../config.ts';
import { fetchJson } from '../http.ts';
import { ENDPOINT_PROBES } from '../config/endpointHealth.ts';

export async function edgeSmoke() {
	const base = `${config.supabaseUrl}/functions/v1/`;
	const results: Array<{
		path: string;
		method: 'GET' | 'POST';
		status: number;
		durationMs: number;
		ok: boolean;
		body?: any;
	}> = [];
	for (const p of ENDPOINT_PROBES) {
		const url = `${base}${p.path}`;
		const start = Date.now();
		const res = await fetchJson(url, {
			method: p.method,
			headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
			body: p.method === 'POST' ? (p.body ?? {}) : undefined,
			timeoutMs: 8000,
			retries: 0,
		});
		const durationMs = Date.now() - start;
		const ok = res.status >= 200 && res.status < 300;
		results.push({
			path: p.path,
			method: p.method,
			status: res.status,
			durationMs,
			ok,
			body: (res.text && res.text.slice ? res.text.slice(0, 200) : undefined) || res.json,
		});
	}
	const okCount = results.filter(r => r.ok).length;
	const errorCount = results.length - okCount;
	return { ok: errorCount === 0, okCount, errorCount, results };
}


