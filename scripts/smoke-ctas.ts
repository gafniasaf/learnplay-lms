import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";

type Coverage = {
  routes: Array<{
    name: string;
    states: Array<{ file: string }>;
    requiredCTAs?: Array<{ id: string; action?: string }>;
  }>;
};

const COVERAGE_PATH = path.join("docs", "mockups", "coverage.json");
const MOCK_ROOT = path.join("docs", "mockups");

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function loadCoverage(): Coverage {
  const json = fs.readFileSync(COVERAGE_PATH, "utf-8");
  return JSON.parse(json) as Coverage;
}

function collectCtas(filePath: string) {
  const absolute = path.join(MOCK_ROOT, filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Mock file missing: ${absolute}`);
  }
  const html = fs.readFileSync(absolute, "utf-8");
  const root = parse(html);
  const nodes = root.querySelectorAll("[data-cta-id]");

  const ctas = new Map<
    string,
    {
      file: string;
      action?: string | null;
    }
  >();

  nodes.forEach((node) => {
    const id = node.getAttribute("data-cta-id");
    if (!id) return;
    ctas.set(id, {
      file: filePath,
      action: node.getAttribute("data-action"),
    });
  });

  return ctas;
}

async function main() {
  console.log("🧭 Running CTA smoke over mock HTML…");
  const coverage = loadCoverage();
  let totalRoutes = 0;
  let totalCtas = 0;

  for (const route of coverage.routes) {
    totalRoutes += 1;
    const routeMap = new Map<string, { file: string; action?: string | null }>();
    for (const state of route.states) {
      const stateCtas = collectCtas(state.file);
      stateCtas.forEach((meta, id) => {
        if (!routeMap.has(id)) {
          routeMap.set(id, meta);
        }
      });
    }

    const required = route.requiredCTAs ?? [];
    for (const requirement of required) {
      totalCtas += 1;
      const match = routeMap.get(requirement.id);
      invariant(match, `Missing CTA "${requirement.id}" in route ${route.name}`);
      invariant(
        match.action,
        `CTA "${requirement.id}" in ${match.file} is missing data-action (required for mock clicks)`
      );
      if (requirement.action && match.action !== requirement.action) {
        throw new Error(
          `CTA "${requirement.id}" expected action "${requirement.action}" but found "${match.action}" in ${match.file}`
        );
      }
      console.log(
        `   ✅ ${route.name}: ${requirement.id} (${match.action}) ← ${match.file}`
      );
    }
  }

  console.log(
    `🎉 CTA smoke passed – verified ${totalCtas} required CTAs across ${totalRoutes} routes.`
  );
}

main().catch((err) => {
  console.error("💥 CTA smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});


