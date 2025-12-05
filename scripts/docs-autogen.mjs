import fs from 'node:fs';
import path from 'node:path';

// Minimal placeholder: enumerate MCP routes from lms-mcp/src/index.ts (static) and emit a stub JSON docs file.
const indexFile = path.resolve('lms-mcp', 'src', 'index.ts');
const outDir = path.resolve('contracts', 'docs');
fs.mkdirSync(outDir, { recursive: true });

const text = fs.readFileSync(indexFile, 'utf-8');
const routeRegex = /"lms\.[^"]+"/g;
const routes = Array.from(new Set(text.match(routeRegex) || [])).map((s) => s.replace(/"/g, ''));

const docs = {
  generatedAt: new Date().toISOString(),
  methods: routes.sort(),
  note: 'This is a lightweight index of MCP methods. For full schemas, integrate Zod-to-OpenAPI in a follow-up.',
};

fs.writeFileSync(path.join(outDir, 'mcp-methods.json'), JSON.stringify(docs, null, 2));
console.log('Docs generated at contracts/docs/mcp-methods.json');


