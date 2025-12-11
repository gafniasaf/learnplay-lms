import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function coverageAudit() {
	const indexFile = path.resolve('lms-mcp/src/index.ts');
	const testsDir = path.resolve('lms-mcp/tests');
	const edgeDir = path.resolve('supabase/functions');

	let indexContent = '';
	try { indexContent = await fs.readFile(indexFile, 'utf-8'); } catch {}

	const routeMatches = Array.from(indexContent.matchAll(/"lms\.[^"]+"/g)).map(m => m[0].replace(/"/g, ''));

	// List test files
	let testFiles: string[] = [];
	try {
		const walk = async (dir: string): Promise<string[]> => {
			const out: string[] = [];
			const entries = await fs.readdir(dir, { withFileTypes: true });
			for (const e of entries) {
				const p = path.join(dir, e.name);
				if (e.isDirectory()) out.push(...(await walk(p)));
				else if (p.endsWith('.test.ts') || p.endsWith('.test.tsx')) out.push(p);
			}
			return out;
		};
		testFiles = await walk(testsDir);
	} catch {}

	// Edge functions: list folders with index.ts
	const edgeFuncs: string[] = [];
	try {
		const dirs = await fs.readdir(edgeDir, { withFileTypes: true });
		for (const d of dirs) {
			if (!d.isDirectory() || d.name.startsWith('_')) continue;
			const idx = path.join(edgeDir, d.name, 'index.ts');
			try {
				await fs.stat(idx);
				edgeFuncs.push(d.name);
			} catch {}
		}
	} catch {}

	// MCP coverage
	const missingTests: string[] = [];
	for (const route of routeMatches) {
		const hint = route.replace(/^lms\./, '');
		const hasTest = testFiles.some(tf => tf.toLowerCase().includes(hint.toLowerCase()));
		if (!hasTest) missingTests.push(route);
	}

	// Edge smoke
	const missingSmoke: string[] = [];
	for (const f of edgeFuncs) {
		const hasSmoke = testFiles.some(tf => tf.toLowerCase().includes(f.toLowerCase()));
		if (!hasSmoke) missingSmoke.push(f);
	}

	// UI E2E mapping - placeholder heuristic
	const missingE2E: string[] = []; // Would map MCP methods to E2E tests; left empty here

	const suggestions: string[] = [];
	if (missingTests.length > 0) suggestions.push('Add unit tests for MCP routes listed in missingTests');
	if (missingSmoke.length > 0) suggestions.push('Add smoke tests for the listed Edge functions');

	return {
		ok: missingTests.length === 0 && missingSmoke.length === 0,
		mcp: { missingTests },
		edge: { missingSmoke },
		ui: { missingE2E },
		suggestions,
	};
}


