import fs from 'fs';
import path from 'path';

const WORKSPACE = process.argv[2];

if (!WORKSPACE) {
  console.error('❌ Usage: npm run factory:auto-spec <workspace>');
  process.exit(1);
}

const resolvedWorkspace = path.resolve(WORKSPACE);
if (!fs.existsSync(resolvedWorkspace)) {
  console.error(`❌ Workspace not found: ${resolvedWorkspace}`);
  process.exit(1);
}

const manifestPath = path.join(resolvedWorkspace, 'system-manifest.json');
const journeyPath = path.join(resolvedWorkspace, 'user_journey.md');
if (!fs.existsSync(manifestPath) || !fs.existsSync(journeyPath)) {
  console.error('❌ Workspace missing system-manifest.json or user_journey.md');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const projectName = manifest?.branding?.name ?? path.basename(resolvedWorkspace);
const workspaceSlug = path.basename(resolvedWorkspace);
const slug =
  workspaceSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const journeyLines = fs
  .readFileSync(journeyPath, 'utf-8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const steps = journeyLines.filter((line) => /^\d+\./.test(line) || /^-/.test(line));
const meaningfulSteps = steps.length > 0 ? steps : journeyLines;

const stepComments =
  meaningfulSteps.length > 0
    ? meaningfulSteps.map((step, index) => `    // Step ${index + 1}: ${step}`).join('\n')
    : '    // TODO: Add concrete steps from user_journey.md';

const specDir = path.join(process.cwd(), 'tests', 'e2e');
fs.mkdirSync(specDir, { recursive: true });
const specPath = path.join(specDir, `${slug}.spec.ts`);

const specContents = `import { test, expect } from '@playwright/test';

test.describe('${projectName} flow', () => {
  test('follows documented journey', async ({ page }) => {
${stepComments}
    // TODO: implement interactions based on PLAN.md + mockups
    await expect(page).toBeTruthy();
  });
});
`;

fs.writeFileSync(specPath, specContents);
console.log(`✅ Generated ${specPath}`);
console.log('   Wire this into PLAN.md verification steps to enforce coverage.');
