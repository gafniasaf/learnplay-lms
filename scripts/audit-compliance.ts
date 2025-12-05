import fs from 'fs';
import path from 'path';

const TARGET_DIR = process.argv[2] || 'src';

interface Violation {
  file: string;
  line: number;
  rule: string;
  match: string;
}

const RULES = [
  {
    id: 'no-direct-supabase-ui',
    pattern: /supabase\.from|supabase\.auth/g,
    message: 'UI should not access Supabase directly. Use hooks or MCP.',
    exclude: ['src/integrations/supabase/client.ts', 'src/hooks/', 'src/pages/Auth.tsx', 'src/App.tsx', 'src/lib/supabase.ts'] // Whitelist Auth pages and libs
  },
  {
    id: 'no-legacy-terms',
    pattern: /\b(Course|Lesson|Module)\b/g,
    message: 'Legacy LMS terminology detected in generic context.',
    exclude: ['scripts/', 'tests/', 'src/types/', 'src/lib/contracts.ts'] // Scripts/Types often handle legacy
  },
  {
    id: 'no-direct-edge-calls',
    pattern: /fetch\s*\(\s*['"`].*\/functions\/v1\//g,
    message: 'Do not call Edge Functions directly. Use lms.invoke() via MCP.',
    exclude: ['lms-mcp/', 'scripts/', 'src/lib/mcp-proxy.ts']
  },
  {
    id: 'manifest-alignment',
    pattern: /<Button|<Input/g,
    message: 'Warning: Hardcoded UI element detected. Ensure Manifest alignment.',
    severity: 'warning' // Soft rule
  }
];

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  
  const files = fs.readdirSync(dirPath);

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

function auditFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

  RULES.forEach(rule => {
    // Check exclusions
    if (rule.exclude?.some(ex => relativePath.includes(ex))) return;

    lines.forEach((line, idx) => {
      if (rule.pattern.test(line)) {
        violations.push({
          file: relativePath,
          line: idx + 1,
          rule: rule.id,
          match: line.trim().substring(0, 50) + '...'
        });
      }
    });
  });

  return violations;
}

const files = getAllFiles(TARGET_DIR);
let totalViolations = 0;

console.log(`🔍 Auditing ${files.length} files in ${TARGET_DIR}...`);

files.forEach(file => {
  const violations = auditFile(file);
  if (violations.length > 0) {
    violations.forEach(v => {
      const icon = v.rule === 'manifest-alignment' ? '⚠️' : '❌';
      // Filter out warnings from failure count if we want strict mode
      console.log(`${icon} [${v.rule}] ${v.file}:${v.line}`);
      console.log(`   ${v.match}`);
    });
    // Only fail on errors, not warnings
    const errors = violations.filter(v => !RULES.find(r => r.id === v.rule)?.severity);
    totalViolations += errors.length;
  }
});

if (totalViolations > 0) {
  console.log(`\n🛑 Found ${totalViolations} strict violations.`);
  process.exit(1);
} else {
  console.log('\n✅ Agent Compliance Check Passed.');
}

