import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Types matching system-manifest.json ---
interface FieldDef {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'tag_array' | 'vector' | 'json' | 'enum';
  required?: boolean;
  description?: string;
  options?: string[]; // For enums
}

interface EntityDef {
  name: string;
  type: 'root_entity' | 'child_entity';
  fields: FieldDef[];
}

interface AgentJobDef {
  id: string;
  trigger?: string;
  target_entity?: string;
  action?: string;
  prompt_template?: string;
  ui?: {
    label: string;
    icon: string;
    placement: string;
  }
}

interface Manifest {
  system?: { name: string; version: string };
  branding?: { name: string; tagline: string };
  data_model: EntityDef[] | { root_entities: EntityDef[], child_entities: EntityDef[] };
  agent_jobs: AgentJobDef[];
  edge_functions?: Array<{
    id: string;
    input?: Record<string, any>;
    output?: Record<string, any>;
    description?: string;
  }>;
}

// --- Generator Logic ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFEST_PATH = path.join(__dirname, '../system-manifest.json');
const OUTPUT_PATH = path.join(__dirname, '../src/lib/contracts.ts');
const STRATEGIES_DIR = path.join(__dirname, '../supabase/functions/ai-job-runner/strategies');
const REGISTRY_PATH = path.join(__dirname, '../supabase/functions/ai-job-runner/registry.ts');

function mapTypeToZod(field: FieldDef): string {
  let zodType = 'z.any()';
  switch (field.type) {
    case 'string': zodType = 'z.string()'; break;
    case 'number': zodType = 'z.number()'; break;
    case 'boolean': zodType = 'z.boolean()'; break;
    case 'date': zodType = 'z.string().datetime()'; break;
    case 'tag_array': zodType = 'z.array(z.string())'; break;
    case 'vector': zodType = 'z.array(z.number())'; break;
    case 'json': zodType = 'z.any()'; break;
    case 'enum': 
      if (field.options && field.options.length > 0) {
        zodType = `z.enum([${field.options.map(o => `'${o}'`).join(', ')}])`;
      } else {
        zodType = 'z.string()'; 
      }
      break;
  }
  if (!field.required && field.type !== 'enum') zodType += '.optional()'; // Enums are strict by default unless explicit
  if (field.description) zodType += `.describe("${field.description}")`;
  return zodType;
}

function generateEntitySchema(entity: EntityDef): string {
  const standardKeys = ['id', 'organization_id', 'created_at', 'updated_at', 'version', 'format'];
  
  // Filter out standard fields from the custom fields list to avoid duplicates
  const customFields = entity.fields.filter(f => !standardKeys.includes(f.key));
  
  const fields = customFields.map(f => `  ${f.key}: ${mapTypeToZod(f)}`).join(',\n');
  
  // Standard Invariant Fields
  const standardFields = [
    `  id: z.string().uuid()`,
    `  organization_id: z.string().uuid()`,
    `  created_at: z.string().datetime().optional()`,
    `  updated_at: z.string().datetime().optional()`,
    `  version: z.number().int().default(1)`,
    `  format: z.string().default('v1')`
  ].join(',\n');

  return `
export const ${entity.name}Schema = z.object({
${standardFields},
${fields}
});
export type ${entity.name} = z.infer<typeof ${entity.name}Schema>;
`;
}

function generateJobSchemas(manifest: Manifest, entities: EntityDef[]): string {
  // 1. Determine the dynamic ID key based on Root Entity
  const rootEntity = entities.find(e => e.type === 'root_entity' || !e.type); // Fallback
  if (!rootEntity) throw new Error("Root Entity not found in manifest");
  
  // e.g. "ProjectBoard" -> "projectId"
  // Heuristic: Remove suffix like 'Board', 'Brief', 'Blueprint'
  const rootIdKey = rootEntity.name.replace(/Board|Brief|Sheet|Blueprint/, '').toLowerCase() + 'Id';

  // 2. Generate a specific schema for each job defined in manifest
  const jobVariants = (manifest.agent_jobs || []).map(job => {
    return `
  z.object({
    jobType: z.literal('${job.id}'),
    ${rootIdKey}: z.string().uuid().optional(), 
    payload: z.record(z.any()).optional().describe("Input for ${job.id}")
  })`;
  });

  // 3. If no jobs, provide a fallback to prevent compile errors
  if (jobVariants.length === 0) {
    return `export const JobPayloadSchema = z.object({ jobType: z.string(), ${rootIdKey}: z.string().uuid(), payload: z.any() });
export type JobPayload = z.infer<typeof JobPayloadSchema>;`;
  }

  return `
export const JobPayloadSchema = z.discriminatedUnion('jobType', [
${jobVariants.join(',\n')}
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;
`;
}

// --- Strategy Generator Logic ---

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function generateStrategies(manifest: Manifest) {
  if (!fs.existsSync(STRATEGIES_DIR)) {
    fs.mkdirSync(STRATEGIES_DIR, { recursive: true });
  }

  manifest.agent_jobs.forEach(job => {
    // If we have a prompt template, we generate a 'gen-' file. 
    // But for "Seed" manual jobs (no prompt_template), we also want to generate a stub if it doesn't exist.
    // Actually, for the Golden Plan, let's generate stubs for ALL jobs if they don't exist.

    const className = `Generated${toPascalCase(job.id)}`;
    const filePath = path.join(STRATEGIES_DIR, `gen-${job.id}.ts`);
    
    // Check if manual strategy exists (strategies/[id].ts) - if so, skip generation or just rely on registry
    // But here we are generating the "default" implementation.

    const promptTemplate = job.prompt_template || `You are an AI assistant for the system "${manifest.branding?.name || 'Ignite Zero'}".
Task: ${job.description || 'Process the request'}.
Payload: {{payload}}
Return a valid JSON object matching the expected output schema.`;

    const content = `
// AUTO-GENERATED by scaffold-manifest.ts
import { JobExecutor, JobContext } from './types.ts';

export class ${className} implements JobExecutor {
  async execute(context: JobContext): Promise<any> {
    const { payload } = context;
    
    // 1. Interpolate Prompt
    let prompt = \`${promptTemplate}\`;
    // Basic interpolation
    if (payload) {
        Object.keys(payload).forEach(key => {
        const val = typeof payload[key] === 'object' ? JSON.stringify(payload[key]) : payload[key];
        prompt = prompt.replace(new RegExp('{{' + key + '}}', 'g'), val || '');
        });
    }

    // 2. Call LLM (Simplified for seed)
    // Assuming OpenAI is configured in the runner environment
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
       throw new Error("Blocked: OpenAI key missing. Please set OPENAI_API_KEY in your Edge Function secrets.");
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${apiKey}\`
        },
        body: JSON.stringify({
      model: 'gpt-5',
            messages: [{ role: 'system', content: prompt }],
            response_format: { type: "json_object" } 
        })
        });

        if (!response.ok) {
        const err = await response.text();
        throw new Error(\`LLM Call Failed: \${err}\`);
        }

        const data = await response.json();
        try {
            return JSON.parse(data.choices[0].message.content);
        } catch (e) {
            return { raw: data.choices[0].message.content };
        }
    } catch (err) {
        console.error(err);
        return { error: err.message };
    }
  }
}
`;
    // Always overwrite generated strategies to match manifest
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✨ Generated Strategy: ${filePath}`);
  });
}

function generateRegistry(manifest: Manifest) {
  const imports: string[] = [];
  const instantiations: string[] = [];
  const toPascal = (s: string) => s.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

  manifest.agent_jobs.forEach(job => {
    const pascalName = toPascal(job.id);
    const manualPath = path.join(STRATEGIES_DIR, `${job.id}.ts`);
    
    if (fs.existsSync(manualPath)) {
      // Use Manual Strategy
      console.log(`🧠 Found manual strategy for ${job.id}`);
      imports.push(`import { ${pascalName} } from './strategies/${job.id}.ts';`);
      instantiations.push(`  '${job.id}': new ${pascalName}(),`);
    } else {
      // Use Generated Strategy
      const className = `Generated${pascalName}`;
      imports.push(`import { ${className} } from './strategies/gen-${job.id}.ts';`);
      instantiations.push(`  '${job.id}': new ${className}(),`);
    }
  });

  const content = `// supabase/functions/ai-job-runner/registry.ts
// ⚠️ AUTO-GENERATED by scaffold-manifest.ts
import { JobExecutor } from './strategies/types.ts';
${imports.join('\n')}

export const JobRegistry: Record<string, JobExecutor> = {
${instantiations.join('\n')}
};
`;

  fs.writeFileSync(REGISTRY_PATH, content, 'utf-8');
  console.log(`✅ Registry generated at ${REGISTRY_PATH}`);
}


function generateFieldDefinitions(entities: EntityDef[]): string {
  const definitions: Record<string, any[]> = {};
  entities.forEach(entity => {
    definitions[entity.name] = entity.fields.map(f => ({
      key: f.key,
      type: f.type,
      required: f.required,
      description: f.description,
      options: f.options
    }));
  });

  return `export const ENTITY_FIELDS = ${JSON.stringify(definitions, null, 2)} as const;`;
}

function generateJobModes(manifest: Manifest): string {
  const modes: Record<string, string> = {};
  (manifest.agent_jobs || []).forEach(job => {
    modes[job.id] = (job as any).execution_mode || 'async';
  });
  return `export const JOB_MODES = ${JSON.stringify(modes, null, 2)} as const;`;
}

function generateEdgeFunctions(manifest: Manifest): string {
  const edges = manifest.edge_functions || [];
  return `export const EDGE_FUNCTION_SCHEMAS = ${JSON.stringify(edges, null, 2)} as const;`;
}

async function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ Manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }
  const manifestRaw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  
  // Normalize Data Model
  let entities: EntityDef[] = [];
  if (Array.isArray(manifestRaw.data_model)) {
    entities = manifestRaw.data_model;
  } else {
    // Handle new object structure
    const root = (manifestRaw.data_model.root_entities || []).map((e: any) => ({ ...e, type: 'root_entity' }));
    const children = (manifestRaw.data_model.child_entities || []).map((e: any) => ({ ...e, type: 'child_entity' }));
    entities = [...root, ...children];
  }

  // Normalize Fields (name -> key)
  entities = entities.map(e => ({
    ...e,
    fields: e.fields.map((f: any) => ({
      ...f,
      key: f.key || f.name // Support both
    }))
  }));

  // Create Normalized Manifest object
  const manifest: Manifest = {
    ...manifestRaw,
    data_model: entities
  };
  
  const entitySchemas = entities.map(generateEntitySchema).join('\n');
  const jobSchemas = generateJobSchemas(manifest, entities);
  
  const content = `
// ------------------------------------------------------------------
// ⚠️ AUTO-GENERATED FROM system-manifest.json
// ------------------------------------------------------------------
import { z } from 'zod';

${entitySchemas}

// --- Agent Job Contracts (Strict) ---
${jobSchemas}

// --- Entity Field Definitions (for Smart Inputs) ---
${generateFieldDefinitions(entities)}

// --- Job Execution Modes ---
${generateJobModes(manifest)}

// --- Edge Function Schemas (for MCP typing) ---
${generateEdgeFunctions(manifest)}
`;

  fs.writeFileSync(OUTPUT_PATH, content, 'utf-8');
  console.log(`✅ Contracts generated at ${OUTPUT_PATH}`);

  // New Generation Steps
  generateStrategies(manifest);
  generateRegistry(manifest);
}

main();
