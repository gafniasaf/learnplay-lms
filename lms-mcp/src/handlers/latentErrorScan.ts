import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function latentErrorScan() {
	const handlersDir = path.resolve('lms-mcp/src/handlers');
	const indexFile = path.resolve('lms-mcp/src/index.ts');

	const findings: Array<{ type: string; file?: string; detail: string }> = [];

	// Collect handler files
	let handlerFiles: string[] = [];
	try {
		const entries = await fs.readdir(handlersDir);
		handlerFiles = entries.filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
	} catch {
		// ignore
	}

	// Read index routes
	let indexContent = '';
	try {
		indexContent = await fs.readFile(indexFile, 'utf-8');
	} catch {}

	// Check for unregistered handlers
	for (const hf of handlerFiles) {
		const base = path.basename(hf, '.ts');
		if (!indexContent.includes(base)) {
			findings.push({ type: 'unregistered_handler', file: hf, detail: `${base} not referenced in routes` });
		}
	}

	// Check for route methods without handler import (heuristic)
	const routeMatches = Array.from(indexContent.matchAll(/"lms\.[^"]+"/g)).map(m => m[0].replace(/"/g, ''));
	for (const route of routeMatches) {
		// Derive handler hint from route (simple heuristic)
		const base = route.replace(/^lms\./, '');
		const expected = `${base}.ts`;
		if (!handlerFiles.includes(expected) && !indexContent.includes(`${base} as `)) {
			findings.push({ type: 'route_without_matching_file', detail: `${route} -> ${expected}` });
		}
	}

	return { ok: findings.length === 0, findings };
}


