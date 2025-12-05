import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const projectArg = process.argv[2];
if (!projectArg) {
  console.error('❌ Usage: npm run factory:review <projects/<slug>>');
  process.exit(1);
}

const resolvedProject = path.resolve(projectArg);
if (!fs.existsSync(resolvedProject)) {
  console.error(`❌ Project directory not found: ${resolvedProject}`);
  process.exit(1);
}

const slug = path.basename(resolvedProject);
const planPath = path.join(resolvedProject, 'PLAN.md');
const manifestPath = path.join(resolvedProject, 'system-manifest.json');

if (!fs.existsSync(planPath) || !fs.existsSync(manifestPath)) {
  console.error('❌ Project directory must contain PLAN.md and system-manifest.json');
  process.exit(1);
}

let guardStatus: 'pass' | 'fail' | 'unknown' = 'unknown';
try {
  execSync(`npx tsx scripts/factory-guard.ts "${resolvedProject}"`, { stdio: 'inherit' });
  guardStatus = 'pass';
} catch (error) {
  guardStatus = 'fail';
}

const specPath = path.join(process.cwd(), 'tests', 'e2e', `${slug}.spec.ts`);
const specExists = fs.existsSync(specPath);

const planContents = fs.readFileSync(planPath, 'utf-8');
const todoMatches = planContents.match(/TODO/gi) || [];

const metadata = {
  project: slug,
  reviewed_at: new Date().toISOString(),
  guard_status: guardStatus,
  spec_exists: specExists,
  todo_count: todoMatches.length,
};

const reviewsDir = path.join(process.cwd(), 'cursor-playground', 'reviews');
fs.mkdirSync(reviewsDir, { recursive: true });
const reportName = `${slug}-${metadata.reviewed_at.replace(/[:]/g, '').replace(/\..+$/, '')}.md`;
const reportPath = path.join(reviewsDir, reportName);

const lines = [
  `# Factory Review — ${slug}`,
  '',
  `- Reviewed: ${metadata.reviewed_at}`,
  `- Guard Status: ${metadata.guard_status}`,
  `- E2E Spec Present: ${metadata.spec_exists ? 'yes' : 'no'}`,
  `- TODOs in PLAN.md: ${metadata.todo_count}`,
  '',
  '## Next Actions',
  specExists
    ? '- Update the generated spec with real assertions as you build.'
    : '- Run `npm run factory:auto-spec <workspace>` to generate a spec before building.',
  metadata.todo_count > 0 ? '- Resolve TODOs in PLAN.md before import.' : '- PLAN.md is clean.',
  '',
  '## Notes',
  '- Add any manual observations here.',
];

fs.writeFileSync(reportPath, lines.join('\n'));
console.log(`📝 Review report written to ${reportPath}`);
