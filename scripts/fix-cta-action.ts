/**
 * Auto-fix CTA data-action attributes
 * 
 * Per IgniteZero rules: Every CTA must have data-action="action" or "navigate"
 * 
 * Heuristics:
 * - Link, a elements → data-action="navigate"
 * - Button, button with onClick → data-action="action"
 * 
 * Usage: npx tsx scripts/fix-cta-action.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

interface Fix {
  file: string;
  line: number;
  ctaId: string;
  action: string;
}

const fixes: Fix[] = [];

function fixFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = relative(process.cwd(), filePath);
  let changeCount = 0;
  
  const newLines = lines.map((line, lineNum) => {
    // Look for data-cta-id without data-action
    const ctaMatch = line.match(/data-cta-id=["']([^"']+)["']/);
    if (!ctaMatch) return line;
    
    // Skip if already has data-action
    if (line.includes('data-action=')) return line;
    
    const ctaId = ctaMatch[1];
    
    // Determine action type based on element and context
    let actionType: 'action' | 'navigate' = 'action';
    
    // Navigation patterns
    if (line.includes('<Link') || line.includes('<a ') || line.includes('<a>')) {
      actionType = 'navigate';
    }
    if (ctaId.startsWith('nav-')) {
      actionType = 'navigate';
    }
    if (line.includes('to=') || line.includes('href=')) {
      actionType = 'navigate';
    }
    
    // Insert data-action after data-cta-id
    const insertPos = line.indexOf(ctaMatch[0]) + ctaMatch[0].length;
    const newLine = line.slice(0, insertPos) + ` data-action="${actionType}"` + line.slice(insertPos);
    
    fixes.push({
      file: relPath,
      line: lineNum + 1,
      ctaId,
      action: actionType,
    });
    
    changeCount++;
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
console.log(`🔧 ${DRY_RUN ? '[DRY RUN] ' : ''}Auto-fixing CTA data-action attributes...\n`);

const totalFixes = scanDirectory('src');

if (fixes.length === 0) {
  console.log('✅ All CTAs have data-action attributes!');
  process.exit(0);
}

// Group by file
const byFile = new Map<string, Fix[]>();
fixes.forEach(fix => {
  const existing = byFile.get(fix.file) || [];
  existing.push(fix);
  byFile.set(fix.file, existing);
});

// Count by action type
const actionCount = fixes.filter(f => f.action === 'action').length;
const navigateCount = fixes.filter(f => f.action === 'navigate').length;

console.log(`📊 ${DRY_RUN ? 'Would fix' : 'Fixed'} ${fixes.length} CTAs in ${byFile.size} files:`);
console.log(`   ${actionCount} → data-action="action"`);
console.log(`   ${navigateCount} → data-action="navigate"\n`);

byFile.forEach((fileFixes, file) => {
  console.log(`📄 ${file} (${fileFixes.length} CTAs)`);
  fileFixes.slice(0, 3).forEach(fix => {
    console.log(`   Line ${fix.line}: ${fix.ctaId} → ${fix.action}`);
  });
  if (fileFixes.length > 3) {
    console.log(`   ... and ${fileFixes.length - 3} more`);
  }
});

if (DRY_RUN) {
  console.log('\n\n💡 Run without --dry-run to apply fixes');
} else {
  console.log('\n\n✅ Fixes applied! Run npm run verify:cta to verify.');
}


