#!/usr/bin/env npx tsx
/**
 * Lovable → Ignite Zero Ingestion Script
 * 
 * Usage:
 *   npx tsx scripts/ingest-lovable.ts <path-to-lovable-export>
 * 
 * Example:
 *   npx tsx scripts/ingest-lovable.ts ./handoff-task-manager
 *   npx tsx scripts/ingest-lovable.ts ./handoff-task-manager.zip
 * 
 * This script:
 * 1. Extracts zip if needed
 * 2. Reads HANDOFF_SPEC.md and SUPABASE_SCHEMA.sql
 * 3. Parses entities, routes, and CTAs
 * 4. Updates system-manifest.json
 * 5. Copies React code to src/
 * 6. Copies edge functions to supabase/functions/
 * 7. Runs scaffold-manifest.ts
 * 8. Attempts to fix common TypeScript issues
 * 9. Runs verify
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof COLORS = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function logStep(step: number, total: number, message: string) {
  log(`\n[${ step }/${ total }] ${message}`, 'cyan');
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message: string) {
  log(`❌ ${message}`, 'red');
}

function exec(command: string, options: { cwd?: string; silent?: boolean } = {}) {
  try {
    const result = execSync(command, {
      cwd: options.cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
    });
    return { success: true, output: result };
  } catch (error: any) {
    return { success: false, output: error.stdout || error.message };
  }
}

// ─────────────────────────────────────────────────────────────
// STEP 1: Validate input and extract if zip
// ─────────────────────────────────────────────────────────────
function prepareSource(inputPath: string): string {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Path not found: ${inputPath}`);
  }

  // If it's a zip, extract it
  if (inputPath.endsWith('.zip')) {
    const extractDir = inputPath.replace('.zip', '');
    log(`Extracting ${inputPath} to ${extractDir}...`);
    
    // Use PowerShell on Windows, unzip on Unix
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      exec(`powershell -Command "Expand-Archive -Force '${inputPath}' '${extractDir}'"`, { silent: true });
    } else {
      exec(`unzip -o "${inputPath}" -d "${extractDir}"`, { silent: true });
    }
    
    return extractDir;
  }

  return inputPath;
}

// ─────────────────────────────────────────────────────────────
// STEP 2: Read handoff files
// ─────────────────────────────────────────────────────────────
interface HandoffData {
  projectName: string;
  description: string;
  entities: Array<{ name: string; fields: string[] }>;
  routes: Array<{ path: string; component: string }>;
  ctas: Array<{ page: string; action: string; text: string }>;
  envVars: string[];
  hasSchema: boolean;
  schemaSQL: string;
}

function readHandoffFiles(sourceDir: string): HandoffData {
  const handoffPath = path.join(sourceDir, 'HANDOFF_SPEC.md');
  const schemaPath = path.join(sourceDir, 'SUPABASE_SCHEMA.sql');

  if (!fs.existsSync(handoffPath)) {
    throw new Error(`HANDOFF_SPEC.md not found in ${sourceDir}`);
  }

  const handoffContent = fs.readFileSync(handoffPath, 'utf-8');
  const schemaContent = fs.existsSync(schemaPath) 
    ? fs.readFileSync(schemaPath, 'utf-8') 
    : '';

  // Parse project name from handoff
  const projectNameMatch = handoffContent.match(/Project Title[:\s]+["']?([^"'\n]+)/i);
  const projectName = projectNameMatch?.[1]?.trim() || 'Lovable Import';

  // Parse description
  const descMatch = handoffContent.match(/Description[:\s]+([^\n]+)/i);
  const description = descMatch?.[1]?.trim() || '';

  // Parse entities from schema SQL
  const entities: Array<{ name: string; fields: string[] }> = [];
  const tableMatches = schemaContent.matchAll(/CREATE TABLE[^(]+(\w+)\s*\(([^;]+)\)/gi);
  for (const match of tableMatches) {
    const tableName = match[1].replace('public.', '');
    const fieldsBlock = match[2];
    const fields = fieldsBlock
      .split(',')
      .map(f => f.trim().split(/\s+/)[0])
      .filter(f => f && !f.startsWith('--'));
    entities.push({ name: tableName, fields });
  }

  // Parse routes from handoff (look for route patterns)
  const routes: Array<{ path: string; component: string }> = [];
  const routeMatches = handoffContent.matchAll(/[`\/](\/?[\w\-\/]+)[`\s]+(?:→|->|:)?\s*[`]?(\w+(?:Page)?)[`]?/gi);
  for (const match of routeMatches) {
    routes.push({ path: match[1], component: match[2] });
  }

  // Parse CTAs (buttons, actions)
  const ctas: Array<{ page: string; action: string; text: string }> = [];
  const ctaMatches = handoffContent.matchAll(/["']([^"']+)["']\s+button|button[:\s]+["']([^"']+)["']/gi);
  for (const match of ctaMatches) {
    ctas.push({ page: 'unknown', action: 'click', text: match[1] || match[2] });
  }

  // Parse env vars
  const envVars: string[] = [];
  const envMatches = handoffContent.matchAll(/[`]?(VITE_\w+|SUPABASE_\w+)[`]?/g);
  for (const match of envMatches) {
    if (!envVars.includes(match[1])) {
      envVars.push(match[1]);
    }
  }

  return {
    projectName,
    description,
    entities,
    routes,
    ctas,
    envVars,
    hasSchema: schemaContent.length > 0,
    schemaSQL: schemaContent,
  };
}

// ─────────────────────────────────────────────────────────────
// STEP 3: Update system-manifest.json
// ─────────────────────────────────────────────────────────────
function updateManifest(handoff: HandoffData) {
  const manifestPath = 'system-manifest.json';
  
  if (!fs.existsSync(manifestPath)) {
    logWarning('system-manifest.json not found, creating minimal version');
  }

  const manifest = fs.existsSync(manifestPath) 
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : { branding: {}, data_model: [], user_roles: [] };

  // Update branding
  manifest.branding = manifest.branding || {};
  manifest.branding.name = handoff.projectName;
  manifest.branding.description = handoff.description;

  // Update data model from parsed entities
  if (handoff.entities.length > 0) {
    manifest.data_model = handoff.entities.map((entity, idx) => ({
      name: entity.name.charAt(0).toUpperCase() + entity.name.slice(1).replace(/_/g, ''),
      type: idx === 0 ? 'root_entity' : 'child_entity',
      table: entity.name,
      fields: entity.fields,
    }));

    // Update terminology
    manifest.branding.terminology = manifest.branding.terminology || {};
    if (handoff.entities[0]) {
      const rootName = handoff.entities[0].name;
      manifest.branding.terminology.root_entity = rootName.charAt(0).toUpperCase() + rootName.slice(1);
      manifest.branding.terminology.root_entity_plural = rootName + 's';
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  logSuccess(`Updated ${manifestPath}`);
}

// ─────────────────────────────────────────────────────────────
// STEP 4: Copy React code
// ─────────────────────────────────────────────────────────────
function copyReactCode(sourceDir: string) {
  const srcSource = path.join(sourceDir, 'src');
  const srcDest = 'src';

  if (!fs.existsSync(srcSource)) {
    throw new Error(`src/ folder not found in ${sourceDir}`);
  }

  // Backup existing src if it has content
  if (fs.existsSync(srcDest)) {
    const backupDir = `src-backup-${Date.now()}`;
    logWarning(`Backing up existing src/ to ${backupDir}`);
    fs.renameSync(srcDest, backupDir);
  }

  // Copy new src
  copyDirRecursive(srcSource, srcDest);
  logSuccess('Copied src/ from Lovable export');

  // Copy edge functions if they exist
  const functionsSource = path.join(sourceDir, 'supabase', 'functions');
  const functionsDest = path.join('supabase', 'functions');
  
  if (fs.existsSync(functionsSource)) {
    if (!fs.existsSync('supabase')) {
      fs.mkdirSync('supabase');
    }
    copyDirRecursive(functionsSource, functionsDest);
    logSuccess('Copied supabase/functions/ from Lovable export');
  }
}

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// STEP 5: Save schema SQL
// ─────────────────────────────────────────────────────────────
function saveSchema(handoff: HandoffData) {
  if (handoff.hasSchema) {
    const schemaPath = 'supabase/schema-from-lovable.sql';
    if (!fs.existsSync('supabase')) {
      fs.mkdirSync('supabase');
    }
    fs.writeFileSync(schemaPath, handoff.schemaSQL);
    logSuccess(`Saved schema to ${schemaPath}`);
  }
}

// ─────────────────────────────────────────────────────────────
// STEP 6: Run scaffold
// ─────────────────────────────────────────────────────────────
function runScaffold() {
  log('Running scaffold-manifest.ts...');
  const result = exec('npx tsx scripts/scaffold-manifest.ts', { silent: true });
  if (result.success) {
    logSuccess('Scaffold completed');
  } else {
    logWarning('Scaffold had issues (may be OK if script not found)');
  }
}

// ─────────────────────────────────────────────────────────────
// STEP 7: Attempt TypeScript fixes
// ─────────────────────────────────────────────────────────────
function attemptTypescriptFixes() {
  log('Checking for TypeScript errors...');
  
  const result = exec('npm run typecheck 2>&1', { silent: true });
  
  if (result.success) {
    logSuccess('No TypeScript errors!');
    return true;
  }

  // Count errors
  const errorCount = (result.output.match(/error TS/g) || []).length;
  logWarning(`Found ${errorCount} TypeScript errors`);

  // Common fixes we can attempt automatically
  const fixes = [
    // Fix: Remove unused log import
    {
      pattern: /import \{ log \} from ['"]@\/lib\/logger['"];?\n?/g,
      replacement: '',
      files: ['src/**/*.ts', 'src/**/*.tsx'],
    },
  ];

  log('Attempting automatic fixes...');
  // Note: Full auto-fix would require more sophisticated AST manipulation
  // For now, we just report and let the agent handle it

  return false;
}

// ─────────────────────────────────────────────────────────────
// STEP 8: Run verify
// ─────────────────────────────────────────────────────────────
function runVerify(): boolean {
  log('Running npm run verify...');
  const result = exec('npm run verify');
  return result.success;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n');
  log('═══════════════════════════════════════════════════════════', 'cyan');
  log('       LOVABLE → IGNITE ZERO INGESTION SCRIPT              ', 'cyan');
  log('═══════════════════════════════════════════════════════════', 'cyan');

  const inputPath = process.argv[2];
  
  if (!inputPath) {
    logError('Usage: npx tsx scripts/ingest-lovable.ts <path-to-lovable-export>');
    logError('Example: npx tsx scripts/ingest-lovable.ts ./handoff-task-manager');
    process.exit(1);
  }

  const TOTAL_STEPS = 8;

  try {
    // Step 1: Prepare source
    logStep(1, TOTAL_STEPS, 'Preparing source...');
    const sourceDir = prepareSource(inputPath);
    logSuccess(`Source ready: ${sourceDir}`);

    // Step 2: Read handoff files
    logStep(2, TOTAL_STEPS, 'Reading handoff files...');
    const handoff = readHandoffFiles(sourceDir);
    logSuccess(`Project: ${handoff.projectName}`);
    logSuccess(`Entities found: ${handoff.entities.map(e => e.name).join(', ') || 'none'}`);
    logSuccess(`Routes found: ${handoff.routes.length}`);
    logSuccess(`Schema SQL: ${handoff.hasSchema ? 'yes' : 'no'}`);

    // Step 3: Update manifest
    logStep(3, TOTAL_STEPS, 'Updating system-manifest.json...');
    updateManifest(handoff);

    // Step 4: Copy React code
    logStep(4, TOTAL_STEPS, 'Copying React code...');
    copyReactCode(sourceDir);

    // Step 5: Save schema
    logStep(5, TOTAL_STEPS, 'Saving schema SQL...');
    saveSchema(handoff);

    // Step 6: Run scaffold
    logStep(6, TOTAL_STEPS, 'Running scaffold...');
    runScaffold();

    // Step 7: TypeScript fixes
    logStep(7, TOTAL_STEPS, 'Checking TypeScript...');
    const tsOk = attemptTypescriptFixes();

    // Step 8: Verify
    logStep(8, TOTAL_STEPS, 'Running verification...');
    const verifyOk = runVerify();

    // Summary
    console.log('\n');
    log('═══════════════════════════════════════════════════════════', 'cyan');
    log('                      INGESTION COMPLETE                    ', 'cyan');
    log('═══════════════════════════════════════════════════════════', 'cyan');
    console.log('');
    
    if (verifyOk) {
      logSuccess('All checks passed! The system is ready.');
    } else {
      logWarning('Some checks failed. Manual fixes needed.');
      console.log('');
      log('Next steps for the agent:', 'yellow');
      log('1. Run: npm run typecheck', 'yellow');
      log('2. Fix any TypeScript errors', 'yellow');
      log('3. Run: npm run verify', 'yellow');
      log('4. Wire MCP hooks if needed', 'yellow');
    }

    // Output env vars needed
    if (handoff.envVars.length > 0) {
      console.log('');
      log('Environment variables needed:', 'blue');
      handoff.envVars.forEach(v => log(`  ${v}`, 'blue'));
    }

    // Output schema location
    if (handoff.hasSchema) {
      console.log('');
      log('Database schema saved to: supabase/schema-from-lovable.sql', 'blue');
      log('Run this SQL in your Supabase project to create tables.', 'blue');
    }

  } catch (error: any) {
    logError(`Ingestion failed: ${error.message}`);
    process.exit(1);
  }
}

main();

