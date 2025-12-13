import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

type Status = "same" | "different" | "missing_in_current" | "missing_in_legacy";

type ParityEntry = {
  category: string;
  relPath: string;
  legacy?: { exists: boolean; sha256?: string; bytes?: number };
  current?: { exists: boolean; sha256?: string; bytes?: number };
  status: Status;
};

type ManifestSummary = {
  brandingName?: string;
  dataModelRootEntities?: string[];
  dataModelChildEntities?: string[];
  agentJobs?: string[];
  edgeFunctions?: string[];
};

type ManifestParity = {
  legacy?: ManifestSummary;
  current?: ManifestSummary;
  dataModelRootEntities: { status: Status; missingInCurrent: string[]; missingInLegacy: string[] };
  dataModelChildEntities: { status: Status; missingInCurrent: string[]; missingInLegacy: string[] };
  agentJobs: { status: Status; missingInCurrent: string[]; missingInLegacy: string[] };
  edgeFunctions: { status: Status; missingInCurrent: string[]; missingInLegacy: string[] };
};

type ParityReport = {
  generatedAt: string;
  legacyRoot: string;
  currentRoot: string;
  categories: Record<
    string,
    {
      totals: Record<Status, number>;
      entries: ParityEntry[];
    }
  >;
  manifest?: ManifestParity;
  routes?: {
    legacy: string[];
    current: string[];
    diff: { status: Status; missingInCurrent: string[]; missingInLegacy: string[] };
  };
  edgeFunctionDirs?: {
    legacy: string[];
    current: string[];
    diff: { status: Status; missingInCurrent: string[]; missingInLegacy: string[] };
  };
  smells?: {
    hardcodedIds: Array<{ file: string; line: number; text: string }>;
    missingRouteNavigations: Array<{ file: string; line: number; target: string; text: string }>;
  };
};

const DEFAULT_LEGACY_ROOT = "dawn-react-starter";

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "reports",
  ".vite",
  ".next",
  ".turbo",
  ".cache",
  "playwright-report",
]);

const CATEGORY_SPECS: Array<{
  category: string;
  legacyBase: string;
  currentBase: string;
  includeExt: Set<string>;
  excludeRelPathPrefixes?: string[];
}> = [
  {
    category: "pages",
    legacyBase: "src/pages",
    currentBase: "src/pages",
    includeExt: new Set([".ts", ".tsx"]),
  },
  {
    category: "components",
    legacyBase: "src/components",
    currentBase: "src/components",
    includeExt: new Set([".ts", ".tsx"]),
  },
  {
    category: "hooks",
    legacyBase: "src/hooks",
    currentBase: "src/hooks",
    includeExt: new Set([".ts", ".tsx"]),
  },
  {
    category: "lib_api",
    legacyBase: "src/lib/api",
    currentBase: "src/lib/api",
    includeExt: new Set([".ts", ".tsx"]),
  },
  {
    category: "supabase_edge_functions",
    legacyBase: "supabase/functions",
    currentBase: "supabase/functions",
    includeExt: new Set([".ts", ".md", ".json", ".jsonc"]),
    excludeRelPathPrefixes: ["_shared/__tests__", "_shared/tests"],
  },
  {
    category: "tests",
    legacyBase: "tests",
    currentBase: "tests",
    includeExt: new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]),
  },
  {
    category: "scripts",
    legacyBase: "scripts",
    currentBase: "scripts",
    includeExt: new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]),
  },
  {
    category: "config",
    legacyBase: "src/config",
    currentBase: "src/config",
    includeExt: new Set([".ts", ".tsx", ".js"]),
  },
];

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

async function fileStatSafe(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function readFileSafe(filePath: string) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function readTextSafe(filePath: string) {
  const buf = await readFileSafe(filePath);
  if (!buf) return null;
  return buf.toString("utf8");
}

async function walkFiles(root: string, includeExt: Set<string>, excludeRelPathPrefixes: string[] = []) {
  const out = new Map<string, string>(); // rel -> abs
  const stack: string[] = [root];

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;

    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const abs = path.join(current, ent.name);
      const rel = path.relative(root, abs).replaceAll("\\", "/");

      if (excludeRelPathPrefixes.some((p) => rel.startsWith(p))) continue;

      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name)) continue;
        stack.push(abs);
        continue;
      }

      const ext = path.extname(ent.name);
      if (!includeExt.has(ext)) continue;

      out.set(rel, abs);
    }
  }

  return out;
}

async function listSubdirsSafe(dirPath: string) {
  try {
    const ents = await fs.readdir(dirPath, { withFileTypes: true });
    return ents
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => !IGNORE_DIRS.has(name))
      .sort();
  } catch {
    return [];
  }
}

function computeStatus(legacyExists: boolean, currentExists: boolean, sameHash: boolean): Status {
  if (legacyExists && currentExists) return sameHash ? "same" : "different";
  if (legacyExists && !currentExists) return "missing_in_current";
  if (!legacyExists && currentExists) return "missing_in_legacy";
  // should not happen when we build union sets, but keep a sane fallback
  return "different";
}

function initTotals(): Record<Status, number> {
  return { same: 0, different: 0, missing_in_current: 0, missing_in_legacy: 0 };
}

function sortEntries(a: ParityEntry, b: ParityEntry) {
  if (a.status !== b.status) return a.status.localeCompare(b.status);
  return a.relPath.localeCompare(b.relPath);
}

async function summarizeManifest(manifestPath: string): Promise<ManifestSummary | undefined> {
  const buf = await readFileSafe(manifestPath);
  if (!buf) return undefined;

  const raw = buf.toString("utf8");
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const rootEntities = (json?.data_model?.root_entities ?? []).map((e: any) => String(e?.name)).filter(Boolean);
  const childEntities = (json?.data_model?.child_entities ?? []).map((e: any) => String(e?.name)).filter(Boolean);
  const agentJobs = (json?.agent_jobs ?? []).map((j: any) => String(j?.id)).filter(Boolean);
  const edgeFunctions = (json?.edge_functions ?? []).map((f: any) => String(f?.id)).filter(Boolean);

  return {
    brandingName: typeof json?.branding?.name === "string" ? json.branding.name : undefined,
    dataModelRootEntities: rootEntities,
    dataModelChildEntities: childEntities,
    agentJobs,
    edgeFunctions,
  };
}

function diffLists(legacy: string[] = [], current: string[] = []) {
  const legacySet = new Set(legacy);
  const currentSet = new Set(current);

  const missingInCurrent = legacy.filter((x) => !currentSet.has(x)).sort();
  const missingInLegacy = current.filter((x) => !legacySet.has(x)).sort();
  const status: Status =
    missingInCurrent.length === 0 && missingInLegacy.length === 0 ? "same" : "different";

  return { status, missingInCurrent, missingInLegacy };
}

function uniqueSorted(arr: string[]) {
  return Array.from(new Set(arr)).sort();
}

function extractAllMatches(text: string, re: RegExp) {
  const out: string[] = [];
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const rg = new RegExp(re.source, flags);
  for (const m of text.matchAll(rg)) {
    if (m[1]) out.push(String(m[1]));
  }
  return out;
}

async function extractRoutePaths(rootDir: string) {
  const candidates = [
    path.join(rootDir, "src/config/nav.ts"),
    path.join(rootDir, "src/App.tsx"),
    path.join(rootDir, "src/routes.generated.tsx"),
  ];

  const paths: string[] = [];
  for (const filePath of candidates) {
    const text = await readTextSafe(filePath);
    if (!text) continue;

    // nav-style: { path: "/teacher/..." }
    paths.push(...extractAllMatches(text, /path\s*:\s*["']([^"']+)["']/g));

    // react-router style: <Route path="/foo" ... />
    paths.push(...extractAllMatches(text, /<Route[^>]*\bpath\s*=\s*["']([^"']+)["']/g));
  }

  // normalize: keep only "/"-prefixed static-ish routes; keep wildcards as-is
  return uniqueSorted(
    paths
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => p.startsWith("/")),
  );
}

function findLinesMatching(text: string, test: (line: string) => boolean) {
  const out: Array<{ line: number; text: string }> = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] ?? "";
    if (test(lineText)) out.push({ line: i + 1, text: lineText });
  }
  return out;
}

function shouldTreatAsRealRoute(route: string) {
  if (!route.startsWith("/")) return false;
  if (route.includes(":")) return true; // dynamic params are valid routes
  return true;
}

function escapeRegexLiteral(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRouteMatchers(routes: string[]) {
  const staticRoutes = new Set(routes.filter((r) => !r.includes(":")));
  const dynamicRegexes = routes
    .filter((r) => r.includes(":"))
    .map((r) => {
      // Convert "/a/:id/b" -> /^\/a\/[^/]+\/b$/ with safe escaping
      const parts = r.split("/").map((p) => (p.startsWith(":") ? "[^/]+" : escapeRegexLiteral(p)));
      return new RegExp(`^${parts.join("/")}$`);
    });

  return {
    matches: (target: string) => {
      if (staticRoutes.has(target)) return true;
      return dynamicRegexes.some((re) => re.test(target));
    },
  };
}

function statusBadge(status: Status) {
  switch (status) {
    case "same":
      return "✅";
    case "different":
      return "🟡";
    case "missing_in_current":
      return "❌ (missing in current)";
    case "missing_in_legacy":
      return "➕ (new in current)";
  }
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function renderMarkdown(report: ParityReport) {
  const lines: string[] = [];
  lines.push(`# Systemwide Parity Matrix (legacy → current)`);
  lines.push("");
  lines.push(`- Generated: **${report.generatedAt}**`);
  lines.push(`- Legacy root: \`${report.legacyRoot}\``);
  lines.push(`- Current root: \`${report.currentRoot}\``);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");

  for (const [category, data] of Object.entries(report.categories)) {
    const t = data.totals;
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    lines.push(
      `- **${category}**: ${fmtInt(total)} total — ✅ ${fmtInt(t.same)}, 🟡 ${fmtInt(
        t.different,
      )}, ❌ ${fmtInt(t.missing_in_current)}, ➕ ${fmtInt(t.missing_in_legacy)}`,
    );
  }

  if (report.routes) {
    const r = report.routes;
    lines.push("");
    lines.push(`## Route parity (nav/router extracted)`);
    lines.push("");
    lines.push(
      `- **routes**: ${statusBadge(r.diff.status)} (legacy: ${r.legacy.length}, current: ${r.current.length}, missing in current: ${r.diff.missingInCurrent.length}, new in current: ${r.diff.missingInLegacy.length})`,
    );
    if (r.diff.missingInCurrent.length) {
      lines.push("");
      lines.push(`### Routes missing in current`);
      lines.push("");
      for (const p of r.diff.missingInCurrent) lines.push(`- \`${p}\``);
    }
    if (r.diff.missingInLegacy.length) {
      lines.push("");
      lines.push(`### New routes in current`);
      lines.push("");
      for (const p of r.diff.missingInLegacy) lines.push(`- \`${p}\``);
    }
  }

  if (report.edgeFunctionDirs) {
    const e = report.edgeFunctionDirs;
    lines.push("");
    lines.push(`## Edge function parity (directory-level)`);
    lines.push("");
    lines.push(
      `- **supabase/functions/**: ${statusBadge(e.diff.status)} (legacy: ${e.legacy.length}, current: ${e.current.length}, missing in current: ${e.diff.missingInCurrent.length}, new in current: ${e.diff.missingInLegacy.length})`,
    );
    if (e.diff.missingInCurrent.length) {
      lines.push("");
      lines.push(`### Edge functions missing in current (legacy had these)`);
      lines.push("");
      for (const fn of e.diff.missingInCurrent) lines.push(`- \`${fn}\``);
    }
    if (e.diff.missingInLegacy.length) {
      lines.push("");
      lines.push(`### New edge functions in current`);
      lines.push("");
      for (const fn of e.diff.missingInLegacy) lines.push(`- \`${fn}\``);
    }
  }

  if (report.smells) {
    const s = report.smells;
    lines.push("");
    lines.push(`## Current-app smell checks (likely “UI parity but not functional”)`);
    lines.push("");
    lines.push(`- **Hardcoded IDs** (e.g. \`student-2\`, \`teacher-1\`): **${s.hardcodedIds.length}** occurrences`);
    lines.push(`- **Navigation to missing routes**: **${s.missingRouteNavigations.length}** occurrences`);

    const HARD_LIMIT = 60;
    if (s.hardcodedIds.length) {
      lines.push("");
      lines.push(`### Hardcoded IDs (first ${Math.min(HARD_LIMIT, s.hardcodedIds.length)})`);
      lines.push("");
      for (const x of s.hardcodedIds.slice(0, HARD_LIMIT)) {
        lines.push(`- \`${x.file}:${x.line}\` — \`${x.text.trim()}\``);
      }
    }
    if (s.missingRouteNavigations.length) {
      lines.push("");
      lines.push(`### Navigation to missing routes (first ${Math.min(HARD_LIMIT, s.missingRouteNavigations.length)})`);
      lines.push("");
      for (const x of s.missingRouteNavigations.slice(0, HARD_LIMIT)) {
        lines.push(`- \`${x.file}:${x.line}\` → \`${x.target}\` — \`${x.text.trim()}\``);
      }
    }
  }

  if (report.manifest) {
    lines.push("");
    lines.push(`## Manifest parity (\`system-manifest.json\`)`);
    lines.push("");
    const m = report.manifest;
    lines.push(
      `- **data_model.root_entities**: ${statusBadge(m.dataModelRootEntities.status)} (missing in current: ${m.dataModelRootEntities.missingInCurrent.length}, missing in legacy: ${m.dataModelRootEntities.missingInLegacy.length})`,
    );
    lines.push(
      `- **data_model.child_entities**: ${statusBadge(m.dataModelChildEntities.status)} (missing in current: ${m.dataModelChildEntities.missingInCurrent.length}, missing in legacy: ${m.dataModelChildEntities.missingInLegacy.length})`,
    );
    lines.push(
      `- **agent_jobs**: ${statusBadge(m.agentJobs.status)} (missing in current: ${m.agentJobs.missingInCurrent.length}, missing in legacy: ${m.agentJobs.missingInLegacy.length})`,
    );
    lines.push(
      `- **edge_functions**: ${statusBadge(m.edgeFunctions.status)} (missing in current: ${m.edgeFunctions.missingInCurrent.length}, missing in legacy: ${m.edgeFunctions.missingInLegacy.length})`,
    );

    if (m.edgeFunctions.missingInCurrent.length || m.edgeFunctions.missingInLegacy.length) {
      lines.push("");
      if (m.edgeFunctions.missingInCurrent.length) {
        lines.push(`### Missing in current (legacy manifest)`);
        lines.push("");
        for (const id of m.edgeFunctions.missingInCurrent) lines.push(`- \`${id}\``);
      }
      if (m.edgeFunctions.missingInLegacy.length) {
        lines.push("");
        lines.push(`### New in current (current manifest)`);
        lines.push("");
        for (const id of m.edgeFunctions.missingInLegacy) lines.push(`- \`${id}\``);
      }
    }
  }

  for (const [category, data] of Object.entries(report.categories)) {
    lines.push("");
    lines.push(`## ${category}`);
    lines.push("");
    lines.push(`| Status | Path |`);
    lines.push(`|---|---|`);
    for (const e of data.entries) {
      lines.push(`| ${statusBadge(e.status)} | \`${e.relPath}\` |`);
    }
  }

  lines.push("");
  lines.push(
    `---\n\n**Legend**: ✅ identical file content, 🟡 present in both but content differs, ❌ missing in current, ➕ new in current.\n`,
  );
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const legacyRoot = args[0] ?? DEFAULT_LEGACY_ROOT;
  const currentRoot = ".";

  const report: ParityReport = {
    generatedAt: new Date().toISOString(),
    legacyRoot,
    currentRoot,
    categories: {},
  };

  // Capability-level parity: routes (nav/router extracted)
  const legacyRoutes = await extractRoutePaths(legacyRoot);
  const currentRoutes = await extractRoutePaths(currentRoot);
  report.routes = {
    legacy: legacyRoutes,
    current: currentRoutes,
    diff: diffLists(legacyRoutes, currentRoutes),
  };

  // Capability-level parity: edge functions by directory name (what actually exists server-side)
  const legacyFnsBase = path.join(legacyRoot, "supabase/functions");
  const currentFnsBase = path.join(currentRoot, "supabase/functions");
  const legacyFnDirs = (await listSubdirsSafe(legacyFnsBase)).filter((d) => d !== "_shared");
  const currentFnDirs = (await listSubdirsSafe(currentFnsBase)).filter((d) => d !== "_shared");
  report.edgeFunctionDirs = {
    legacy: legacyFnDirs,
    current: currentFnDirs,
    diff: diffLists(legacyFnDirs, currentFnDirs),
  };

  // Capability-level parity: smells in current app that often cause “ghost framework”
  const currentSrcFiles = await walkFiles(path.join(currentRoot, "src"), new Set([".ts", ".tsx"]));
  const routeMatchers = compileRouteMatchers(currentRoutes.filter(shouldTreatAsRealRoute));
  const hardcodedIds: Array<{ file: string; line: number; text: string }> = [];
  const missingRouteNavigations: Array<{ file: string; line: number; target: string; text: string }> = [];

  const hardcodedIdRe = /(student|teacher|parent|class)-\d+/;
  const navToRe = /\b(navigate|to)\s*\(?\s*["'](\/[^"']+)["']/;

  for (const [rel, abs] of currentSrcFiles.entries()) {
    const text = await readTextSafe(abs);
    if (!text) continue;

    // Hardcoded ID scan
    for (const hit of findLinesMatching(text, (line) => hardcodedIdRe.test(line))) {
      hardcodedIds.push({ file: `src/${rel}`, line: hit.line, text: hit.text });
    }

    // Navigation to potentially missing routes: navigate("/x") or to="/x"
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const m = line.match(navToRe);
      if (!m) continue;
      const rawTarget = m[2] ?? "";
      const target = rawTarget.split("?")[0] ?? rawTarget;
      if (!target.startsWith("/")) continue;

      // allow wildcards & dynamic; we only flag obvious static paths missing from extracted route set
      const isDynamic = target.includes(":");
      if (isDynamic) continue;
      if (!routeMatchers.matches(target)) {
        missingRouteNavigations.push({ file: `src/${rel}`, line: i + 1, target, text: line });
      }
    }
  }

  report.smells = {
    hardcodedIds,
    missingRouteNavigations,
  };

  for (const spec of CATEGORY_SPECS) {
    const legacyAbsBase = path.join(legacyRoot, spec.legacyBase);
    const currentAbsBase = path.join(currentRoot, spec.currentBase);

    const legacyFiles = await walkFiles(legacyAbsBase, spec.includeExt, spec.excludeRelPathPrefixes);
    const currentFiles = await walkFiles(currentAbsBase, spec.includeExt, spec.excludeRelPathPrefixes);

    const allRel = new Set<string>([...legacyFiles.keys(), ...currentFiles.keys()]);
    const entries: ParityEntry[] = [];
    const totals = initTotals();

    for (const rel of allRel) {
      const legacyAbs = legacyFiles.get(rel);
      const currentAbs = currentFiles.get(rel);

      const legacyExists = Boolean(legacyAbs);
      const currentExists = Boolean(currentAbs);

      const legacyBuf = legacyAbs ? await readFileSafe(legacyAbs) : null;
      const currentBuf = currentAbs ? await readFileSafe(currentAbs) : null;

      const legacyHash = legacyBuf ? sha256Hex(legacyBuf) : undefined;
      const currentHash = currentBuf ? sha256Hex(currentBuf) : undefined;
      const sameHash = legacyExists && currentExists && legacyHash === currentHash;

      const status = computeStatus(legacyExists, currentExists, sameHash);
      totals[status] += 1;

      entries.push({
        category: spec.category,
        relPath: `${spec.currentBase}/${rel}`,
        legacy: legacyExists
          ? { exists: true, sha256: legacyHash, bytes: legacyBuf ? legacyBuf.byteLength : undefined }
          : { exists: false },
        current: currentExists
          ? { exists: true, sha256: currentHash, bytes: currentBuf ? currentBuf.byteLength : undefined }
          : { exists: false },
        status,
      });
    }

    entries.sort(sortEntries);
    report.categories[spec.category] = { totals, entries };
  }

  // Manifest parity (best-effort): compare legacyRoot/system-manifest.json (if present) vs current system-manifest.json
  const legacyManifest = await summarizeManifest(path.join(legacyRoot, "system-manifest.json"));
  const currentManifest = await summarizeManifest("system-manifest.json");
  if (legacyManifest || currentManifest) {
    report.manifest = {
      legacy: legacyManifest,
      current: currentManifest,
      dataModelRootEntities: diffLists(legacyManifest?.dataModelRootEntities, currentManifest?.dataModelRootEntities),
      dataModelChildEntities: diffLists(legacyManifest?.dataModelChildEntities, currentManifest?.dataModelChildEntities),
      agentJobs: diffLists(legacyManifest?.agentJobs, currentManifest?.agentJobs),
      edgeFunctions: diffLists(legacyManifest?.edgeFunctions, currentManifest?.edgeFunctions),
    };
  }

  const outDir = "docs";
  await fs.mkdir(outDir, { recursive: true });
  const mdPath = path.join(outDir, "PARITY_MATRIX.md");
  const jsonPath = path.join(outDir, "PARITY_MATRIX.json");

  await fs.writeFile(mdPath, renderMarkdown(report), "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log(`Wrote ${mdPath} and ${jsonPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("❌ parity-matrix failed:", err);
  process.exit(1);
});


