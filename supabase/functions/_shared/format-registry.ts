// Centralized format registry for CourseEnvelope.content validation
// Minimal initial formats with evolvable versioning.

// deno-lint-ignore no-explicit-any
export type Json = any;

export type FormatId = 'practice';

export interface FormatDescriptor {
  id: FormatId;
  version: number;
  // Minimal shape summary for clients; validator is enforced on the server.
  summary: {
    requiredContentKeys: string[];
  };
}

// Declarative merge-policy config per format. This is intentionally simple and
// JSON-serializable so it can be surfaced via get-format-registry for tooling.
export interface MergeRuleConfig {
  // When true, /id cannot be replaced or removed by JSON Patch operations.
  disallowIdChange?: boolean;
  // Root-level JSON Pointer paths that cannot be replaced/removed/added by patches.
  disallowedRootPaths?: string[];
  // When true, allow appending items via `/items/-` while still preventing whole-array overrides.
  allowItemsAppendOnly?: boolean;
}

export interface FormatRegistry {
  formats: FormatDescriptor[];
  mergeRules: Record<FormatId, MergeRuleConfig>;
}

const registry: FormatRegistry = {
  formats: [
    {
      id: 'practice',
      version: 1,
      summary: {
        requiredContentKeys: ['items'],
      },
    },
  ],
  mergeRules: {
    practice: {
      disallowIdChange: true,
      disallowedRootPaths: ['/items', '/groups', '/levels'],
      allowItemsAppendOnly: true,
    },
  },
};

export function getFormatRegistry(): FormatRegistry {
  return registry;
}

// Validate content for a given format id. Keep logic internal and evolvable.
export function validateContentByFormat(format: string, content: Json): { ok: true } | { ok: false; issues: string[] } {
  try {
    switch (format) {
      case 'practice': {
        if (typeof content !== 'object' || content === null) {
          return { ok: false, issues: ['content must be an object'] };
        }
        if (!Array.isArray((content as Record<string, unknown>).items)) {
          return { ok: false, issues: ['content.items must be an array'] };
        }
        // Validate minimal item shape for safety without over-constraining
        const items = (content as Record<string, unknown>).items as Json[];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (typeof it !== 'object' || it === null) {
            return { ok: false, issues: [`items[${i}] must be an object`] };
          }
          if (typeof (it as Record<string, unknown>).id === 'undefined') {
            return { ok: false, issues: [`items[${i}].id is required`] };
          }
          const mode = (it as Record<string, unknown>).mode;
          if (typeof mode !== 'string') {
            return { ok: false, issues: [`items[${i}].mode must be a string`] };
          }
          if (mode === 'options') {
            const options = (it as Record<string, unknown>).options;
            if (!Array.isArray(options) || (options as unknown[]).length < 2) {
              return { ok: false, issues: [`items[${i}].options must be an array with at least 2 entries`] };
            }
          }
        }
        return { ok: true };
      }
      default:
        // Unknown formats are allowed but not strictly validated yet.
        return { ok: true };
    }
  } catch (e) {
    return { ok: false, issues: [(e as Error)?.message || 'unknown error'] };
  }
}


