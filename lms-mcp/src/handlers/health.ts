import { config } from '../config.js';
import { fetchJson } from '../http.js';

// Attempt to read a value from a dotenv-style file
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

type ProtectedFn = { slug: string; method: 'GET' | 'POST'; path: string; body?: any };
const PROTECTED_FNS: ProtectedFn[] = [
	// GET should be 200 with valid token
	{ slug: 'list-jobs', method: 'GET', path: 'list-jobs?limit=1' },
	// POSTs should be 400 with valid token (invalid body), 401 with invalid token
	{ slug: 'apply-job-result', method: 'POST', path: 'apply-job-result', body: { jobId: '', courseId: '' } },
	{ slug: 'generate-variants-audit', method: 'POST', path: 'generate-variants-audit', body: {} },
	{ slug: 'generate-variants-missing', method: 'POST', path: 'generate-variants-missing', body: {} },
	{ slug: 'item-rewrite-quality', method: 'POST', path: 'item-rewrite-quality', body: {} },
	{ slug: 'studytext-rewrite', method: 'POST', path: 'studytext-rewrite', body: {} },
];

async function callProtected(fn: ProtectedFn, token: string) {
	const url = `${config.supabaseUrl}/functions/v1/${fn.path}`;
	const res = await fetchJson(url, {
		method: fn.method,
		headers: { 'X-Agent-Token': token, 'Content-Type': 'application/json' },
		body: fn.method === 'POST' ? (fn.body || {}) : undefined,
		timeoutMs: 8000,
	});
	// Consider accepted if 200/400 (auth passed), unauthorized if 401
	const accepted = res.status === 200 || res.status === 400;
	return { slug: fn.slug, status: res.status, accepted };
}

async function tokenConsistencyCheck() {
	const mcpToken = config.agentToken || '';
	// Optionally provided via CI to compare with MCP token
	const ghToken = process.env.GH_AGENT_TOKEN || process.env.AGENT_TOKEN_GH || '';
	// Attempt to read local env tokens
	const localEnvToken =
		(await tryReadEnvFromFile('lms-mcp/.env.local', 'AGENT_TOKEN')) ||
		(await tryReadEnvFromFile('.env.local', 'AGENT_TOKEN')) ||
		'';

	// Probe which token Edge accepts for a simple GET
	const listJobsWithMcp = await callProtected(PROTECTED_FNS[0], mcpToken);
	const listJobsWithGh = ghToken ? await callProtected(PROTECTED_FNS[0], ghToken) : null;
	const listJobsWithLocal = localEnvToken ? await callProtected(PROTECTED_FNS[0], localEnvToken) : null;

	const protectedResults = await Promise.all(PROTECTED_FNS.map((fn) => callProtected(fn, mcpToken)));
	const anyUnauthorized = protectedResults.some(r => r.status === 401);

	// Diagnose mismatches
	const mismatches: string[] = [];

	// MCP vs Local .env
	if (localEnvToken && mcpToken && localEnvToken !== mcpToken) {
		mismatches.push('mcp_vs_local_env');
	}
	// MCP vs GitHub
	if (ghToken && mcpToken && ghToken !== mcpToken) {
		mismatches.push('mcp_vs_github_secret');
	}

	// Which token appears to be accepted by Edge
	const acceptedByEdge: string[] = [];
	if (listJobsWithMcp.accepted) acceptedByEdge.push('mcp');
	if (listJobsWithGh?.accepted) acceptedByEdge.push('github');
	if (listJobsWithLocal?.accepted) acceptedByEdge.push('local_env');

	const ok = !anyUnauthorized;

	// Mask tokens for display (last 4)
	const mask = (v: string) => (v ? `***${v.slice(-4)}` : '');

	const suggestions: string[] = [];
	if (!ok) {
		if (!listJobsWithMcp.accepted) {
			suggestions.push('Edge rejected MCP token. Verify MCP AGENT_TOKEN matches Supabase Edge env.');
		}
		if (ghToken && !listJobsWithGh?.accepted) {
			suggestions.push('Edge rejected GitHub secret token. Verify GitHub secret AGENT_TOKEN matches Supabase Edge env.');
		}
		if (localEnvToken && !listJobsWithLocal?.accepted) {
			suggestions.push('Edge rejected local .env token. Update local lms-mcp/.env.local to match Supabase Edge env.');
		}
	}

	return {
		ok,
		acceptedByEdge,
		protected: protectedResults,
		tokens: {
			mcp: { present: !!mcpToken, endsWith: mask(mcpToken), accepted: listJobsWithMcp.accepted },
			github: { present: !!ghToken, endsWith: mask(ghToken), accepted: listJobsWithGh?.accepted ?? false },
			localEnv: { present: !!localEnvToken, endsWith: mask(localEnvToken), accepted: listJobsWithLocal?.accepted ?? false },
		},
		mismatches,
		suggestions,
	};
}

const METHOD_LIST = [
  "lms.getCourse",
  "lms.saveCourse",
  "lms.listJobs",
  "lms.getJob",
  "lms.enqueueJob",
  "lms.enqueueAndTrack",
  "lms.listMediaJobs",
  "lms.getMediaJob",
  "lms.enqueueMedia",
  "lms.enqueueMediaAndTrack",
  "lms.applyJobResult",
  "lms.health",
  // Extended content + pipelines
  "lms.localize",
  "lms.generateImage",
  "lms.repairCourse",
  "lms.variantsAudit",
  "lms.variantsGenerateMissing",
  "lms.validateCourseStructure",
  "lms.autoFix",
  "lms.listCourses",
  "lms.getFormatRegistry",
  "lms.enqueueCourseMediaMissing",
  // Item + StudyText jobs
  "lms.itemGenerateMore",
  "lms.itemRewriteQuality",
  "lms.itemClusterAudit",
  "lms.studytextRewrite",
  "lms.studytextExpand",
  "lms.studytextVisualize",
  // Templates + Metrics + Org settings
  "lms.listTemplates",
  "lms.getTemplate",
  "lms.metrics.summary",
  "lms.metrics.recent",
  "lms.metrics.reset",
  "lms.getOrgSettings",
  "lms.saveOrgSettings",
  "lms.publishCourse",
	// Diagnostics
	"lms.checkStorageIntegrity",
	"lms.bootFailureAudit",
	"lms.envAudit",
	"lms.deadJobAudit",
	"lms.fallbackAudit",
	"lms.roundtripSeeds",
	"lms.roundtripTest",
	"lms.formatRegistryAudit",
	"lms.latentErrorScan",
	"lms.coverageAudit",
	// UI wiring
	"lms.uiAudit.run",
	"lms.uiAudit.summary",
];

export async function health() {
  // probe an Edge Function (list-jobs) to verify token and connectivity
  const url = `${config.supabaseUrl}/functions/v1/list-jobs?limit=1`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: { 'X-Agent-Token': config.agentToken },
    timeoutMs: 8000,
    retries: 1,
  });
  const edge = { status: res.status, ok: res.ok };

	// Extended token consistency check
	const tokenCheck = await tokenConsistencyCheck();

	const payload = {
		ok: !!res.ok && !!tokenCheck.ok,
		methods: METHOD_LIST,
		edge,
		flags: { optionB: config.optionBEnabled },
		tokenCheck,
	};
  return payload;
}


