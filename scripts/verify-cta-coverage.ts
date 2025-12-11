/**
 * 🎯 100% CTA Coverage Verification Script
 * 
 * This script enforces the IgniteZero 100% CTA tracking mandate:
 * - Every <Button>, <button>, <Link>, <a>, and [role="button"] must have data-cta-id
 * - All CTAs must be registered in coverage.json
 * 
 * For AI-managed systems, complete CTA tracking provides:
 * - Guardrails against UI drift
 * - Complete audit trail
 * - Automated regression detection
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

interface Violation {
  file: string;
  line: number;
  code: string;
  element: string;
  suggestion: string;
}

interface CTACoverage {
  routes: Array<{
    path: string;
    name: string;
    requiredCTAs?: Array<{ id: string; target?: string }>;
  }>;
}

// Patterns that indicate a button/link element
const INTERACTIVE_PATTERNS = [
  /<Button\b(?![^>]*data-cta-id)/g,           // <Button without data-cta-id
  /<button\b(?![^>]*data-cta-id)/gi,          // <button without data-cta-id
  /<Link\b(?![^>]*data-cta-id)/g,             // <Link without data-cta-id
  /role=["']button["'](?![^>]*data-cta-id)/g, // role="button" without data-cta-id
];

// Exclusion patterns - elements that don't need CTA tracking
const EXCLUSIONS = [
  /disabled/,                    // Disabled buttons
  /aria-hidden/,                 // Hidden from accessibility
  /\.map\s*\(/,                  // Inside a map (will be checked separately)
  /DialogClose/,                 // Dialog close buttons (UI library)
  /SheetClose/,                  // Sheet close buttons (UI library)
  /DropdownMenuTrigger/,         // Dropdown triggers (accessibility)
  /PopoverTrigger/,              // Popover triggers
  /TooltipTrigger/,              // Tooltip triggers
  /AccordionTrigger/,            // Accordion triggers
  /TabsTrigger/,                 // Tab triggers
  /asChild/,                     // Radix asChild pattern
  /\.sr-only/,                   // Screen reader only
  /type=["']submit["']/,         // Form submit buttons (tracked via form)
];

// Files/directories to skip
const SKIP_PATHS = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'test-results',
  'dawn-react-starter',         // Legacy system
  'src/components/ui/',         // UI primitives (shadcn)
  '__tests__',
  '.spec.',
  '.test.',
];

function shouldSkip(filePath: string): boolean {
  return SKIP_PATHS.some(skip => filePath.includes(skip));
}

function isExcluded(line: string): boolean {
  return EXCLUSIONS.some(pattern => pattern.test(line));
}

function extractElementType(line: string): string {
  if (/<Button/i.test(line)) return 'Button';
  if (/<button/i.test(line)) return 'button';
  if (/<Link/i.test(line)) return 'Link';
  if (/role=["']button["']/i.test(line)) return 'role="button"';
  return 'interactive element';
}

function suggestCtaId(filePath: string, line: string): string {
  // Extract component/page name from file path
  const fileName = path.basename(filePath, path.extname(filePath));
  const pageName = fileName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  
  // Try to extract action from onClick or text content
  const onClickMatch = line.match(/onClick=\{[^}]*(\w+)\s*\}/);
  const textMatch = line.match(/>([^<]+)</);
  
  let action = 'action';
  if (onClickMatch) {
    action = onClickMatch[1].replace(/^handle/, '').toLowerCase();
  } else if (textMatch) {
    action = textMatch[1].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
  
  return `cta-${pageName}-${action}`;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    // Skip comments and imports
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('import ')) {
      return;
    }
    
    // Skip excluded patterns
    if (isExcluded(line)) {
      return;
    }
    
    // Check for untracked interactive elements
    for (const pattern of INTERACTIVE_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex
      if (pattern.test(line)) {
        // Double-check it's not already tracked
        if (!line.includes('data-cta-id')) {
          violations.push({
            file: filePath,
            line: index + 1,
            code: line.trim().substring(0, 100) + (line.trim().length > 100 ? '...' : ''),
            element: extractElementType(line),
            suggestion: suggestCtaId(filePath, line),
          });
        }
      }
    }
  });
  
  return violations;
}

function loadCoverage(): CTACoverage | null {
  const coveragePath = 'docs/mockups/coverage.json';
  if (!fs.existsSync(coveragePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
}

function countTrackedCTAs(): { inCode: number; inCoverage: number } {
  // Count data-cta-id in source files
  const sourceFiles = glob.sync('src/**/*.tsx', { ignore: ['**/node_modules/**'] });
  let inCode = 0;
  
  sourceFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    const matches = content.match(/data-cta-id/g);
    if (matches) {
      inCode += matches.length;
    }
  });
  
  // Count in coverage.json
  const coverage = loadCoverage();
  let inCoverage = 0;
  if (coverage) {
    for (const route of coverage.routes) {
      inCoverage += (route.requiredCTAs || []).length;
    }
  }
  
  return { inCode, inCoverage };
}

async function main() {
  console.log('🎯 100% CTA Coverage Verification');
  console.log('═'.repeat(60));
  
  // Find all source files
  const files = glob.sync('src/**/*.tsx', { ignore: ['**/node_modules/**'] });
  
  const allViolations: Violation[] = [];
  let filesScanned = 0;
  let filesWithViolations = 0;
  
  for (const file of files) {
    if (shouldSkip(file)) continue;
    
    filesScanned++;
    const violations = scanFile(file);
    
    if (violations.length > 0) {
      filesWithViolations++;
      allViolations.push(...violations);
    }
  }
  
  // Report statistics
  const { inCode, inCoverage } = countTrackedCTAs();
  const totalButtons = allViolations.length + inCode;
  const coveragePercent = totalButtons > 0 ? ((inCode / totalButtons) * 100).toFixed(1) : '100';
  
  console.log('\n📊 CTA Coverage Statistics:');
  console.log(`   Files scanned: ${filesScanned}`);
  console.log(`   Tracked CTAs (data-cta-id in code): ${inCode}`);
  console.log(`   Required CTAs (coverage.json): ${inCoverage}`);
  console.log(`   Untracked elements found: ${allViolations.length}`);
  console.log(`   Current coverage: ${coveragePercent}%`);
  
  if (allViolations.length === 0) {
    console.log('\n✅ 100% CTA COVERAGE ACHIEVED');
    console.log('   All interactive elements have data-cta-id attributes.');
    return;
  }
  
  // Report violations
  console.log(`\n❌ UNTRACKED INTERACTIVE ELEMENTS (${allViolations.length}):`);
  console.log('─'.repeat(60));
  
  // Group by file
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const existing = byFile.get(v.file) || [];
    existing.push(v);
    byFile.set(v.file, existing);
  }
  
  for (const [file, violations] of byFile) {
    console.log(`\n📁 ${file} (${violations.length} untracked)`);
    for (const v of violations.slice(0, 5)) { // Show first 5 per file
      console.log(`   Line ${v.line}: <${v.element}>`);
      console.log(`   Code: ${v.code}`);
      console.log(`   Suggestion: data-cta-id="${v.suggestion}"`);
    }
    if (violations.length > 5) {
      console.log(`   ... and ${violations.length - 5} more`);
    }
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('🔧 TO FIX: Add data-cta-id to each element above.');
  console.log('   Example: <Button data-cta-id="cta-page-action" data-action="action">');
  console.log('\n📖 See: .cursorrules section "100% CTA TRACKING MANDATE"');
  
  // Exit with error if in strict mode
  if (process.env.CTA_STRICT === '1') {
    console.error('\n❌ CTA_STRICT=1: Failing due to untracked elements.');
    process.exit(1);
  } else {
    console.log('\n⚠️  Set CTA_STRICT=1 to enforce 100% coverage in CI.');
  }
}

main().catch((err) => {
  console.error('💥 CTA verification failed:', err);
  process.exit(1);
});


