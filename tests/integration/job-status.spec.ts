/**
 * Integration-lite: Job status parsing (no network)
 *
 * Verifies job summary parsing and status handling without hitting Supabase.
 */

import { describe, it, expect } from 'vitest';
import { parseJobSummary, createDefaultSummary } from '@/lib/pipeline/jobParser';

describe('Job Status Parsing', () => {
  it('parses summary with phases and metrics', () => {
    const summary = {
      phases: {
        generation: { duration: 10, aiCalls: 2, itemsProcessed: 4 },
        validation: { duration: 5, errors: [] },
      },
      metrics: { totalItems: 4, totalRepairs: 0, totalAICalls: 2, estimatedCost: 0.12 },
      timeline: [
        { timestamp: '2025-01-01T00:00:00Z', phase: 'generation', message: 'started', type: 'info' },
      ],
    };

    const parsed = parseJobSummary(summary);
    expect(parsed?.phases.generation?.itemsProcessed).toBe(4);
    expect(parsed?.metrics.totalItems).toBe(4);
    expect(parsed?.timeline).toHaveLength(1);
  });

  it('handles missing summary gracefully', () => {
    const parsed = parseJobSummary(null);
    expect(parsed).toBeNull();
  });

  it('provides default summary when none present', () => {
    const def = createDefaultSummary();
    expect(def.metrics.totalItems).toBe(0);
    expect(def.timeline).toEqual([]);
  });
});

