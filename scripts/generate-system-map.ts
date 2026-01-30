
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

// --- Types ---

interface SystemMap {
  generatedAt: string;
  routes: Array<{
    path: string;
    componentName: string;
    sourceFile: string;
  }>;
  capabilities: Array<{
    id: string;
    type: 'edge-function' | 'mcp-tool' | 'job';
    description?: string;
    inputs?: Record<string, string>;
    outputs?: Record<string, string>;
  }>;
  entities: Array<{
    name: string;
    slug: string;
    fields: string[];
  }>;
}

interface Manifest {
  data_model: {
    root_entities: Array<{ name: string; slug: string; fields: Array<{ name: string }> }>;
    child_entities: Array<{ name: string; slug: string; fields: Array<{ name: string }> }>;
  };
  agent_jobs: Array<{ id: string; prompt_template?: string }>;
  edge_functions: Array<{ id: string; input?: any; output?: any }>;
}

// --- Helpers ---

function findProjectRoot(): string {
  let current = process.cwd();
  while (current !== dirname(current)) {
    if (readdirSync(current).includes('system-manifest.json')) {
      return current;
    }
    current = dirname(current);
  }
  throw new Error('Could not find system-manifest.json');
}

function parseRoutes(rootDir: string): SystemMap['routes'] {
  const appPath = join(rootDir, 'src', 'App.tsx');
  const routesPath = join(rootDir, 'src', 'routes.generated.tsx');
  
  const routes: SystemMap['routes'] = [];
  
  // Helper to extract routes from file content
  const extractFromContent = (content: string) => {
    // Match <Route path="..." element={<Component ... />} />
    // This is a rough regex but sufficient for standard React Router usage
    const routeRegex = /<Route\s+(?:key="[^"]*"\s+)?path="([^"]+)"\s+element=\{<([^/\s>]+)/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      routes.push({
        path: match[1],
        componentName: match[2],
        sourceFile: 'Unknown (inferred from App.tsx/routes.generated.tsx)' 
      });
    }
  };

  try {
    extractFromContent(readFileSync(appPath, 'utf-8'));
  } catch (e) {
    console.warn('Could not read App.tsx', e);
  }

  try {
    extractFromContent(readFileSync(routesPath, 'utf-8'));
  } catch (e) {
    console.warn('Could not read routes.generated.tsx', e);
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

function parseManifest(rootDir: string): { entities: SystemMap['entities']; capabilities: SystemMap['capabilities'] } {
  const manifestPath = join(rootDir, 'system-manifest.json');
  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  const entities = [
    ...manifest.data_model.root_entities,
    ...manifest.data_model.child_entities
  ].map(e => ({
    name: e.name,
    slug: e.slug,
    fields: e.fields.map(f => f.name)
  }));

  const capabilities: SystemMap['capabilities'] = [];

  // Edge Functions from Manifest
  if (manifest.edge_functions) {
    manifest.edge_functions.forEach(ef => {
      capabilities.push({
        id: ef.id,
        type: 'edge-function',
        inputs: ef.input,
        outputs: ef.output
      });
    });
  }

  // Jobs from Manifest
  if (manifest.agent_jobs) {
    manifest.agent_jobs.forEach(job => {
      capabilities.push({
        id: job.id,
        type: 'job',
        description: job.prompt_template
      });
    });
  }

  return { entities, capabilities };
}

function scanEdgeFunctionsDir(rootDir: string): SystemMap['capabilities'] {
  const functionsDir = join(rootDir, 'supabase', 'functions');
  const caps: SystemMap['capabilities'] = [];

  try {
    const dirs = readdirSync(functionsDir).filter(f => {
      try {
        return statSync(join(functionsDir, f)).isDirectory() && !f.startsWith('_');
      } catch {
        return false;
      }
    });

    dirs.forEach(id => {
      caps.push({
        id,
        type: 'edge-function',
        description: 'Discovered in supabase/functions directory'
      });
    });
  } catch (e) {
    console.warn('Could not scan supabase/functions', e);
  }

  return caps;
}

function normalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = normalizeForCompare(obj[key]);
    }
    return out;
  }
  return value;
}

function readExistingMap(outPath: string): SystemMap | null {
  try {
    return JSON.parse(readFileSync(outPath, 'utf-8')) as SystemMap;
  } catch {
    return null;
  }
}

// --- Main ---

function main() {
  console.log('🗺️  Generating System Map...');
  const root = findProjectRoot();
  
  const { entities, capabilities: manifestCaps } = parseManifest(root);
  const fsCaps = scanEdgeFunctionsDir(root);
  const routes = parseRoutes(root);

  // Merge capabilities (prefer manifest definition if available)
  const mergedCapsMap = new Map<string, SystemMap['capabilities'][0]>();
  
  // Add FS caps first
  fsCaps.forEach(c => mergedCapsMap.set(c.id, c));
  
  // Override/Enrich with Manifest caps
  manifestCaps.forEach(c => {
    const existing = mergedCapsMap.get(c.id);
    if (existing) {
      mergedCapsMap.set(c.id, { ...existing, ...c });
    } else {
      mergedCapsMap.set(c.id, c);
    }
  });

  const outPath = join(root, 'system-map.json');

  const nextComparable = {
    routes,
    capabilities: Array.from(mergedCapsMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    entities
  };

  const existing = readExistingMap(outPath);
  if (existing) {
    const existingComparable = {
      routes: existing.routes ?? [],
      capabilities: existing.capabilities ?? [],
      entities: existing.entities ?? []
    };

    const same =
      JSON.stringify(normalizeForCompare(existingComparable)) ===
      JSON.stringify(normalizeForCompare(nextComparable));

    if (same) {
      console.log(`✅ System Map up to date (no changes) at ${outPath}`);
      console.log(`   - ${nextComparable.routes.length} Routes`);
      console.log(`   - ${nextComparable.capabilities.length} Capabilities`);
      console.log(`   - ${nextComparable.entities.length} Entities`);
      return;
    }
  }

  const map: SystemMap = { generatedAt: new Date().toISOString(), ...nextComparable };
  writeFileSync(outPath, JSON.stringify(map, null, 2));
  console.log(`✅ System Map written to ${outPath}`);
  console.log(`   - ${map.routes.length} Routes`);
  console.log(`   - ${map.capabilities.length} Capabilities`);
  console.log(`   - ${map.entities.length} Entities`);
}

main();
