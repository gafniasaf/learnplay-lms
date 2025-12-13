import fs from "node:fs";

const OUT_JSON = "docs/page-endpoint-audit.json";

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function listEdgeFunctionDirs() {
  const entries = fs.readdirSync("supabase/functions", { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
}

function parseLazyImports(tsx) {
  // const X = React.lazy(() => import("./pages/Foo"));
  // const X = lazy(() => import("./pages/Foo"));
  const map = new Map();
  const re = /^const\s+(\w+)\s*=\s*(?:React\.)?lazy\(\(\)\s*=>\s*import\("([^"]+)"\)\)\s*;?/;
  for (const line of tsx.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

function parseRouteElements(tsx) {
  const out = [];
  // <Route ... path="/x" element={<Comp />} />
  for (const m of tsx.matchAll(/path=\"([^\"]+)\"\s+element=\{<([A-Za-z0-9_]+)\s*\/>\}/g)) {
    out.push({ route: m[1], element: m[2] });
  }
  return out;
}

function resolveImportToFile(importPath) {
  let p = importPath;
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("@/")) p = "src/" + p.slice(2);
  if (p.startsWith("pages/")) p = "src/" + p;
  if (!p.startsWith("src/")) p = "src/" + p;

  const candidates = [p + ".tsx", p + ".ts", p + "/index.tsx", p + "/index.ts"];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function extractBackendCallsFromCode(code) {
  const calls = [];
  const add = (kind, name) => calls.push({ kind, name });

  for (const m of code.matchAll(/callEdgeFunctionGet<[^>]*>\(\s*["']([^"']+)["']/g)) add("callEdgeFunctionGet", m[1]);
  for (const m of code.matchAll(/callEdgeFunction<[^>]*>\(\s*["']([^"']+)["']/g)) add("callEdgeFunction", m[1]);
  for (const m of code.matchAll(/supabase\.functions\.invoke\(\s*["']([^"']+)["']/g)) add("supabase.invoke", m[1]);

  // useMCP generic methods
  for (const m of code.matchAll(/\bmcp\.callGet\s*<[^>]*>\(\s*["']([^"']+)["']/g)) add("mcp.callGet", m[1]);
  for (const m of code.matchAll(/\bmcp\.call\s*<[^>]*>\(\s*["']([^"']+)["']/g)) add("mcp.call", m[1]);
  for (const m of code.matchAll(/\bmcp\.call\(\s*["']([^"']+)["']/g)) add("mcp.call", m[1]);

  // direct useMCP methods: mcp.getCourseCatalog(), mcp.listAssignmentsForStudent(), etc.
  for (const m of code.matchAll(/\bmcp(?:Ref\.current)?\.(\w+)\s*\(/g)) add("mcp.method", m[1]);

  return calls;
}

function camelToKebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function mcpMethodToEdgeFunctionName(method) {
  // Mirrors mapping logic in src/hooks/useMCP.ts call()/callGet().
  if (method.startsWith("lms.")) {
    const stripped = method.slice(4);
    const map = {
      enqueueJob: "enqueue-job",
      saveRecord: "save-record",
      getRecord: "get-record",
      listRecords: "list-records",
      listJobs: "list-jobs",
      getJob: "get-job",
      listCourseJobs: "list-course-jobs",
      getCourseJob: "get-course-job",
      requeueJob: "requeue-job",
      deleteJob: "delete-job",
      getJobMetrics: "get-job-metrics",
    };
    if (map[stripped]) return map[stripped];
    return camelToKebab(stripped);
  }
  return method;
}

function buildMcpMethodMapFromUseMcpSource() {
  const src = read("src/hooks/useMCP.ts");
  const map = new Map(); // methodName -> edgeFn

  // Find blocks like: const listAssignmentsForStudent = async (...) => { ... callEdgeFunctionGet('list-assignments-student') ... }
  // We'll do a simple scan: for each "const NAME = async", take next ~1200 chars and look for first callEdgeFunction/Get literal.
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*async\s*\([^)]*\)\s*=>\s*\{/g)) {
    const name = m[1];
    const idx = m.index ?? -1;
    if (idx < 0) continue;
    const window = src.slice(idx, idx + 2000);
    const get = window.match(/callEdgeFunctionGet<[^>]*>\(\s*["']([^"']+)["']/);
    const post = window.match(/callEdgeFunction<[^>]*>\(\s*["']([^"']+)["']/);
    const invoke = window.match(/supabase\.functions\.invoke\(\s*["']([^"']+)["']/);
    const fn = (get?.[1] ?? post?.[1] ?? invoke?.[1]) || null;
    if (fn) map.set(name, fn);
  }
  return map;
}

function main() {
  const edgeDirs = listEdgeFunctionDirs();
  const mcpMethodMap = buildMcpMethodMapFromUseMcpSource();

  const routesGen = read("src/routes.generated.tsx");
  const app = read("src/App.tsx");

  const lazyMap = new Map([...parseLazyImports(routesGen), ...parseLazyImports(app)]);
  const routes = [...parseRouteElements(routesGen), ...parseRouteElements(app)];

  const report = [];

  for (const r of routes) {
    const importPath = lazyMap.get(r.element);
    if (!importPath) continue;
    const file = resolveImportToFile(importPath);
    if (!file) continue;

    const code = read(file);
    const extracted = extractBackendCallsFromCode(code);

    const edgeCalls = new Set();
    const unknownMcpMethods = new Set();

    for (const c of extracted) {
      if (c.kind === "mcp.call" || c.kind === "mcp.callGet") {
        // Non-lms methods in useMCP.call() map via camelCase->kebab-case
        if (c.name.startsWith("lms.")) edgeCalls.add(mcpMethodToEdgeFunctionName(c.name));
        else edgeCalls.add(camelToKebab(c.name));
      } else if (c.kind === "mcp.method") {
        const fn = mcpMethodMap.get(c.name);
        if (fn) edgeCalls.add(fn);
        else unknownMcpMethods.add(c.name);
      } else {
        edgeCalls.add(c.name);
      }
    }

    const calls = [...edgeCalls].sort();
    const missing = calls.filter((fn) => !edgeDirs.has(fn)).sort();

    report.push({
      route: r.route,
      file,
      edgeCalls: calls,
      guaranteedMissingEdgeFunctions: missing,
      unknownMcpMethods: [...unknownMcpMethods].sort(),
    });
  }

  report.sort((a, b) => a.route.localeCompare(b.route));

  // Write UTF-8 JSON (avoid PowerShell redirection encoding issues)
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const bad = report.filter((x) => x.guaranteedMissingEdgeFunctions.length > 0);
  console.log(`[page-endpoint-audit] Wrote ${OUT_JSON}`);
  console.log(`[page-endpoint-audit] routesScanned=${report.length} routesWithGuaranteedMissingEdgeFns=${bad.length}`);
  for (const x of bad) {
    console.log(`\\n${x.route}\\n  file: ${x.file}\\n  missing: ${x.guaranteedMissingEdgeFunctions.join(", ")}`);
  }
}

main();


