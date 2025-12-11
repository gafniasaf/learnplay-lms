/**
 * Auto-fix Untracked CTAs
 * 
 * Adds data-cta-id to Button/button elements that don't have one.
 * Generates semantic IDs based on file path, nearby text, and element context.
 * 
 * Per IgniteZero rules: "100% CTA TRACKING MANDATE"
 * 
 * Usage: npx tsx scripts/fix-untracked-ctas.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

interface Fix {
  file: string;
  line: number;
  ctaId: string;
}

const fixes: Fix[] = [];

// Generate a semantic CTA ID
function generateCtaId(filePath: string, line: string, lineNum: number, context: string[]): string {
  const fileName = basename(filePath, '.tsx')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/[^a-z0-9-]/g, '-');
  
  // Try to extract action from onClick handler or nearby text
  let action = 'action';
  
  // Check for common patterns
  if (line.includes('onClick') || context.join('').includes('onClick')) {
    const contextStr = context.join(' ');
    
    // Try to find handler name
    const handlerMatch = contextStr.match(/onClick=\{(?:(?:\(\)\s*=>|async\s*\(\)\s*=>)?\s*)?(\w+)/);
    if (handlerMatch) {
      action = handlerMatch[1]
        .replace(/^handle/, '')
        .replace(/^on/, '')
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')
        .slice(0, 20);
    }
    
    // Try to find button text
    const textMatch = line.match(/>([^<>{]+)</);
    if (textMatch && textMatch[1].trim().length > 0 && textMatch[1].trim().length < 20) {
      action = textMatch[1].trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
  }
  
  // Check for variant hints
  if (line.includes('variant="destructive"') || line.includes('variant="outline"')) {
    // Keep the action as is
  }
  
  // Generate unique suffix based on line number to avoid duplicates
  const suffix = lineNum.toString().slice(-2);
  
  return `cta-${fileName}-${action || 'btn'}-${suffix}`;
}

function fixFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = relative(process.cwd(), filePath);
  let changeCount = 0;
  
  const newLines = lines.map((line, lineNum) => {
    // Skip if already has data-cta-id
    if (line.includes('data-cta-id')) return line;
    
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return line;
    
    // Look for Button or button elements
    const buttonMatch = line.match(/<(Button|button)(\s|>)/);
    if (!buttonMatch) return line;
    
    // Skip if it's disabled, has asChild, or is a form submit
    if (line.includes('disabled') && line.includes('disabled={true}')) return line;
    if (line.includes('asChild')) return line;
    if (line.includes('type="submit"')) return line;
    
    // Get context (2 lines before and after)
    const context = lines.slice(Math.max(0, lineNum - 2), Math.min(lines.length, lineNum + 3));
    
    // Generate CTA ID
    const ctaId = generateCtaId(filePath, line, lineNum + 1, context);
    
    // Determine action type
    let actionType = 'action';
    if (line.includes('to=') || line.includes('href=') || line.includes('Link')) {
      actionType = 'navigate';
    }
    
    // Insert data-cta-id after <Button or <button
    const insertPos = line.indexOf(buttonMatch[0]) + buttonMatch[0].length - 1;
    const newLine = line.slice(0, insertPos) + ` data-cta-id="${ctaId}" data-action="${actionType}"` + line.slice(insertPos);
    
    fixes.push({
      file: relPath,
      line: lineNum + 1,
      ctaId,
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
    } else if (entry.endsWith('.tsx')) {
      if (entry.endsWith('.test.tsx')) continue;
      totalFixes += fixFile(fullPath);
    }
  }
  
  return totalFixes;
}

// Main
console.log(`🔧 ${DRY_RUN ? '[DRY RUN] ' : ''}Auto-adding data-cta-id to untracked buttons...\n`);

const totalFixes = scanDirectory('src');

if (fixes.length === 0) {
  console.log('✅ All buttons already have data-cta-id!');
  process.exit(0);
}

// Group by file
const byFile = new Map<string, Fix[]>();
fixes.forEach(fix => {
  const existing = byFile.get(fix.file) || [];
  existing.push(fix);
  byFile.set(fix.file, existing);
});

console.log(`📊 ${DRY_RUN ? 'Would add' : 'Added'} data-cta-id to ${fixes.length} buttons in ${byFile.size} files:\n`);

// Show first 20 files
let shown = 0;
byFile.forEach((fileFixes, file) => {
  if (shown++ >= 20) return;
  console.log(`📄 ${file} (${fileFixes.length} buttons)`);
  fileFixes.slice(0, 2).forEach(fix => {
    console.log(`   Line ${fix.line}: ${fix.ctaId}`);
  });
  if (fileFixes.length > 2) {
    console.log(`   ... and ${fileFixes.length - 2} more`);
  }
});

if (byFile.size > 20) {
  console.log(`\n... and ${byFile.size - 20} more files`);
}

if (DRY_RUN) {
  console.log('\n\n💡 Run without --dry-run to apply fixes');
} else {
  console.log('\n\n✅ Fixes applied! Run npm run verify:cta to verify.');
}


