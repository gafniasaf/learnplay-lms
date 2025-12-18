#!/usr/bin/env npx tsx
/**
 * Check that all imported files are tracked in git
 * 
 * This script:
 * 1. Finds all TypeScript/TSX files in src/
 * 2. Extracts import statements
 * 3. Resolves import paths to actual files
 * 4. Checks if those files are tracked in git
 * 5. Fails if any imported files are untracked
 * 
 * Only checks files in src/ directory and skips node_modules/external packages
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve, extname, relative } from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

interface ImportInfo {
  file: string;
  importPath: string;
  resolvedPath: string | null;
  isTracked: boolean;
}

const SRC_DIR = 'src';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const IMPORT_REGEX = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * Resolve import path to actual file
 */
function resolveImportPath(importPath: string, fromFile: string): string | null {
  // Skip node_modules and external packages
  if (!importPath.startsWith('@/') && !importPath.startsWith('./') && !importPath.startsWith('../')) {
    return null; // External package, skip
  }

  const fromDir = dirname(fromFile);
  let resolved: string;

  if (importPath.startsWith('@/')) {
    // Alias import - resolve from src root
    const aliasPath = importPath.replace('@/', '');
    resolved = resolve(SRC_DIR, aliasPath);
  } else {
    // Relative import
    resolved = resolve(fromDir, importPath);
  }

  // Try different extensions
  for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
    const candidate = resolved + ext;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Try directory with index
  if (existsSync(resolved) && !extname(resolved)) {
    for (const ext of ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']) {
      const candidate = resolved + ext;
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Check if file is tracked in git
 */
function isTrackedInGit(filePath: string): boolean {
  try {
    // Get relative path from repo root
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    const relativePath = relative(repoRoot, filePath).replace(/\\/g, '/');
    
    // Check if file is tracked
    const result = execSync(`git ls-files --error-unmatch "${relativePath}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      cwd: repoRoot,
    });
    return result.trim() === relativePath;
  } catch {
    return false;
  }
}

/**
 * Check if file should be ignored (in .gitignore)
 */
function isIgnored(filePath: string): boolean {
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    const relativePath = relative(repoRoot, filePath).replace(/\\/g, '/');
    
    // Check if git would ignore this file
    const result = execSync(`git check-ignore -q "${relativePath}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      cwd: repoRoot,
    });
    return true; // If command succeeds, file is ignored
  } catch {
    return false; // If command fails, file is not ignored
  }
}

/**
 * Extract imports from file content
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  let match;
  
  while ((match = IMPORT_REGEX.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

/**
 * Main check function
 */
async function checkImportsTracked() {
  console.log('🔍 Checking that all imported files are tracked in git...\n');

  // Find all TypeScript/TSX files
  const files = await glob(`${SRC_DIR}/**/*.{ts,tsx}`, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
  });

  const issues: ImportInfo[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const imports = extractImports(content);

      for (const importPath of imports) {
        const resolvedPath = resolveImportPath(importPath, file);
        
        if (resolvedPath && existsSync(resolvedPath)) {
          // Skip directories - only check actual files
          try {
            const stats = statSync(resolvedPath);
            if (!stats.isFile()) {
              continue; // Skip directories
            }
          } catch {
            continue; // Skip if we can't stat the path
          }
          
          // Skip if file is in .gitignore (intentionally untracked)
          if (isIgnored(resolvedPath)) {
            continue;
          }
          
          // Only check files in src/ directory
          const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
          const relativePath = relative(repoRoot, resolvedPath).replace(/\\/g, '/');
          
          if (!relativePath.startsWith('src/')) {
            continue; // Skip files outside src/
          }
          
          const isTracked = isTrackedInGit(resolvedPath);
          
          if (!isTracked) {
            issues.push({
              file,
              importPath,
              resolvedPath,
              isTracked: false,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  if (issues.length > 0) {
    console.error('❌ Found imported files that are not tracked in git:\n');
    
    // Deduplicate by resolvedPath
    const uniqueIssues = new Map<string, ImportInfo>();
    for (const issue of issues) {
      if (issue.resolvedPath && !uniqueIssues.has(issue.resolvedPath)) {
        uniqueIssues.set(issue.resolvedPath, issue);
      }
    }
    
    // Group by importing file for better readability
    const byImportingFile = new Map<string, ImportInfo[]>();
    for (const issue of issues) {
      if (!byImportingFile.has(issue.file)) {
        byImportingFile.set(issue.file, []);
      }
      byImportingFile.get(issue.file)!.push(issue);
    }
    
    for (const [importingFile, fileIssues] of byImportingFile.entries()) {
      console.error(`  📄 ${importingFile}`);
      for (const issue of fileIssues) {
        console.error(`     → ${issue.importPath}`);
        console.error(`       Resolved: ${issue.resolvedPath}`);
      }
      console.error('');
    }

    const untrackedFiles = Array.from(uniqueIssues.values())
      .map(i => i.resolvedPath)
      .filter((path): path is string => path !== null);
    
    console.error('💡 Solution: Add these files to git with:');
    console.error(`   git add ${untrackedFiles.join(' ')}\n`);
    
    process.exit(1);
  }

  console.log('✅ All imported files are tracked in git!\n');
}

checkImportsTracked().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

