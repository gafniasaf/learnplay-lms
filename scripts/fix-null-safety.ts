/**
 * Auto-fix Null Safety Issues
 * 
 * Automatically fixes common patterns:
 * - .map() on potentially undefined arrays → (?? []).map()
 * - .length on potentially undefined arrays → ?.length ?? 0
 * - .filter() on potentially undefined arrays → (?? []).filter()
 * 
 * Usage: npx tsx scripts/fix-null-safety.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

interface Fix {
  file: string;
  line: number;
  before: string;
  after: string;
}

const fixes: Fix[] = [];

// Patterns to fix - order matters (more specific first)
const fixPatterns: Array<{
  pattern: RegExp;
  replacement: (match: string, ...groups: string[]) => string;
  description: string;
}> = [
  // Fix: data.items.map( → (data.items ?? []).map(
  // But skip if already has ?? or ?.
  {
    pattern: /(\w+)\.(\w+)\.map\(/g,
    replacement: (match, obj, prop) => {
      // Skip if obj is a known safe variable
      if (['Array', 'Object', 'JSON', 'Math', 'console', 'window', 'document'].includes(obj)) {
        return match;
      }
      return `(${obj}.${prop} ?? []).map(`;
    },
    description: 'Safe .map() on nested property',
  },
  // Fix: data.items.filter( → (data.items ?? []).filter(
  {
    pattern: /(\w+)\.(\w+)\.filter\(/g,
    replacement: (match, obj, prop) => {
      if (['Array', 'Object', 'JSON', 'Math', 'console', 'window', 'document'].includes(obj)) {
        return match;
      }
      return `(${obj}.${prop} ?? []).filter(`;
    },
    description: 'Safe .filter() on nested property',
  },
  // Fix: data.items.length → (data.items?.length ?? 0)
  // Skip if already optional chained
  {
    pattern: /(\w+)\.(\w+)\.length(?!\s*[?\.])/g,
    replacement: (match, obj, prop) => {
      if (['Array', 'Object', 'JSON', 'Math', 'console', 'window', 'document'].includes(obj)) {
        return match;
      }
      return `(${obj}.${prop}?.length ?? 0)`;
    },
    description: 'Safe .length on nested property',
  },
];

function shouldSkipLine(line: string): boolean {
  // Skip lines that are already null-safe
  if (line.includes('?? [') || line.includes('|| [')) return true;
  if (line.includes('?.length')) return true;
  
  // Skip comments
  if (line.trim().startsWith('//') || line.trim().startsWith('*')) return true;
  
  // Skip lines with explicit Array.isArray checks nearby
  if (line.includes('Array.isArray')) return true;
  
  // Skip type definitions
  if (line.includes(': Array<') || line.includes(': []')) return true;
  
  return false;
}

function fixFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = relative(process.cwd(), filePath);
  let changeCount = 0;
  
  const newLines = lines.map((line, lineNum) => {
    if (shouldSkipLine(line)) return line;
    
    let newLine = line;
    
    for (const { pattern, replacement, description } of fixPatterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      
      if (pattern.test(newLine)) {
        // Reset again for actual replacement
        pattern.lastIndex = 0;
        const fixed = newLine.replace(pattern, replacement as any);
        
        if (fixed !== newLine) {
          fixes.push({
            file: relPath,
            line: lineNum + 1,
            before: newLine.trim(),
            after: fixed.trim(),
          });
          newLine = fixed;
          changeCount++;
        }
      }
    }
    
    return newLine;
  });
  
  if (changeCount > 0 && !DRY_RUN) {
    writeFileSync(filePath, newLines.join('\n'));
  }
  
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
console.log(`🔧 ${DRY_RUN ? '[DRY RUN] ' : ''}Auto-fixing null safety issues...\n`);

const totalFixes = scanDirectory('src');

if (fixes.length === 0) {
  console.log('✅ No issues to fix!');
  process.exit(0);
}

// Group by file
const byFile = new Map<string, Fix[]>();
fixes.forEach(fix => {
  const existing = byFile.get(fix.file) || [];
  existing.push(fix);
  byFile.set(fix.file, existing);
});

console.log(`📊 ${DRY_RUN ? 'Would fix' : 'Fixed'} ${fixes.length} issues in ${byFile.size} files:\n`);

byFile.forEach((fileFixes, file) => {
  console.log(`\n📄 ${file} (${fileFixes.length} fixes)`);
  fileFixes.slice(0, 3).forEach(fix => {
    console.log(`   Line ${fix.line}:`);
    console.log(`   - ${fix.before.substring(0, 80)}`);
    console.log(`   + ${fix.after.substring(0, 80)}`);
  });
  if (fileFixes.length > 3) {
    console.log(`   ... and ${fileFixes.length - 3} more`);
  }
});

if (DRY_RUN) {
  console.log('\n\n💡 Run without --dry-run to apply fixes');
} else {
  console.log('\n\n✅ Fixes applied! Run typecheck to verify.');
}


