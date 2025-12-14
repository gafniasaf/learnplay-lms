/**
 * Unit Tests: jobParser
 */

import { parseJobSummary, createDefaultSummary } from '@/lib/pipeline/jobParser';

describe('parseJobSummary', () => {
  const validSummary = {
    metrics: {
      totalItems: 1,
      totalRepairs: 0,
      totalAICalls: 0,
      estimatedCost: 0,
    },
    phases: {},
    timeline: [
      { timestamp: '2025-01-01T00:00:00Z', phase: 'init', message: 'Starting', type: 'info' },
    ],
  };

  it('returns null for null summary', () => {
    expect(parseJobSummary(null)).toBeNull();
  });

  it('parses JSON string', () => {
    const summary = '{"metrics":{"totalItems":1,"totalRepairs":0,"totalAICalls":0,"estimatedCost":0},"phases":{},"timeline":[]}';
    const parsed = parseJobSummary(summary);
    expect(parsed).not.toBeNull();
    expect(parsed?.metrics.totalItems).toBe(1);
  });

  it('returns object directly', () => {
    const obj = { 
      metrics: { 
        totalItems: 2, 
        totalRepairs: 0, 
        totalAICalls: 0, 
        estimatedCost: 0 
      }, 
      phases: {}, 
      timeline: [] 
    };
    const parsed = parseJobSummary(obj);
    expect(parsed).not.toBeNull();
    expect(parsed?.metrics.totalItems).toBe(2);
  });

  it('returns null on invalid JSON', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const parsed = parseJobSummary('{invalid');
    expect(parsed).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to parse job summary:',
      expect.any(String)
    );
    consoleWarnSpy.mockRestore();
  });

  // Test structure validation failures
  it('returns null when phases is missing', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { metrics: validSummary.metrics, timeline: [] };
    expect(parseJobSummary(invalid)).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Job summary does not match expected structure:',
      expect.stringContaining('Missing or invalid properties')
    );
    consoleWarnSpy.mockRestore();
  });

  it('returns null when metrics is missing', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { phases: {}, timeline: [] };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline is missing', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { phases: {}, metrics: validSummary.metrics };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when phases is an array', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { phases: [], metrics: validSummary.metrics, timeline: [] };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when phases is null', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { phases: null, metrics: validSummary.metrics, timeline: [] };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when metrics is an array', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { phases: {}, metrics: [], timeline: [] };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when metrics is null', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { phases: {}, metrics: null, timeline: [] };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline is not an array', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = { phases: {}, metrics: validSummary.metrics, timeline: {} };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  // Test metrics validation failures
  it('returns null when metrics.totalItems is not a number', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: { totalItems: 'invalid', totalRepairs: 0, totalAICalls: 0, estimatedCost: 0 },
      timeline: [],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when metrics.totalRepairs is not a number', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: { totalItems: 1, totalRepairs: 'invalid', totalAICalls: 0, estimatedCost: 0 },
      timeline: [],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when metrics.totalAICalls is not a number', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: { totalItems: 1, totalRepairs: 0, totalAICalls: 'invalid', estimatedCost: 0 },
      timeline: [],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when metrics.estimatedCost is not a number', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: { totalItems: 1, totalRepairs: 0, totalAICalls: 0, estimatedCost: 'invalid' },
      timeline: [],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  // Test timeline item validation failures
  it('returns null when timeline item is null', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: validSummary.metrics,
      timeline: [null],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline item is not an object', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: validSummary.metrics,
      timeline: ['string'],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline item missing timestamp', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: validSummary.metrics,
      timeline: [{ phase: 'init', message: 'msg', type: 'info' }],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline item timestamp is not string', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: validSummary.metrics,
      timeline: [{ timestamp: 123, phase: 'init', message: 'msg', type: 'info' }],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline item phase is not string', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: validSummary.metrics,
      timeline: [{ timestamp: '2025-01-01', phase: 123, message: 'msg', type: 'info' }],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline item message is not string', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: validSummary.metrics,
      timeline: [{ timestamp: '2025-01-01', phase: 'init', message: 123, type: 'info' }],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  it('returns null when timeline item type is not string', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalid = {
      phases: {},
      metrics: validSummary.metrics,
      timeline: [{ timestamp: '2025-01-01', phase: 'init', message: 'msg', type: 123 }],
    };
    expect(parseJobSummary(invalid)).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  // Test non-object parsed value
  it('returns null when parsed value is not an object', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(parseJobSummary('"just a string"')).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Job summary does not match expected structure:',
      expect.stringContaining('Invalid type')
    );
    consoleWarnSpy.mockRestore();
  });

  it('returns null when parsed value is a number', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    expect(parseJobSummary('123')).toBeNull();
    consoleWarnSpy.mockRestore();
  });

  // Test valid complex summary
  it('parses valid summary with all phases', () => {
    const fullSummary = {
      phases: {
        generation: { duration: 1000, aiCalls: 5, itemsProcessed: 10 },
        validation: { duration: 100, errors: ['error1'] },
        repair: { duration: 200, aiCalls: 2, repairs: [{ itemId: 1, text: 't', issue: 'i', fix: 'f' }] },
        review: { duration: 50, aiCalls: 1, issues: [] },
        images: { duration: 500, pending: 3, note: 'processing' },
        enrichment: { duration: 75, guardrailsApplied: 2 },
      },
      metrics: { totalItems: 10, totalRepairs: 1, totalAICalls: 8, estimatedCost: 0.05 },
      timeline: [
        { timestamp: '2025-01-01T00:00:00Z', phase: 'init', message: 'Starting', type: 'info' },
        { timestamp: '2025-01-01T00:01:00Z', phase: 'done', message: 'Complete', type: 'success' },
      ],
    };
    const parsed = parseJobSummary(fullSummary);
    expect(parsed).not.toBeNull();
    expect(parsed?.phases.generation?.itemsProcessed).toBe(10);
    expect(parsed?.timeline).toHaveLength(2);
  });
});

describe('createDefaultSummary', () => {
  it('returns empty phases and metrics zeroed', () => {
    const summary = createDefaultSummary();
    expect(summary.phases).toEqual({});
    expect(summary.metrics.totalItems).toBe(0);
    expect(summary.timeline).toEqual([]);
  });
});

