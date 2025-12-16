import { config } from '../config.js';
import { fetchJson } from '../http.js';

async function tryReadEnvFromFile(filePath: string, key: string): Promise<string | ''> {
	try {
		const fs = await import('node:fs/promises');
		const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
		if (!content) return '';
		const line = content.split(/\r?\n/).find(l => l.trim().startsWith(`${key}=`)) || '';
		if (!line) return '';
		const v = line.split('=', 2)?.[1] || '';
		return v.replace(/^['"]|['"]$/g, '').trim();
	} catch {
		return '';
	}
}

export async function envAudit() {
	const missing: string[] = [];
	const inconsistent: string[] = [];
	const invalid: string[] = [];

	// Supabase URL consistency
	const mcpSupabase = config.supabaseUrl || '';
	const ghSupabase = process.env.GH_SUPABASE_URL || process.env.SUPABASE_URL_GH || '';
	if (!mcpSupabase) missing.push('MCP:SUPABASE_URL');
	if (mcpSupabase && ghSupabase && mcpSupabase !== ghSupabase) inconsistent.push('SUPABASE_URL (MCP vs GitHub)');

	// Agent token presence and comparisons
	const mcpAgent = config.agentToken || '';
	const ghAgent = process.env.GH_AGENT_TOKEN || process.env.AGENT_TOKEN_GH || '';
	const localAgent =
		(await tryReadEnvFromFile('lms-mcp/.env.local', 'AGENT_TOKEN')) ||
		(await tryReadEnvFromFile('.env.local', 'AGENT_TOKEN')) ||
		'';
	if (!mcpAgent) missing.push('MCP:AGENT_TOKEN');
	if (ghAgent && mcpAgent && ghAgent !== mcpAgent) inconsistent.push('AGENT_TOKEN (MCP vs GitHub)');
	if (localAgent && mcpAgent && localAgent !== mcpAgent) inconsistent.push('AGENT_TOKEN (MCP vs Local .env)');

	// LLM configuration sanity (MCP-side)
	const provider = (process.env.LLM_PROVIDER || '').toLowerCase();
	const openaiKey = process.env.OPENAI_API_KEY || '';
	const openaiModel = process.env.OPENAI_MODEL || '';
	if (!provider && !openaiKey) {
		// Warn but do not fail: can rely on test/mock providers
		invalid.push('LLM provider unspecified; defaulting behavior may apply');
	}
	if (provider === 'openai') {
		if (!openaiKey) missing.push('OPENAI_API_KEY');
		if (!openaiModel) missing.push('OPENAI_MODEL');
	}

	// Storage configuration (optional hints)
	const bucket = process.env.COURSES_BUCKET || 'courses';
	if (!bucket) missing.push('COURSES_BUCKET');

	// PAT presence for diagnostics (optional)
	if (!process.env.SUPABASE_ACCESS_TOKEN) {
		invalid.push('SUPABASE_ACCESS_TOKEN not present; CLI diagnostics may be limited');
	}

	// Probes
	const probes: Record<string, any> = {};
	// Format registry probe
	{
		const r = await fetchJson(`${mcpSupabase}/functions/v1/get-format-registry`, {
			method: 'GET',
			headers: { 'X-Agent-Token': mcpAgent },
			timeoutMs: 8000,
		});
		probes.formatRegistryOk = r.ok;
	}
	// Token acceptance probe (list-jobs)
	{
		const r = await fetchJson(`${mcpSupabase}/functions/v1/list-jobs?limit=1`, {
			method: 'GET',
			headers: { 'X-Agent-Token': mcpAgent },
			timeoutMs: 8000,
		});
		probes.listJobsStatus = r.status;
	}

	const ok = missing.length === 0 && inconsistent.length === 0;

	return {
		ok,
		missing,
		inconsistent,
		invalid,
		probes,
		env: {
			MCP: {
				SUPABASE_URL: !!mcpSupabase,
				AGENT_TOKEN: !!mcpAgent,
				LLM_PROVIDER: provider || '(unset)',
				OPENAI_MODEL: openaiModel || '(unset)',
			},
			GitHub: {
				SUPABASE_URL: !!ghSupabase,
				AGENT_TOKEN: !!ghAgent,
			},
			Local: {
				AGENT_TOKEN: !!localAgent,
			}
		}
	};
}


