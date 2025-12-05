/**
 * Generate Logic Script
 * 
 * Parses Section F (Business Logic Specifications) from PLAN.md and generates:
 * - src/store/*.ts - Zustand stores
 * - src/lib/algorithms/*.ts - Algorithm implementations
 * - src/lib/computed/*.ts - Computed property helpers
 * 
 * Usage: npx tsx scripts/generate-logic.ts [workspace-path]
 */

import fs from 'fs';
import path from 'path';

interface StoreSpec {
  name: string;
  purpose: string;
  schema: string;
  initialState: string;
  actions: Array<{ name: string; params: string; effect: string }>;
}

interface AlgorithmSpec {
  name: string;
  purpose: string;
  pseudocode: string;
  edgeCases: string[];
}

interface ComputedPropertySpec {
  property: string;
  formula: string;
  usedIn: string;
}

interface StateMachineSpec {
  name: string;
  states: Array<{ name: string; description: string; entryCondition: string }>;
  transitions: Array<{ from: string; to: string; event: string; sideEffects: string }>;
}

interface ValidationRuleSpec {
  entity: string;
  field: string;
  rule: string;
  errorMessage: string;
}

interface BusinessRuleSpec {
  id: string;
  description: string;
  enforcement: string;
}

interface SectionF {
  stateMachines: StateMachineSpec[];
  algorithms: AlgorithmSpec[];
  computedProperties: ComputedPropertySpec[];
  stores: StoreSpec[];
  validationRules: ValidationRuleSpec[];
  businessRules: BusinessRuleSpec[];
}

/**
 * Parse Section F from PLAN.md
 */
function parseSectionF(planContent: string): SectionF {
  const result: SectionF = {
    stateMachines: [],
    algorithms: [],
    computedProperties: [],
    stores: [],
    validationRules: [],
    businessRules: [],
  };

  // Find Section F content using simpler string search
  const fStart = planContent.indexOf('## F. Business Logic');
  const gStart = planContent.indexOf('## G. Environment');
  
  if (fStart === -1) {
    console.warn('⚠️ Section F not found in PLAN.md');
    return result;
  }
  
  const sectionF = gStart > fStart ? planContent.substring(fStart, gStart) : planContent.substring(fStart);

  // Parse F.1 State Machines
  const f1Match = sectionF.match(/### F\.1 State Machines([\s\S]*?)(?=### F\.2|$)/i);
  if (f1Match) {
    // Look for #### headers in F.1
    const smBlocks = f1Match[1].matchAll(/####\s+(.+?)(?:\n```mermaid([\s\S]*?)```)?[\s\S]*?\*\*States:\*\*([\s\S]*?)\*\*Transitions:\*\*([\s\S]*?)(?=####|$)/gi);
    for (const match of smBlocks) {
      const name = match[1].replace('State Machine', '').trim();
      const statesTable = match[3] || '';
      const transitionsTable = match[4] || '';
      const states = parseMarkdownTable(statesTable, ['name', 'description', 'entryCondition']);
      const transitions = parseMarkdownTable(transitionsTable, ['from', 'to', 'event', 'sideEffects']);
      result.stateMachines.push({ name, states, transitions });
    }
  }

  // Parse F.2 Algorithms
  const f2Match = sectionF.match(/### F\.2 Algorithms([\s\S]*?)(?=### F\.3|$)/i);
  if (f2Match) {
    const algoBlocks = f2Match[1].matchAll(/####\s+(.+?)\n\*\*Purpose:\*\*\s*(.+?)\n[\s\S]*?\*\*Pseudocode:\*\*[\s\S]*?```\n?([\s\S]*?)```[\s\S]*?(?:\*\*Edge Cases:\*\*([\s\S]*?))?(?=####|$)/gi);
    for (const match of algoBlocks) {
      const name = toPascalCase(match[1].trim());
      const purpose = match[2].trim();
      const pseudocode = match[3].trim();
      const edgeCasesText = match[4] || '';
      const edgeCases = edgeCasesText.split(/\n/).filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
      result.algorithms.push({ name, purpose, pseudocode, edgeCases });
    }
  }

  // Parse F.3 Computed Properties
  const f3Match = sectionF.match(/### F\.3 Computed Properties([\s\S]*?)(?=### F\.4|$)/i);
  if (f3Match) {
    result.computedProperties = parseMarkdownTable(f3Match[1], ['property', 'formula', 'usedIn']);
  }

  // Parse F.4 Client-Side Stores  
  const f4Match = sectionF.match(/### F\.4 Client-Side Stores([\s\S]*?)(?=### F\.5|$)/i);
  if (f4Match) {
    const storeBlocks = f4Match[1].matchAll(/####\s+(\w+)\s*\n\*\*Purpose:\*\*\s*(.+?)\s*\n[\s\S]*?\*\*Schema:\*\*\s*\n```typescript\n([\s\S]*?)```[\s\S]*?\*\*Initial State:\*\*\s*\n```typescript\n([\s\S]*?)```[\s\S]*?\*\*Actions:\*\*\s*\n([\s\S]*?)(?=####|$)/gi);
    for (const match of storeBlocks) {
      const name = match[1];
      const purpose = match[2].trim();
      const schema = match[3].trim();
      const initialState = match[4]?.trim() || '{}';
      const actionsText = match[5] || '';
      const actions = parseMarkdownTable(actionsText, ['name', 'params', 'effect']);
      result.stores.push({ name, purpose, schema, initialState, actions });
    }
  }

  // Parse F.5 Validation Rules
  const f5Match = sectionF.match(/### F\.5 Validation Rules([\s\S]*?)(?=### F\.6|$)/i);
  if (f5Match) {
    result.validationRules = parseMarkdownTable(f5Match[1], ['entity', 'field', 'rule', 'errorMessage']);
  }

  // Parse F.6 Business Rules
  const f6Match = sectionF.match(/### F\.6 Business Rules([\s\S]*?)(?=###|---|$)/i);
  if (f6Match) {
    result.businessRules = parseMarkdownTable(f6Match[1], ['id', 'description', 'enforcement']);
  }

  return result;
}

/**
 * Parse a markdown table into an array of objects
 */
function parseMarkdownTable<T extends string>(tableText: string, columns: T[]): Array<Record<T, string>> {
  const rows = tableText
    .split(/\n/)
    .filter(line => line.includes('|') && !line.includes('---'))
    .map(line => line.split('|').map(cell => cell.trim()).filter(Boolean));

  // Skip header row
  const dataRows = rows.slice(1);
  
  return dataRows.map(cells => {
    const obj = {} as Record<T, string>;
    columns.forEach((col, idx) => {
      obj[col] = cells[idx] || '';
    });
    return obj;
  });
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert string to camelCase
 */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Generate Zustand store file
 */
function generateStore(spec: StoreSpec): string {
  const hookName = `use${spec.name}`;
  const stateType = `${spec.name}State`;
  
  return `/**
 * ${spec.name} Store
 * 
 * Purpose: ${spec.purpose}
 * 
 * AUTO-GENERATED from PLAN.md Section F.4
 * Edit the plan, not this file.
 */

import { create } from 'zustand';

${spec.schema}

const initialState: Partial<${stateType}> = ${spec.initialState};

export const ${hookName} = create<${stateType}>((set, get) => ({
  ...initialState,
  
${spec.actions.map(action => `  /**
   * ${action.effect}
   */
  ${action.name}: (${action.params}) => {
    // TODO: Implement based on spec
    // Effect: ${action.effect}
    console.warn('${hookName}.${action.name} not implemented');
  },`).join('\n\n')}
} as ${stateType}));
`;
}

/**
 * Generate algorithm file
 */
function generateAlgorithm(spec: AlgorithmSpec): string {
  const funcName = toCamelCase(spec.name);
  
  return `/**
 * ${spec.name}
 * 
 * Purpose: ${spec.purpose}
 * 
 * AUTO-GENERATED from PLAN.md Section F.2
 * Edit the plan, not this file.
 */

/**
 * ${spec.purpose}
 * 
 * Pseudocode:
 * ${spec.pseudocode.split('\n').map(l => ` * ${l}`).join('\n')}
 * 
 * Edge Cases:
${spec.edgeCases.map(ec => ` * - ${ec}`).join('\n')}
 */
export function ${funcName}(/* TODO: Add params based on pseudocode */) {
  // TODO: Implement based on pseudocode above
  throw new Error('${funcName} not implemented');
}
`;
}

/**
 * Generate computed properties file
 */
function generateComputedProperties(specs: ComputedPropertySpec[]): string {
  return `/**
 * Computed Properties
 * 
 * AUTO-GENERATED from PLAN.md Section F.3
 * Edit the plan, not this file.
 */

${specs.map(spec => `/**
 * ${spec.property}
 * Formula: ${spec.formula}
 * Used in: ${spec.usedIn}
 */
export function compute${toPascalCase(spec.property.replace('.', '_'))}(/* TODO: Add params */) {
  // Formula: ${spec.formula}
  throw new Error('compute${toPascalCase(spec.property.replace('.', '_'))} not implemented');
}`).join('\n\n')}
`;
}

/**
 * Generate validation rules file
 */
function generateValidationRules(specs: ValidationRuleSpec[]): string {
  const byEntity = new Map<string, ValidationRuleSpec[]>();
  specs.forEach(spec => {
    if (!byEntity.has(spec.entity)) byEntity.set(spec.entity, []);
    byEntity.get(spec.entity)!.push(spec);
  });

  return `/**
 * Validation Rules
 * 
 * AUTO-GENERATED from PLAN.md Section F.5
 * Edit the plan, not this file.
 */

import { z } from 'zod';

${Array.from(byEntity.entries()).map(([entity, rules]) => `
/**
 * ${entity} Validation
 */
export const ${toCamelCase(entity)}ValidationRules = {
${rules.map(rule => `  ${rule.field}: {
    rule: '${rule.rule}',
    message: '${rule.errorMessage}',
  },`).join('\n')}
};

// TODO: Convert rules to Zod schema
// export const ${toCamelCase(entity)}Schema = z.object({ ... });
`).join('\n')}
`;
}

/**
 * Main function
 */
async function main() {
  const targetDir = process.argv[2] || '.';
  const planPath = path.join(targetDir, 'PLAN.md');
  
  console.log('🔧 Generating Business Logic from PLAN.md...');
  
  if (!fs.existsSync(planPath)) {
    console.error(`❌ PLAN.md not found at ${planPath}`);
    process.exit(1);
  }
  
  const planContent = fs.readFileSync(planPath, 'utf-8');
  const sectionF = parseSectionF(planContent);
  
  // Report what was found
  console.log(`   Found ${sectionF.stateMachines.length} state machines`);
  console.log(`   Found ${sectionF.algorithms.length} algorithms`);
  console.log(`   Found ${sectionF.computedProperties.length} computed properties`);
  console.log(`   Found ${sectionF.stores.length} stores`);
  console.log(`   Found ${sectionF.validationRules.length} validation rules`);
  console.log(`   Found ${sectionF.businessRules.length} business rules`);
  
  if (sectionF.stores.length === 0 && 
      sectionF.algorithms.length === 0 && 
      sectionF.computedProperties.length === 0) {
    console.log('⚠️ No business logic specs found in Section F. Skipping generation.');
    console.log('   Add Section F.2 (Algorithms), F.3 (Computed Properties), or F.4 (Stores) to PLAN.md');
    return;
  }
  
  // Create output directories
  const srcDir = path.join(targetDir, 'src');
  const storeDir = path.join(srcDir, 'store', 'generated');
  const algorithmsDir = path.join(srcDir, 'lib', 'algorithms');
  const computedDir = path.join(srcDir, 'lib', 'computed');
  const validationDir = path.join(srcDir, 'lib', 'validation');
  
  [storeDir, algorithmsDir, computedDir, validationDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`   Created ${path.relative(targetDir, dir)}/`);
    }
  });
  
  // Generate stores
  for (const store of sectionF.stores) {
    const fileName = `${toCamelCase(store.name)}.ts`;
    const filePath = path.join(storeDir, fileName);
    fs.writeFileSync(filePath, generateStore(store));
    console.log(`   ✅ Generated store: ${path.relative(targetDir, filePath)}`);
  }
  
  // Generate algorithms
  for (const algo of sectionF.algorithms) {
    const fileName = `${toCamelCase(algo.name)}.ts`;
    const filePath = path.join(algorithmsDir, fileName);
    fs.writeFileSync(filePath, generateAlgorithm(algo));
    console.log(`   ✅ Generated algorithm: ${path.relative(targetDir, filePath)}`);
  }
  
  // Generate computed properties
  if (sectionF.computedProperties.length > 0) {
    const filePath = path.join(computedDir, 'index.ts');
    fs.writeFileSync(filePath, generateComputedProperties(sectionF.computedProperties));
    console.log(`   ✅ Generated computed properties: ${path.relative(targetDir, filePath)}`);
  }
  
  // Generate validation rules
  if (sectionF.validationRules.length > 0) {
    const filePath = path.join(validationDir, 'rules.ts');
    fs.writeFileSync(filePath, generateValidationRules(sectionF.validationRules));
    console.log(`   ✅ Generated validation rules: ${path.relative(targetDir, filePath)}`);
  }
  
  // Generate index file for stores
  if (sectionF.stores.length > 0) {
    const indexPath = path.join(storeDir, 'index.ts');
    const exports = sectionF.stores
      .map(s => `export { use${s.name} } from './${toCamelCase(s.name)}';`)
      .join('\n');
    fs.writeFileSync(indexPath, `// AUTO-GENERATED - Do not edit\n${exports}\n`);
    console.log(`   ✅ Generated store index: ${path.relative(targetDir, indexPath)}`);
  }
  
  console.log('\n🎉 Business Logic Generation Complete');
  console.log('   Next: Review generated files and implement TODO placeholders');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});



