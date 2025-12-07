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

  it('handles summary without timeline', () => {
    const summary: JobSummary = {
      phases: {
        generation: {
          itemsProcessed: 5,
          duration: 1000,
          aiCalls: 1,
        },
      },
      // No timeline property
    } as any;

    const phases = extractPhaseDetails('done', 'done', summary);

    expect(phases[0].details.logs).toEqual([]);
    expect(phases[1].details.logs).toEqual([]);
  });

  it('filters timeline logs by phase', () => {
    const summary: JobSummary = {
      phases: {},
      timeline: [
        { phase: 'generation', timestamp: '10:00:00', message: 'Gen log', type: 'info' },
        { phase: 'validation', timestamp: '10:01:00', message: 'Val log', type: 'info' },
        { phase: 'repair', timestamp: '10:02:00', message: 'Repair log', type: 'info' },
        { phase: 'review', timestamp: '10:03:00', message: 'Review log', type: 'info' },
        { phase: 'images', timestamp: '10:04:00', message: 'Image log', type: 'info' },
        { phase: 'enrichment', timestamp: '10:05:00', message: 'Enrich log', type: 'info' },
      ],
    };

    const phases = extractPhaseDetails('done', 'done', summary);

    expect(phases[0].details.logs).toHaveLength(1);
    expect(phases[0].details.logs?.[0].message).toBe('Gen log');
    expect(phases[1].details.logs).toHaveLength(1);
    expect(phases[1].details.logs?.[0].message).toBe('Val log');
    expect(phases[2].details.logs).toHaveLength(1);
    expect(phases[2].details.logs?.[0].message).toBe('Repair log');
    expect(phases[3].details.logs).toHaveLength(1);
    expect(phases[3].details.logs?.[0].message).toBe('Review log');
    expect(phases[4].details.logs).toHaveLength(1);
    expect(phases[4].details.logs?.[0].message).toBe('Image log');
    expect(phases[5].details.logs).toHaveLength(1);
    expect(phases[5].details.logs?.[0].message).toBe('Enrich log');
  });

  it('handles images phase with pending count', () => {
    const summary: JobSummary = {
      phases: {
        images: {
          pending: 3,
          duration: 1000,
        },
      },
      timeline: [],
    };

    const phases = extractPhaseDetails('done', 'done', summary);

    expect(phases[4].summary).toContain('3 images pending');
  });

  it('handles enrichment phase with guardrails', () => {
    const summary: JobSummary = {
      phases: {
        enrichment: {
          guardrailsApplied: 7,
          duration: 2000,
        },
      },
      timeline: [],
    };

    const phases = extractPhaseDetails('done', 'done', summary);

    expect(phases[5].summary).toContain('Applied 7 guardrails');
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

describe('determinePhaseStatus (via extractPhaseDetails)', () => {
  it('marks failed phase correctly', () => {
    const phases = extractPhaseDetails('failed', 'validating', null);
    expect(phases[1].status).toBe('failed'); // Validation phase failed
    expect(phases[0].status).toBe('complete'); // Generation complete before failure
    expect(phases[2].status).toBe('pending'); // Repair pending
  });

  it('marks phases before failed phase as complete', () => {
    const phases = extractPhaseDetails('failed', 'repairing', null);
    expect(phases[0].status).toBe('complete'); // Generation complete
    expect(phases[1].status).toBe('complete'); // Validation complete
    expect(phases[2].status).toBe('failed'); // Repair failed
    expect(phases[3].status).toBe('pending'); // Review pending
  });

  it('marks all phases as complete when job is done', () => {
    const phases = extractPhaseDetails('done', 'done', null);
    phases.forEach(phase => {
      expect(phase.status).toBe('complete');
    });
  });

  it('marks active phase correctly', () => {
    const phases = extractPhaseDetails('processing', 'generating', null);
    expect(phases[0].status).toBe('active'); // Generation active
    expect(phases[1].status).toBe('pending'); // Validation pending
  });

  it('marks phases before active as complete', () => {
    const phases = extractPhaseDetails('processing', 'repairing', null);
    expect(phases[0].status).toBe('complete'); // Generation complete
    expect(phases[1].status).toBe('complete'); // Validation complete
    expect(phases[2].status).toBe('active'); // Repair active
    expect(phases[3].status).toBe('pending'); // Review pending
  });
});

