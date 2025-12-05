import manifest from '../../system-manifest.json';

type SystemManifest = typeof manifest;

interface GraphOptions {
  title?: string;
}

const sanitizeId = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, '_');

const sanitizeLabel = (value?: string) => value?.replace(/"/g, '\\"') ?? '';

const DEFAULT_GRAPH = `graph TD
  notice["No manifest definitions detected"]:::empty
  classDef empty fill:#0f172a,stroke:#475569,color:#94a3b8;
`;

export const manifestToMermaid = (
  data?: SystemManifest,
  options?: GraphOptions,
) => {
  if (!data) return DEFAULT_GRAPH;

  const lines: string[] = [
    'graph TD',
    '  %% Styling',
    '  classDef entity fill:#0f172a,stroke:#34d399,stroke-width:2px,color:#e2e8f0;',
    '  classDef jobNode fill:#065f46,stroke:#34d399,stroke-width:2px,color:#d1fae5;',
    '  classDef field fill:#111827,stroke:#334155,color:#94a3b8;',
    '  classDef relation fill:#0f172a,stroke:#64748b,color:#cbd5f5;',
  ];

  const rawModel = data.data_model;
  // Support both array format and object format with root_entities/child_entities
  const model = Array.isArray(rawModel) 
    ? rawModel 
    : [...(rawModel?.root_entities ?? []), ...(rawModel?.child_entities ?? [])];
  const jobs = data.agent_jobs ?? [];

  if (!model.length && !jobs.length) {
    return DEFAULT_GRAPH;
  }

  model.forEach((entity: any) => {
    const entityId = sanitizeId(entity.name);
    lines.push(`  subgraph ${entityId}["${sanitizeLabel(entity.name)}"]`);
    lines.push(`    ${entityId}:::entity`);

    (entity.fields ?? []).forEach((field) => {
      const fieldId = `${entityId}_${sanitizeId(field.key)}`;
      const required = (field as any)?.required ? ' *' : '';
      const typeLabel = field.type ? ` : ${field.type}` : '';
      lines.push(
        `    ${fieldId}["${sanitizeLabel(field.key + typeLabel + required)}"]:::field`,
      );
      lines.push(`    ${entityId} --> ${fieldId}`);
    });

    lines.push('  end');
  });

  jobs.forEach((job: any) => {
    const jobId = `job_${sanitizeId(job.id)}`;
    const targetId = sanitizeId(job.target_entity ?? job.id);
    const label = job.ui?.label || job.id;
    lines.push(`  ${jobId}(["${sanitizeLabel(label)}"]):::jobNode`);
    if (job.target_entity) {
      lines.push(`  ${jobId} --> ${targetId}`);
    }
  });

  if (options?.title) {
    lines.push(`  class ${sanitizeId(options.title)} relation;`);
  }

  return lines.join('\n');
};


