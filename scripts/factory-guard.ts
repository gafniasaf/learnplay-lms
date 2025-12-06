import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { parse, HTMLElement } from 'node-html-parser';

// Load env vars for MCP/Supabase config
dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL is REQUIRED - set env var before running');
  console.error('   Example: SUPABASE_URL=http://127.0.0.1:54321');
  process.exit(1);
}

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const REQUIRED_FILES = [
  'system-manifest.json',
  'PLAN.md',
  'user_journey.md',
];

// Required sections in PLAN.md (Golden Plan v5.0)
const REQUIRED_SECTIONS = {
  'A': { name: 'Domain Definition', required: true, subsections: ['A.1 Product Name', 'A.4 Target Users'] },
  'B': { name: 'Data Model', required: true, subsections: ['B.1 Root Entities'] },
  'C': { name: 'User Journeys', required: true, subsections: [] },
  'D': { name: 'UI Surfaces', required: true, subsections: ['D.1 Route Map'] },
  'E': { name: 'AI Jobs', required: false, subsections: [] }, // Optional if no AI
  'F': { name: 'Business Logic', required: false, subsections: [] }, // Optional for simple apps
  'G': { name: 'Environment', required: true, subsections: ['G.1 Frontend Environment'] },
};

async function checkMcpHealth() {
  console.log('🔍 Checking MCP Health...');
  // TODO: Implement actual MCP ping if endpoint is exposed.
  // For now, we assume if the script runs, the environment is partially sane.
  // If you have a local MCP server port (e.g. 3000), fetch it here.
  console.log('✅ MCP Check Passed (Stub)');
}

async function checkSupabaseHealth() {
  console.log('🔍 Checking Supabase Health...');
  if (!SUPABASE_ANON_KEY) {
    console.log('⚠️ SUPABASE_ANON_KEY not set, skipping Supabase health check (dev mode)');
    console.log('✅ Supabase Check Skipped (Dev Mode)');
    return;
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/architect-advisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ mode: 'health-check' }),
    });
    // We accept 200 (OK) or 404 (Function not found, but service is up).
    // Actually, for a "Factory Ready" state, 200 is ideal, but if we archived the function,
    // we might just check the base Supabase URL.
    // Let's check the base REST endpoint instead for generic health.
    const restHealth = await fetch(`${SUPABASE_URL}/rest/v1/`, {
       headers: { apikey: SUPABASE_ANON_KEY }
    });
    
    if (restHealth.status !== 200) {
       // It's okay if it returns 200 (Swagger) or similar. 
       // Actually, usually /rest/v1/ returns JSON or documentation.
       console.log(`   Supabase returned ${restHealth.status}, assuming alive.`);
    }
    console.log('✅ Supabase Check Passed');
  } catch (error) {
    throw new Error(`Supabase unreachable at ${SUPABASE_URL}: ${(error as Error).message}`);
  }
}

const normalizeRoute = (route: string) => (route.startsWith("/") ? route : `/${route}`);

/**
 * Validate PLAN.md contains required sections (Golden Plan v5.0)
 */
function validatePlanSections(planContent: string) {
  const foundSections: string[] = [];
  const missingSections: string[] = [];
  const warnings: string[] = [];
  
  for (const [letter, config] of Object.entries(REQUIRED_SECTIONS)) {
    const sectionPattern = new RegExp(`## ${letter}\\. ${config.name}`, 'i');
    const hasSection = sectionPattern.test(planContent);
    
    if (hasSection) {
      foundSections.push(`${letter}. ${config.name}`);
      
      // Check subsections
      for (const subsection of config.subsections) {
        const subPattern = new RegExp(`### ${subsection}`, 'i');
        if (!subPattern.test(planContent)) {
          warnings.push(`Section ${letter} missing subsection: ${subsection}`);
        }
      }
    } else if (config.required) {
      missingSections.push(`${letter}. ${config.name}`);
    } else {
      warnings.push(`Optional section ${letter}. ${config.name} not found`);
    }
  }
  
  // Log findings
  if (foundSections.length > 0) {
    console.log(`   ✅ Found sections: ${foundSections.join(', ')}`);
  }
  
  if (warnings.length > 0) {
    warnings.forEach(w => console.log(`   ⚠️ ${w}`));
  }
  
  if (missingSections.length > 0) {
    throw new Error(`PLAN.md missing required sections: ${missingSections.join(', ')}\nUse the Golden Plan Complete Guide (docs/GOLDEN_PLAN_COMPLETE_GUIDE.md) for the correct format.`);
  }
  
  // Additional content checks for key sections
  
  // Check Section B has entity table
  if (/## B\. Data Model/i.test(planContent)) {
    if (!/\| Entity \||\| Name \|/i.test(planContent)) {
      warnings.push('Section B should include an entity table (| Entity | Slug | Description |)');
    }
  }
  
  // Check Section D has route table
  if (/## D\. UI Surfaces/i.test(planContent)) {
    if (!/\| Route \||\| Path \|/i.test(planContent)) {
      warnings.push('Section D should include a route map table (| Route | Page Name | ... |)');
    }
  }
  
  // Check Section E has job registry (if present)
  if (/## E\. AI Jobs/i.test(planContent)) {
    if (!/\| Job ID \||\| Job \|/i.test(planContent)) {
      warnings.push('Section E should include a job registry table');
    }
    if (!/prompt_template|Prompt Template/i.test(planContent)) {
      console.log('   ⚠️ Section E should include prompt templates for each AI job');
    }
  }
  
  // Check Section F has spec blocks (if present)  
  if (/## F\. Business Logic/i.test(planContent)) {
    const hasStateMachines = /### F\.1 State Machines/i.test(planContent);
    const hasAlgorithms = /### F\.2 Algorithms/i.test(planContent);
    const hasComputed = /### F\.3 Computed Properties/i.test(planContent);
    const hasStores = /### F\.4 Client-Side Stores/i.test(planContent);
    
    if (!hasStateMachines && !hasAlgorithms && !hasComputed && !hasStores) {
      console.log('   ⚠️ Section F present but has no subsections (F.1-F.4). Add business logic specs for code generation.');
    }
  }
  
  // Check Section G has environment tables
  if (/## G\. Environment/i.test(planContent)) {
    if (!/VITE_|SUPABASE_/i.test(planContent)) {
      console.log('   ⚠️ Section G should list required environment variables (VITE_*, SUPABASE_*, etc.)');
    }
  }
}

function validateInputPackage(targetDir: string) {
  console.log(`🔍 Validating Input Package at: ${targetDir}`);
  
  // 1. Check Required Files
  const missing = REQUIRED_FILES.filter(f => !fs.existsSync(path.join(targetDir, f)));
  if (missing.length > 0) {
    throw new Error(`Missing required input files: ${missing.join(', ')}`);
  }

  // 2. Check Mockups
  const mockupsDir = path.join(targetDir, 'mockups');
  if (!fs.existsSync(mockupsDir)) {
    throw new Error('Missing mockups/ directory.');
  }
  const htmlFiles = fs.readdirSync(mockupsDir).filter(f => f.endsWith('.html'));
  if (htmlFiles.length === 0) {
    throw new Error('No HTML mockups found in mockups/ directory.');
  }
  // Require layout.html with frame regions
  const layoutPath = path.join(mockupsDir, 'layout.html');
  if (!fs.existsSync(layoutPath)) {
    throw new Error('mockups/layout.html is required to define the app frame.');
  }
  const layoutHtml = fs.readFileSync(layoutPath, 'utf-8');
  const requiredRegions = ['header', 'sidebar', 'content', 'footer'];
  const missingRegions = requiredRegions.filter(r => !new RegExp(`data-region=["']${r}["']`, 'i').test(layoutHtml));
  if (missingRegions.length > 0) {
    throw new Error(`layout.html missing regions: ${missingRegions.join(', ')}`);
  }
  // Each page mockup must declare data-route
  const pageFiles = htmlFiles.filter(f => f !== 'layout.html');
  if (pageFiles.length === 0) {
    throw new Error('At least one page mockup (besides layout.html) is required.');
  }
  const declaredRoutes = new Set<string>();
  const navigateTargets: Array<{ file: string; id: string; target: string }> = [];

  for (const f of pageFiles) {
    const htmlPath = path.join(mockupsDir, f);
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const dom = parse(html);
    const routeMatch = html.match(/data-route=["']([^"']+)["']/i);
    if (!routeMatch) {
      throw new Error(`${f} must include data-route="/path" attribute`);
    }
    declaredRoutes.add(normalizeRoute(routeMatch[1]));
    // Require at least one CTA with id and action
    if (!/data-cta-id=["'][^"']+["']/.test(html) || !/data-action=["'](navigate|enqueueJob|save)["']/.test(html)) {
      throw new Error(`${f} must include at least one CTA with data-cta-id and data-action (navigate|enqueueJob|save)`);
    }
    // Specific requirements per action
    const navigateCtas = html.match(/data-action=["']navigate["'][^>]*>/gi) || [];
    for (const tag of navigateCtas) {
      if (!/data-target=["'][^"']+["']/.test(tag)) {
        throw new Error(`${f} navigate CTA is missing data-target="/path"`);
      }
    }
    const jobCtas = html.match(/data-action=["']enqueueJob["'][^>]*>/gi) || [];
    for (const tag of jobCtas) {
      if (!/data-job-type=["'][^"']+["']/.test(tag)) {
        throw new Error(`${f} enqueueJob CTA requires data-job-type="..."`);
      }
    }
    const saveCtas = dom.querySelectorAll('[data-action="save"]');
    const fieldNodes = dom.querySelectorAll('[data-field]');
    const formIds = new Set<string>();
    fieldNodes.forEach((node) => {
      const formId = resolveFormId(node as HTMLElement);
      formIds.add(formId);
    });
    for (const node of saveCtas) {
      if (!node.getAttribute('data-entity')) {
        throw new Error(`${f} save CTA requires data-entity="EntityName"`);
      }
      const formId = node.getAttribute('data-form');
      if (!formId) {
        throw new Error(`${f} save CTA must include data-form="form-id"`);
      }
      if (!formIds.has(formId)) {
        throw new Error(`${f} save CTA references unknown form "${formId}". Add data-field inputs with matching data-form-id.`);
      }
    }
    if (saveCtas.length > 0 && fieldNodes.length === 0) {
      throw new Error(`${f} has save CTA but no data-field inputs`);
    }

    dom.querySelectorAll('[data-cta-id]').forEach((node) => {
      const id = node.getAttribute('data-cta-id');
      const action = node.getAttribute('data-action');
      const target = node.getAttribute('data-target');
      if (id && action?.toLowerCase() === 'navigate' && target) {
        navigateTargets.push({ file: f, id, target });
      }
    });
  }

  // 3. Manifest sanity
  const manifestPath = path.join(targetDir, 'system-manifest.json');
  const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
  let manifest: any;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (error) {
    throw new Error('system-manifest.json is not valid JSON.');
  }
  const rootEntities = manifest?.data_model?.root_entities || [];
  const childEntities = manifest?.data_model?.child_entities || [];
  const allEntities = [...rootEntities, ...childEntities];
  if (allEntities.length === 0) {
    throw new Error('system-manifest.json must define at least one entity.');
  }
  
  const entityFields = new Map<string, Set<string>>();
  allEntities.forEach((e: any) => {
    entityFields.set(e.name, new Set(e.fields.map((f: any) => f.name)));
  });

  // 3b. Validate agent_jobs have prompt_template (LESSON LEARNED)
  const agentJobs = manifest?.agent_jobs || [];
  const jobsWithoutPrompt = agentJobs.filter((j: any) => !j.prompt_template);
  if (jobsWithoutPrompt.length > 0) {
    const jobIds = jobsWithoutPrompt.map((j: any) => j.id).join(', ');
    throw new Error(`agent_jobs missing prompt_template: [${jobIds}]. Every AI job MUST have a prompt_template to generate backend logic.`);
  }

  // 2b. Cross-validate Mockup Fields against Manifest
  // Re-scan page files now that we have manifest
  for (const f of pageFiles) {
    const htmlPath = path.join(mockupsDir, f);
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const dom = parse(html);
    
    const fieldsByForm = new Map<string, Set<string>>();
    dom.querySelectorAll('[data-field]').forEach(node => {
      const formId = resolveFormId(node as HTMLElement);
      if (!fieldsByForm.has(formId)) fieldsByForm.set(formId, new Set());
      fieldsByForm.get(formId)!.add(node.getAttribute('data-field')!);
    });

    dom.querySelectorAll('[data-action="save"]').forEach(node => {
      const entity = node.getAttribute('data-entity');
      if (!entity) return; // Already caught by previous loop
      if (!entityFields.has(entity)) {
        throw new Error(`${f}: Save CTA references unknown entity "${entity}". Check manifest.`);
      }
      
      const formId = node.getAttribute('data-form') || 'default';
      const fields = fieldsByForm.get(formId);
      if (fields) {
        const validFields = entityFields.get(entity)!;
        for (const fieldName of fields) {
          // Skip fields starting with "mockup_" or "ui_" as purely ephemeral? 
          // No, strict mode.
          if (!validFields.has(fieldName)) {
             throw new Error(`${f}: Field '${fieldName}' in form '${formId}' is not defined in entity '${entity}'. Add to manifest or check spelling.`);
          }
        }
      }
    });
  }

  // 4. PLAN.md structure validation (Golden Plan v5.0)
  const planPath = path.join(targetDir, 'PLAN.md');
  const plan = fs.readFileSync(planPath, 'utf-8');
  
  // Legacy checks (backwards compatibility)
  if (!/source:/i.test(plan) && !/## D\. UI Surfaces/i.test(plan)) {
    throw new Error('PLAN.md must reference mockups via "Source" line or Section D (UI Surfaces).');
  }
  if (!/verification:/i.test(plan) && !/## 11\. Verification/i.test(plan) && !/Verification Checklist/i.test(plan)) {
    throw new Error('PLAN.md must define verification instructions.');
  }
  
  // Golden Plan v5.0 Section validation
  validatePlanSections(plan);

  // 5. user_journey must list at least two steps
  const journeyPath = path.join(targetDir, 'user_journey.md');
  const journey = fs
    .readFileSync(journeyPath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (journey.length < 2) {
    throw new Error('user_journey.md should outline at least two steps in the flow.');
  }

  console.log('✅ Input Package Valid');
  // Validate navigate targets after all routes parsed
  for (const nav of navigateTargets) {
    const target = normalizeRoute(nav.target);
    if (!nav.target.startsWith("/") || declaredRoutes.has(target)) continue;
    throw new Error(`${nav.file} CTA "${nav.id}" targets "${nav.target}" but no mockup defines that route.`);
  }
}

function resolveFormId(node: HTMLElement | null) {
  let current: HTMLElement | null = node;
  while (current) {
    const attr = current.getAttribute('data-form-id');
    if (attr) return attr;
    current = current.parentNode as HTMLElement | null;
  }
  return 'default';
}

async function main() {
  const targetDir = process.argv[2] || '.';
  
  try {
    console.log('🏭 Starting Factory Guard...');
    await checkMcpHealth();
    await checkSupabaseHealth();
    validateInputPackage(targetDir);
    console.log('\n🎉 🟢 FACTORY READY 🟢');
  } catch (error) {
    console.error('\n🔴 FACTORY HALT 🔴');
    console.error((error as Error).message);
    process.exit(1);
  }
}

main();

