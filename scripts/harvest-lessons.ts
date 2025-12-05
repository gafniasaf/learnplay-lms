
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const LESSONS_PATH = path.join(process.cwd(), 'docs', 'LESSONS_LEARNED.md');
const AUDIT_LOG = path.join(process.cwd(), 'audit-report.json'); // Assuming audit tool outputs json

// 1. Initialize Lessons File
if (!fs.existsSync(LESSONS_PATH)) {
  fs.writeFileSync(LESSONS_PATH, '# 🧠 Factory Lessons Learned\n\nAuto-generated observations from the Ignite Cycle.\n\n');
}

// 2. Run Audit & Capture
console.log('🕵️ Harvesting Lessons from Audit...');
try {
  // Run audit in json mode if supported, or parse stdout
  // For now, we simulated the audit tool. Let's assume we run it and capture output.
  // In a real scenario, audit-compliance.ts should support --json
  const output = execSync('npx tsx scripts/audit-compliance.ts . --json', { encoding: 'utf-8', stdio: 'pipe' });
  
  // Mock parsing logic since audit-compliance might not be json-ready yet
  if (output.includes('Standard Violation')) {
     appendLesson('⚠️ Architecture Violation Detected', 'Agent attempted to bypass MCP or use direct Supabase calls. Strengthen `AI_CONTEXT.md`.');
  }
} catch (e: any) {
  // Audit failed (found violations)
  appendLesson('❌ Audit Failure', `Audit tool reported violations: ${e.message}. Check "Negative Constraints".`);
}

// 3. check E2E Status
// (We would read junit reports here)

// 4. Check for "Hacks"
if (fs.existsSync(path.join(process.cwd(), 'src/hooks/api.ts'))) {
  appendLesson('⚠️ Tech Debt Detected', 'Custom `api.ts` hook found. The Factory should provide a generic `<ManifestEntity>` hook instead of forcing agents to write adapters.');
}

function appendLesson(title: string, body: string) {
  const entry = `\n## ${title} (${new Date().toISOString().split('T')[0]})\n${body}\n`;
  fs.appendFileSync(LESSONS_PATH, entry);
  console.log(`✅ Lesson Recorded: ${title}`);
}

console.log('🌾 Harvest Complete.');


