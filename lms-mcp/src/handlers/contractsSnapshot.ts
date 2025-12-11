import { config } from '../config.ts';
import { fetchJson } from '../http.ts';

export async function contractsSnapshot() {
	const targets: Record<string, any> = {};

	// Minimal representative endpoints for shape drift detection
	const endpoints = {
		'functions:list-jobs': `${config.supabaseUrl}/functions/v1/list-jobs?limit=1`,
		'functions:function-info': `${config.supabaseUrl}/functions/v1/function-info`,
	};

	for (const [key, url] of Object.entries(endpoints)) {
		try {
			const res = await fetchJson<any>(url, { method: 'GET', headers: { 'X-Agent-Token': config.agentToken } });
			targets[key] = { status: res.status, json: res.json ?? null };
		} catch (e: any) {
			targets[key] = { error: String(e?.message || e) };
		}
	}

	return { ok: true, timestamp: new Date().toISOString(), targets };
}


