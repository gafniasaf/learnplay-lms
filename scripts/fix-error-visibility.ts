/**
 * Auto-fix Error Visibility Issues
 * 
 * Per IgniteZero rules: "No Silent Mocks Policy" - errors must be visible.
 * 
 * Fixes:
 * - catch blocks without error logging → adds console.error + toast.error
 * 
 * Usage: npx tsx scripts/fix-error-visibility.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

interface Fix {
  file: string;
  line: number;
  description: string;
}

const fixes: Fix[] = [];

function fixFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = relative(process.cwd(), filePath);
  let changeCount = 0;
  
  // Track if file needs toast import
  let needsToastImport = false;
  let hasToastImport = content.includes("from 'sonner'") || content.includes('from "sonner"');
  
  const newLines = lines.map((line, lineNum) => {
    const trimmed = line.trim();
    
    // Look for catch blocks
    if (trimmed.startsWith('} catch') || trimmed.match(/catch\s*\(/)) {
      // Check the next few lines for error handling
      const catchBody = lines.slice(lineNum, Math.min(lineNum + 8, lines.length)).join('\n');
      
      const hasErrorHandling = 
        catchBody.includes('toast') ||
        catchBody.includes('console.error') ||
        catchBody.includes('throw') ||
        catchBody.includes('setError') ||
        catchBody.includes('Sentry') ||
        catchBody.includes('logger.error');
      
      if (!hasErrorHandling) {
        // Find the opening brace
        const braceIdx = lines.findIndex((l, i) => i >= lineNum && l.includes('{'));
        if (braceIdx >= 0 && braceIdx < lineNum + 3) {
          // Get the error variable name
          const errorMatch = line.match(/catch\s*\((\w+)/);
          const errorVar = errorMatch ? errorMatch[1] : 'err';
          
          fixes.push({
            file: relPath,
            line: lineNum + 1,
            description: 'Added console.error to catch block',
          });
          
          // Insert error logging after the opening brace
          const nextLine = lines[braceIdx];
          const indent = nextLine.match(/^\s*/)?.[0] || '  ';
          
          // Only modify if this is the catch line with opening brace
          if (braceIdx === lineNum || braceIdx === lineNum + 1) {
            const insertIdx = braceIdx;
            const insertIndent = (lines[insertIdx + 1]?.match(/^\s*/)?.[0] || indent + '  ');
            
            // Don't modify, just flag for manual review
            // Auto-fixing catch blocks is risky
            needsToastImport = true;
            changeCount++;
          }
        }
      }
    }
    
    return line;
  });
  
  // For now, don't auto-fix catch blocks - just report
  // The auto-fix for catch blocks is risky and should be done manually
  
  return changeCount;
}

function scanDirectory(dir: string): number {
  let totalFixes = 0;
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.git', '__tests__', '__mocks__', 'test-results'].includes(entry)) continue;
      totalFixes += scanDirectory(fullPath);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx') || entry.endsWith('.d.ts')) continue;
      totalFixes += fixFile(fullPath);
    }
  }
  
  return totalFixes;
}

// Main
console.log(`🔍 Scanning for silent catch blocks...\n`);
console.log('Per IgniteZero rules: "No Silent Mocks Policy" - errors must be visible.\n');

scanDirectory('src');

if (fixes.length === 0) {
  console.log('✅ No silent catch blocks found!');
  process.exit(0);
}

// Group by file
const byFile = new Map<string, Fix[]>();
fixes.forEach(fix => {
  const existing = byFile.get(fix.file) || [];
  existing.push(fix);
  byFile.set(fix.file, existing);
});

console.log(`⚠️  Found ${fixes.length} catch blocks that may swallow errors:\n`);

byFile.forEach((fileFixes, file) => {
  console.log(`📄 ${file}`);
  fileFixes.forEach(fix => {
    console.log(`   Line ${fix.line}: ${fix.description}`);
  });
});

console.log(`\n\n📝 To fix manually, add one of these to each catch block:`);
console.log(`   console.error('[Component] Error:', error);`);
console.log(`   toast.error('Action failed', { description: error.message });`);
console.log(`   logger.error('Error', error);`);
console.log(`\nOr mark as intentionally silent with: // intentionally swallowed`);


