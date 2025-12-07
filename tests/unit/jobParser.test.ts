/**
 * Unit Tests: jobParser
 */

import { parseJobSummary, createDefaultSummary } from '@/lib/pipeline/jobParser';

describe('parseJobSummary', () => {
  it('returns null for null summary', () => {
    expect(parseJobSummary(null)).toBeNull();
  });

  it('parses JSON string', () => {
    const summary = '{"metrics":{"totalItems":1},"phases":{},"timeline":[]}';
    const parsed = parseJobSummary(summary);
    expect(parsed).not.toBeNull();
    expect(parsed?.metrics.totalItems).toBe(1);
  });

  it('returns object directly', () => {
    const obj = { metrics: { totalItems: 2 }, phases: {}, timeline: [] };
    const parsed = parseJobSummary(obj);
    expect(parsed?.metrics.totalItems).toBe(2);
  });

  it('returns null on invalid JSON', () => {
    const parsed = parseJobSummary('{invalid');
    expect(parsed).toBeNull();
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

