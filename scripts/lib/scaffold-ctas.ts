import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust paths since this is now in scripts/lib/
const COVERAGE_PATH = path.join(__dirname, "../../docs/mockups/coverage.json");
const OUTPUT_PATH = path.join(__dirname, "../../src/lib/cta-ids.ts");

type Coverage = {
  routes: Array<{
    name: string;
    requiredCTAs?: Array<{ id: string; action?: string; target?: string }>;
  }>;
};

function collectAllCtaIds(coverage: Coverage): Set<string> {
  const ctaIds = new Set<string>();
  
  for (const route of coverage.routes) {
    for (const cta of route.requiredCTAs || []) {
      ctaIds.add(cta.id);
    }
  }
  
  return ctaIds;
}

function generateCtaIdsFile(ctaIds: Set<string>): string {
  const sortedIds = Array.from(ctaIds).sort();
  
  const enumEntries = sortedIds.map(id => {
    const key = id.toUpperCase().replace(/-/g, "_");
    return `  ${key} = "${id}",`;
  });
  
  const typeUnion = sortedIds.map(id => `"${id}"`).join(" | ");
  
  return `// ------------------------------------------------------------------
// ⚠️ AUTO-GENERATED FROM docs/mockups/coverage.json
// ------------------------------------------------------------------
// Run: npx ignite scaffold
// (or via npx tsx scripts/ignite.ts scaffold)

export enum CtaId {
${enumEntries.join("\n")}
}

export type CtaIdType = ${typeUnion};

export const CTA_IDS = {
${sortedIds.map(id => {
  const key = id.toUpperCase().replace(/-/g, "_");
  return `  ${key}: "${id}"`;
}).join(",\n")}
} as const;

// Type guard
export function isValidCtaId(id: string): id is CtaIdType {
  return Object.values(CtaId).includes(id as CtaId);
}
`;
}

export async function scaffoldCtas() {
  console.log("🔧 Generating CTA ID types from coverage.json...");
  
  if (!fs.existsSync(COVERAGE_PATH)) {
    throw new Error(`Coverage file not found: ${COVERAGE_PATH}`);
  }
  
  const coverageJson = fs.readFileSync(COVERAGE_PATH, "utf-8");
  const coverage = JSON.parse(coverageJson) as Coverage;
  
  const ctaIds = collectAllCtaIds(coverage);
  console.log(`   Found ${ctaIds.size} unique CTA IDs`);
  
  const output = generateCtaIdsFile(ctaIds);
  
  // Ensure directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_PATH, output, "utf-8");
  console.log(`✅ Generated: ${OUTPUT_PATH}`);
}

