/**
 * Audit Error Visibility
 * 
 * Per IgniteZero rules: "No Silent Mocks Policy" - errors must be visible to users.
 * 
 * This script finds:
 * - useQuery/useMutation without error handling
 * - catch blocks that swallow errors
 * - API calls without error surfacing
 * 
 * Usage: npx tsx scripts/audit-error-visibility.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

interface Issue {
  file: string;
  line: number;
  code: string;
  problem: string;
  fix: string;
}

const issues: Issue[] = [];

function scanFile(filePath: string) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = relative(process.cwd(), filePath);
  
  // Track what's destructured from hooks
  const hookDestructures = new Map<number, string[]>();
  
  lines.forEach((line, lineNum) => {
    const trimmed = line.trim();
    
    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    
    // Check 1: useQuery without error destructuring
    if (line.includes('useQuery') && line.includes('=')) {
      const hasError = line.includes('error') || 
                       lines.slice(lineNum, lineNum + 3).some(l => l.includes('error'));
      if (!hasError && !line.includes('// error handled')) {
        issues.push({
          file: relPath,
          line: lineNum + 1,
          code: trimmed.substring(0, 100),
          problem: 'useQuery without error destructuring',
          fix: 'Add { error } to destructuring and show toast on error',
        });
      }
    }
    
    // Check 2: useMutation without error handling
    if (line.includes('useMutation') && line.includes('=')) {
      const nextLines = lines.slice(lineNum, lineNum + 10).join('\n');
      const hasOnError = nextLines.includes('onError') || nextLines.includes('error');
      if (!hasOnError) {
        issues.push({
          file: relPath,
          line: lineNum + 1,
          code: trimmed.substring(0, 100),
          problem: 'useMutation without onError callback',
          fix: 'Add onError: (error) => toast.error(error.message)',
        });
      }
    }
    
    // Check 3: catch block that swallows error
    if (trimmed.includes('catch') && trimmed.includes('{')) {
      const catchBody = lines.slice(lineNum, lineNum + 5).join('\n');
      const hasErrorHandling = catchBody.includes('toast') || 
                               catchBody.includes('console.error') ||
                               catchBody.includes('throw') ||
                               catchBody.includes('setError') ||
                               catchBody.includes('Sentry');
      if (!hasErrorHandling && !catchBody.includes('// intentionally swallowed')) {
        issues.push({
          file: relPath,
          line: lineNum + 1,
          code: trimmed.substring(0, 100),
          problem: 'catch block may swallow error silently',
          fix: 'Add toast.error() or console.error() in catch block',
        });
      }
    }
    
    // Check 4: .catch(() => {}) or .catch(() => false)
    if (line.includes('.catch(') && (line.includes('=> {}') || line.includes('=> false') || line.includes('=> null'))) {
      if (!line.includes('// intentionally')) {
        issues.push({
          file: relPath,
          line: lineNum + 1,
          code: trimmed.substring(0, 100),
          problem: 'Silent .catch() swallows error',
          fix: 'Log or display the error instead of swallowing',
        });
      }
    }
    
    // Check 5: Hook returns error but it's not used
    // Look for patterns like: const { data } = useSomeHook() where hook returns error
    if (line.includes('const {') && line.includes('} =') && line.includes('use')) {
      // Check if this is a hook that returns error
      const hookMatch = line.match(/use\w+/);
      if (hookMatch) {
        const hookName = hookMatch[0];
        // Known hooks that return error
        const hooksWithError = ['useQuery', 'useMutation', 'useMCP', 'useJobContext', 'useJobsList', 'useAuth'];
        const isErrorHook = hooksWithError.some(h => hookName.includes(h.replace('use', '')));
        
        if (isErrorHook && !line.includes('error')) {
          // Check next few lines for separate error handling
          const nextLines = lines.slice(lineNum, lineNum + 5).join('\n');
          if (!nextLines.includes('error')) {
            issues.push({
              file: relPath,
              line: lineNum + 1,
              code: trimmed.substring(0, 100),
              problem: `${hookName} returns error but it's not destructured`,
              fix: `Add 'error' to destructuring: const { data, error } = ${hookName}(...)`,
            });
          }
        }
      }
    }
  });
}

function scanDirectory(dir: string) {
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.git', 'test-results', '__tests__', '__mocks__'].includes(entry)) continue;
      scanDirectory(fullPath);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx') || entry.endsWith('.d.ts')) continue;
      scanFile(fullPath);
    }
  }
}

// Scan source directories
console.log('🔍 Auditing error visibility...\n');
console.log('Per IgniteZero rules: "No Silent Mocks Policy" - errors must be visible to users.\n');

scanDirectory('src/pages');
scanDirectory('src/components');
scanDirectory('src/hooks');

if (issues.length === 0) {
  console.log('✅ No error visibility issues found!');
  process.exit(0);
}

// Group by file
const byFile = new Map<string, Issue[]>();
issues.forEach(issue => {
  const existing = byFile.get(issue.file) || [];
  existing.push(issue);
  byFile.set(issue.file, existing);
});

// Group by problem type
const byProblem = new Map<string, number>();
issues.forEach(issue => {
  byProblem.set(issue.problem, (byProblem.get(issue.problem) || 0) + 1);
});

console.log(`❌ Found ${issues.length} error visibility issues:\n`);

console.log('📊 By Problem Type:');
byProblem.forEach((count, problem) => {
  console.log(`   ${count}x ${problem}`);
});

console.log('\n📄 By File:');
byFile.forEach((fileIssues, file) => {
  console.log(`\n${file} (${fileIssues.length} issues)`);
  fileIssues.forEach(issue => {
    console.log(`   Line ${issue.line}: ${issue.problem}`);
    console.log(`   Code: ${issue.code}`);
    console.log(`   Fix:  ${issue.fix}`);
  });
});

console.log(`\n\n📊 Summary: ${issues.length} issues in ${byFile.size} files`);

// Exit with error if issues found (for CI)
if (process.env.CI || process.env.STRICT) {
  console.log('\n❌ STRICT mode: Failing build due to error visibility issues');
  process.exit(1);
}


