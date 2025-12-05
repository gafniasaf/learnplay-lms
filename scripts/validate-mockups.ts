/**
 * Mock Coverage Validation Script
 * 
 * This script validates that all required mockups exist and contain
 * the necessary CTAs as defined in docs/mockups/coverage.json.
 * 
 * Usage: npx tsx scripts/validate-mockups.ts
 * 
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation failed (missing files or CTAs)
 */

import * as fs from 'fs';
import * as path from 'path';

interface CTA {
  id: string;
  action: string;
  entity?: string;
  target?: string;
  jobType?: string;
}

interface State {
  id: string;
  file: string;
  description: string;
  required: boolean;
}

interface Route {
  path: string;
  name: string;
  description: string;
  states: State[];
  requiredCTAs: CTA[];
}

interface Coverage {
  routes: Route[];
  sharedComponents: any[];
  validationRules: {
    everyRouteMustHaveDefaultState: boolean;
    everyStateMustHaveFile: boolean;
    everyFileMustHaveDataRoute: boolean;
    everyRequiredCTAMustExist: boolean;
    sharedComponentsMustBeConsistent: boolean;
  };
}

const MOCKUPS_DIR = path.join(process.cwd(), 'docs', 'mockups');
const COVERAGE_FILE = path.join(MOCKUPS_DIR, 'coverage.json');

function loadCoverage(): Coverage {
  if (!fs.existsSync(COVERAGE_FILE)) {
    throw new Error(`Coverage file not found: ${COVERAGE_FILE}`);
  }
  return JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf-8'));
}

function checkFileExists(filePath: string): boolean {
  return fs.existsSync(path.join(MOCKUPS_DIR, filePath));
}

function extractDataAttributes(html: string): Map<string, string[]> {
  const attributes = new Map<string, string[]>();
  
  // Extract data-cta-id values
  const ctaMatches = html.matchAll(/data-cta-id="([^"]+)"/g);
  attributes.set('cta-ids', [...ctaMatches].map(m => m[1]));
  
  // Extract data-route value
  const routeMatch = html.match(/data-route="([^"]+)"/);
  if (routeMatch) {
    attributes.set('route', [routeMatch[1]]);
  }
  
  // Extract data-action values
  const actionMatches = html.matchAll(/data-action="([^"]+)"/g);
  attributes.set('actions', [...actionMatches].map(m => m[1]));
  
  return attributes;
}

function validateMockups(): { passed: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  console.log('🔍 Loading coverage matrix...');
  const coverage = loadCoverage();
  
  console.log(`📋 Found ${coverage.routes.length} routes to validate\n`);
  
  for (const route of coverage.routes) {
    console.log(`\n📁 Validating route: ${route.path} (${route.name})`);
    
    // Check if default state exists
    const defaultState = route.states.find(s => s.id === 'default' || s.id === 'populated');
    if (!defaultState && coverage.validationRules.everyRouteMustHaveDefaultState) {
      errors.push(`Route ${route.path} is missing a default/populated state`);
    }
    
    // Check each state file
    for (const state of route.states) {
      if (!state.required) {
        continue;
      }
      
      const filePath = state.file;
      const fullPath = path.join(MOCKUPS_DIR, filePath);
      
      if (!checkFileExists(filePath)) {
        errors.push(`Missing required mock: ${filePath}`);
        console.log(`   ❌ ${state.id}: ${filePath} (MISSING)`);
        continue;
      }
      
      console.log(`   ✅ ${state.id}: ${filePath}`);
      
      // Read and validate file contents
      const html = fs.readFileSync(fullPath, 'utf-8');
      const attrs = extractDataAttributes(html);
      
      // Check data-route attribute
      const fileRoute = attrs.get('route')?.[0];
      if (!fileRoute && coverage.validationRules.everyFileMustHaveDataRoute) {
        errors.push(`File ${filePath} is missing data-route attribute`);
      } else if (fileRoute && fileRoute !== route.path) {
        warnings.push(`File ${filePath} has data-route="${fileRoute}" but expected "${route.path}"`);
      }
      
      // Check required CTAs (only for default/populated states)
      if ((state.id === 'default' || state.id === 'populated') && coverage.validationRules.everyRequiredCTAMustExist) {
        const fileCTAs = attrs.get('cta-ids') || [];
        for (const requiredCTA of route.requiredCTAs) {
          if (!fileCTAs.includes(requiredCTA.id)) {
            warnings.push(`File ${filePath} is missing required CTA: ${requiredCTA.id}`);
          }
        }
      }
    }
  }
  
  return {
    passed: errors.length === 0,
    errors,
    warnings
  };
}

function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Golden Plan Mock Coverage Validator');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    const result = validateMockups();
    
    console.log('\n═══════════════════════════════════════════════════════════');
    
    if (result.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${result.warnings.length}):`);
      result.warnings.forEach(w => console.log(`   - ${w}`));
    }
    
    if (result.errors.length > 0) {
      console.log(`\n❌ ERRORS (${result.errors.length}):`);
      result.errors.forEach(e => console.log(`   - ${e}`));
      console.log('\n❌ VALIDATION FAILED');
      console.log('   Fix the errors above before proceeding to React compilation.\n');
      process.exit(1);
    }
    
    console.log('\n✅ ALL VALIDATIONS PASSED');
    console.log('   Mock coverage is complete. Ready for React compilation.\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 VALIDATION ERROR:', error);
    process.exit(1);
  }
}

main();

