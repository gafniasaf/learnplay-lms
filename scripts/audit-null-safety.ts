/**
 * Audit Null Safety
 * 
 * Finds patterns that can cause "Cannot read properties of undefined" errors:
 * - .map() without optional chaining or nullish coalescing
 * - .length without optional chaining
 * - .filter() without optional chaining
 * - Direct property access on potentially undefined objects
 * 
 * Usage: npx tsx scripts/audit-null-safety.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

interface Issue {
  file: string;
  line: number;
  code: string;
  pattern: string;
  suggestion: string;
}

const issues: Issue[] = [];

// Patterns that are unsafe
const unsafePatterns = [
  {
    // data.items.map() - no null check
    regex: /(\w+)\.(\w+)\.map\(/g,
    name: 'Unsafe .map() on nested property',
    suggestion: '(data?.items ?? []).map(',
    // Skip if preceded by ?? [] or || []
    skipIf: (line: string, match: string) => {
      const idx = line.indexOf(match);
      const before = line.substring(Math.max(0, idx - 10), idx);
      return before.includes('?? [') || before.includes('|| [') || before.includes('?.');
    }
  },
  {
    // data.items.length - no null check  
    regex: /(\w+)\.(\w+)\.length(?!\s*[?\.])/g,
    name: 'Unsafe .length on nested property',
    suggestion: '(data?.items?.length ?? 0)',
    skipIf: (line: string, match: string) => {
      const idx = line.indexOf(match);
      const before = line.substring(Math.max(0, idx - 10), idx);
      return before.includes('?.') || line.includes('?? 0') || line.includes('|| 0');
    }
  },
  {
    // data.items.filter() - no null check
    regex: /(\w+)\.(\w+)\.filter\(/g,
    name: 'Unsafe .filter() on nested property',
    suggestion: '(data?.items ?? []).filter(',
    skipIf: (line: string, match: string) => {
      const idx = line.indexOf(match);
      const before = line.substring(Math.max(0, idx - 10), idx);
      return before.includes('?? [') || before.includes('|| [') || before.includes('?.');
    }
  },
];

// Known safe patterns to skip
const safePatterns = [
  /Object\.keys\(/,
  /Object\.values\(/,
  /Object\.entries\(/,
  /Array\.from\(/,
  /\.then\(/,
  /\.catch\(/,
  /console\./,
  /JSON\./,
  /Math\./,
  /Date\./,
  /window\./,
  /document\./,
  /localStorage\./,
  /sessionStorage\./,
];

function scanFile(filePath: string) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  lines.forEach((line, lineNum) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    
    // Skip known safe patterns
    if (safePatterns.some(p => p.test(line))) return;
    
    unsafePatterns.forEach(pattern => {
      const matches = line.matchAll(pattern.regex);
      for (const match of matches) {
        if (pattern.skipIf && pattern.skipIf(line, match[0])) continue;
        
        // Additional context check - is this from a useState or other safe source?
        const varName = match[1];
        if (['event', 'e', 'err', 'error', 'response', 'result', 'props', 'state'].includes(varName)) {
          continue;
        }
        
        issues.push({
          file: relative(process.cwd(), filePath),
          line: lineNum + 1,
          code: line.trim().substring(0, 100),
          pattern: pattern.name,
          suggestion: pattern.suggestion,
        });
      }
    });
  });
}

function scanDirectory(dir: string) {
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, dist, etc.
      if (['node_modules', 'dist', '.git', 'test-results', 'reports'].includes(entry)) continue;
      scanDirectory(fullPath);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      // Skip test files and type definitions
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx') || entry.endsWith('.d.ts')) continue;
      scanFile(fullPath);
    }
  }
}

// Scan src directory
console.log('🔍 Scanning for null safety issues...\n');
scanDirectory('src/pages');
scanDirectory('src/components');
scanDirectory('src/hooks');

if (issues.length === 0) {
  console.log('✅ No null safety issues found!');
  process.exit(0);
}

// Group by file
const byFile = new Map<string, Issue[]>();
issues.forEach(issue => {
  const existing = byFile.get(issue.file) || [];
  existing.push(issue);
  byFile.set(issue.file, existing);
});

console.log(`❌ Found ${issues.length} potential null safety issues:\n`);

byFile.forEach((fileIssues, file) => {
  console.log(`\n📄 ${file} (${fileIssues.length} issues)`);
  fileIssues.forEach(issue => {
    console.log(`   Line ${issue.line}: ${issue.pattern}`);
    console.log(`   Code: ${issue.code}`);
    console.log(`   Fix:  ${issue.suggestion}`);
  });
});

console.log(`\n\n📊 Summary: ${issues.length} issues in ${byFile.size} files`);
console.log('\nRun with --fix to auto-fix (coming soon)');

// Exit with error if issues found (for CI)
if (process.env.CI || process.env.STRICT) {
  process.exit(1);
}


