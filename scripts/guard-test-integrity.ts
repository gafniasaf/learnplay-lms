#!/usr/bin/env npx tsx
/**
 * Guard against weakening test assertions.
 * Run as pre-commit hook or in CI.
 * 
 * Detects:
 * - Removed expect() calls
 * - Changed toBeVisible → catch/null patterns
 * - Reduced assertion counts
 * - Commented out assertions
 */

import { execSync } from 'child_process';

const FORBIDDEN_PATTERNS = [
  // Catching errors to ignore them in tests
  /\.catch\(\s*\(\)\s*=>\s*null\s*\)/,
  // Removing visibility assertions
  /[-]\s*await expect.*toBeVisible/,
  // Commenting out assertions
  /[-]\s*expect\(/,
  // Replacing strict assertions with loose ones
  /toBeVisible.*→.*not\.toThrow/i,
  /toEqual.*→.*toBeTruthy/i,
];

const WARNING_PATTERNS = [
  // Timeout reductions (might be legitimate)
  /timeout:\s*\d+.*→.*timeout:\s*\d+/,
];

function main() {
  console.log('🛡️  Test Integrity Guard\n');
  
  // Get staged test file changes
  let diff: string;
  try {
    diff = execSync('git diff --cached --unified=0 -- "tests/**/*.ts" "tests/**/*.spec.ts" "**/*.test.ts"', {
      encoding: 'utf-8',
    });
  } catch {
    console.log('✅ No test files staged');
    process.exit(0);
  }

  if (!diff.trim()) {
    console.log('✅ No test files staged');
    process.exit(0);
  }

  const violations: string[] = [];
  const warnings: string[] = [];
  const lines = diff.split('\n');
  let currentFile = '';

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      currentFile = line.split(' b/')[1] || '';
    }

    // Only check removed lines (lines starting with -)
    if (line.startsWith('-') && !line.startsWith('---')) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push(`${currentFile}: ${line.trim()}`);
        }
      }
    }

    // Check for suspicious patterns in added lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (/\.catch\(\s*\(\)\s*=>\s*null\s*\)/.test(line)) {
        violations.push(`${currentFile}: Swallowing errors in test: ${line.trim()}`);
      }
    }

    for (const pattern of WARNING_PATTERNS) {
      if (pattern.test(line)) {
        warnings.push(`${currentFile}: ${line.trim()}`);
      }
    }
  }

  // Count assertion changes
  const removedAssertions = (diff.match(/^-.*expect\(/gm) || []).length;
  const addedAssertions = (diff.match(/^\+.*expect\(/gm) || []).length;

  if (removedAssertions > addedAssertions) {
    violations.push(
      `Net assertion reduction: ${removedAssertions} removed, ${addedAssertions} added. ` +
      `Tests should not lose coverage.`
    );
  }

  // Report
  if (warnings.length > 0) {
    console.log('⚠️  Warnings (review manually):');
    warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }

  if (violations.length > 0) {
    console.log('❌ BLOCKED: Test integrity violations detected:\n');
    violations.forEach(v => console.log(`   ${v}`));
    console.log('\n📖 Rule: Never weaken tests to make them pass. Fix the code instead.');
    console.log('   See: docs/AI_CONTEXT.md → TEST INTEGRITY RULES\n');
    process.exit(1);
  }

  console.log('✅ Test integrity check passed');
  process.exit(0);
}

main();

