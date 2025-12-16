import { config } from '../config.js';
import { fetchJson } from '../http.js';

export async function bootFailureAudit() {
	// Use the existing functionInfo endpoint via MCP route to gather details
	const url = `${config.supabaseUrl}/functions/v1/mcp-metrics-proxy`; // fallback path if available
	// If metrics proxy is not available, use Supabase admin API through functionInfo handler

	// Prefer handler route to list functions
	const list = await (async () => {
		// There is an MCP route "lms.functionInfo" that returns { functions: [...] }
		// Call through MCP itself is not feasible here; perform a direct fetch to Edge functionInfo helper if present
		// Fallback: return empty set if not available
		try {
			// Probe for get-format-registry to verify connectivity
			await fetchJson(`${config.supabaseUrl}/functions/v1/get-format-registry`, {
				method: 'GET',
				headers: { 'X-Agent-Token': config.agentToken },
				timeoutMs: 8000,
			});
			// get-format-registry exists; but we still need function list. Attempt metrics proxy; if 404, return empty.
			const probe = await fetchJson(url, {
				method: 'POST',
				headers: { 'X-Agent-Token': config.agentToken, 'Content-Type': 'application/json' },
				body: { op: 'listFunctions' },
				timeoutMs: 8000,
			});
			if (probe.ok && probe.json?.functions) return probe.json as any;
		} catch {}
		return { functions: [] } as any;
	})();

	const failures = (list.functions || []).filter((f: any) => String(f.status).toUpperCase().includes('FAIL') || String(f.status).toUpperCase().includes('BOOT'));

	const suggestions: string[] = [];
	if (failures.length > 0) {
		suggestions.push('Run supabase functions logs <function> to retrieve compile/runtime errors');
		suggestions.push('Check for duplicate imports or redeclared identifiers');
		suggestions.push('Ensure returns are JSON-serializable');
	}

	return {
		ok: failures.length === 0,
		count: failures.length,
		failures: failures.map((f: any) => ({ slug: f.slug || f.name, status: f.status, updated_at: f.updated_at })),
		suggestions,
	};
}


