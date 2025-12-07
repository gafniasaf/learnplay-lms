/**
 * Pipeline Phase Extractor Tests
 */

import {
  extractPhaseDetails,
  getCurrentPhaseIndex,
} from '@/lib/pipeline/phaseExtractor';
import type { JobSummary } from '@/lib/pipeline/jobParser';

describe('extractPhaseDetails', () => {
  it('extracts phases for done job', () => {
    const summary: JobSummary = {
      phases: {
        generation: {
          itemsProcessed: 10,
          duration: 5000,
          aiCalls: 1,
        },
        validation: {
          errors: [],
          duration: 1000,
        },
        repair: {
          repairs: [],
          duration: 0,
          aiCalls: 0,
        },
        review: {
          issues: [],
          duration: 2000,
          aiCalls: 0,
        },
        images: {
          pending: 0,
          duration: 0,
        },
        enrichment: {
          guardrailsApplied: 5,
          duration: 1000,
        },
      },
      timeline: [],
    };

    const phases = extractPhaseDetails('done', 'done', summary);

    expect(phases).toHaveLength(6);
    expect(phases[0].status).toBe('complete');
    expect(phases[0].summary).toContain('10 items');
  });

  it('extracts phases for active job', () => {
    const phases = extractPhaseDetails('processing', 'validating', null);

    expect(phases).toHaveLength(6);
    expect(phases[0].status).toBe('complete'); // Generation complete
    expect(phases[1].status).toBe('active'); // Validation active
    expect(phases[2].status).toBe('pending'); // Repair pending
  });

  it('handles failed job', () => {
    const phases = extractPhaseDetails('failed', 'validating', null);

    expect(phases).toHaveLength(6);
    expect(phases[1].status).toBe('failed'); // Validation failed
    expect(phases[0].status).toBe('complete'); // Generation complete
    expect(phases[2].status).toBe('pending'); // Repair pending
  });

  it('handles null summary', () => {
    const phases = extractPhaseDetails('processing', 'generating', null);

    expect(phases).toHaveLength(6);
    expect(phases[0].summary).toBe('Generating course content');
  });

  it('includes repair details when present', () => {
    const summary: JobSummary = {
      phases: {
        repair: {
          repairs: [
            { itemId: 1, issue: 'Missing option', fixed: true },
          ],
          duration: 1000,
          aiCalls: 1,
        },
      },
      timeline: [],
    };

    const phases = extractPhaseDetails('done', 'done', summary);

    expect(phases[2].summary).toContain('Repaired 1 items');
    expect(phases[2].details.repairs).toHaveLength(1);
  });

  it('includes validation errors when present', () => {
    const summary: JobSummary = {
      phases: {
        validation: {
          errors: ['Error 1', 'Error 2'],
          duration: 1000,
        },
      },
      timeline: [],
    };

    const phases = extractPhaseDetails('done', 'done', summary);

    expect(phases[1].summary).toContain('2 validation errors');
    expect(phases[1].details.errors).toEqual(['Error 1', 'Error 2']);
  });
});

describe('getCurrentPhaseIndex', () => {
  it('returns correct phase index for steps', () => {
    expect(getCurrentPhaseIndex('queued')).toBe(-1);
    expect(getCurrentPhaseIndex('generating')).toBe(0);
    expect(getCurrentPhaseIndex('validating')).toBe(1);
    expect(getCurrentPhaseIndex('repairing')).toBe(2);
    expect(getCurrentPhaseIndex('reviewing')).toBe(3);
    expect(getCurrentPhaseIndex('images')).toBe(4);
    expect(getCurrentPhaseIndex('enriching')).toBe(5);
    expect(getCurrentPhaseIndex('storage_write')).toBe(5);
    expect(getCurrentPhaseIndex('catalog_update')).toBe(5);
    expect(getCurrentPhaseIndex('verifying')).toBe(5);
    expect(getCurrentPhaseIndex('done')).toBe(6);
  });

  it('returns -1 for unknown step', () => {
    expect(getCurrentPhaseIndex('unknown')).toBe(-1);
  });
});

