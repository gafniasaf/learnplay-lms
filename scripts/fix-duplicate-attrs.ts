/**
 * Fix Duplicate Attributes
 * 
 * Removes duplicate data-cta-id and data-action attributes from JSX elements.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

let totalFixes = 0;

function fixFile(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const relPath = relative(process.cwd(), filePath);
  
  // Find and remove duplicate data-cta-id attributes (keep first)
  let fixed = content;
  let changeCount = 0;
  
  // Pattern to match elements with duplicate data-cta-id
  // This regex finds data-cta-id="..." followed by more attributes and another data-cta-id="..."
  const ctaIdPattern = /(data-cta-id="[^"]*"[^>]*?)data-cta-id="[^"]*"/g;
  const actionPattern = /(data-action="[^"]*"[^>]*?)data-action="[^"]*"/g;
  
  // Keep replacing until no more duplicates
  let prevFixed = '';
  while (prevFixed !== fixed) {
    prevFixed = fixed;
    fixed = fixed.replace(ctaIdPattern, '$1');
    fixed = fixed.replace(actionPattern, '$1');
  }
  
  if (fixed !== content) {
    writeFileSync(filePath, fixed);
    console.log(`✓ Fixed: ${relPath}`);
    return 1;
  }
  
  return 0;
}

function scanDirectory(dir: string) {
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.git', '__tests__', '__mocks__', 'test-results'].includes(entry)) continue;
      scanDirectory(fullPath);
    } else if (entry.endsWith('.tsx')) {
      totalFixes += fixFile(fullPath);
    }
  }
}

console.log('🔧 Fixing duplicate attributes...\n');
scanDirectory('src');
console.log(`\n✅ Fixed ${totalFixes} files`);


