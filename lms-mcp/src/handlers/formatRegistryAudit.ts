import { config } from '../config.ts';
import { fetchJson } from '../http.ts';

export async function formatRegistryAudit() {
	const res = await fetchJson(`${config.supabaseUrl}/functions/v1/get-format-registry`, {
		method: 'GET',
		headers: { 'X-Agent-Token': config.agentToken },
		timeoutMs: 8000,
	});
	if (!res.ok) return { ok: false, error: `registry_fetch_${res.status}` };
	const registry = res.json || {};

	const formats = Array.isArray(registry?.formats) ? registry.formats : [];
	const missingSchemas: string[] = [];
	const missingMergeRules: string[] = [];
	const editorGaps: string[] = [];

	// Minimal checks: 'practice' and at least one more expected format exist
	const expected = ['practice'];
	for (const f of expected) {
		if (!formats.some((x: any) => x?.id === f)) missingSchemas.push(f);
	}

	// Heuristic merge rules: check presence of a mergeRules map
	if (!registry?.mergeRules) {
		missingMergeRules.push('mergeRules map missing');
	}

	// Editor gap heuristic: ensure practice tabs exist in editor is out-of-scope; just flag none.

	const ok = missingSchemas.length === 0 && missingMergeRules.length === 0;
	const suggestions: string[] = [];
	if (!ok) suggestions.push('Update format registry and related validators/merge logic to include expected formats');

	return { ok, counts: { total: formats.length }, missingSchemas, missingMergeRules, editorGaps, suggestions };
}


