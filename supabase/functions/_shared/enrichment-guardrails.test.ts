import { computeSimilarity, applyEnrichmentGuardrails } from './enrichment-guardrails.ts';

describe('enrichment-guardrails: computeSimilarity', () => {
  it('returns 1.0 when both texts have no keywords', () => {
    expect(computeSimilarity('', '')).toBe(1.0);
  });

  it('returns 0.0 when one side is empty', () => {
    expect(computeSimilarity('Significant content here', '')).toBe(0.0);
  });

  it('is higher for similar texts than dissimilar', () => {
    const a = 'Photosynthesis converts light energy into chemical energy within plant cells';
    const b = 'Plants convert light energy into chemical energy during photosynthesis';
    const c = 'Multiplication is repeated addition in arithmetic problems';

    const simAB = computeSimilarity(a, b);
    const simAC = computeSimilarity(a, c);

    expect(simAB).toBeGreaterThan(simAC);
  });
});

describe('enrichment-guardrails: applyEnrichmentGuardrails', () => {
  const original = [
    { content: '[SECTION:A] Short base text about kidneys' },
    { content: '[SECTION:B] Filtering blood and producing urine' },
  ];

  it('reverts when expansion exceeds cap', () => {
    const enriched = [
      { content: 'A'.repeat(1000) },
      { content: 'B'.repeat(1000) },
    ];

    const result = applyEnrichmentGuardrails(original as any, enriched as any, /*cap*/ 0.10, /*similarity*/ 0.0);
    expect(result.metrics.reverted).toBe(true);
    expect(result.metrics.reason).toBe('expansion_exceeded');
    expect(result.enriched).toBeNull();
  });

  it('reverts when similarity below threshold', () => {
    const enriched = [
      { content: 'Completely unrelated topic about stars and galaxies far away' },
    ];

    const result = applyEnrichmentGuardrails(original as any, enriched as any, /*cap*/ 1.0, /*similarity*/ 0.99);
    expect(result.metrics.reverted).toBe(true);
    expect(result.metrics.reason).toBe('similarity_too_low');
    expect(result.enriched).toBeNull();
  });

  it('accepts enrichment within bounds', () => {
    const enriched = [
      { content: '[SECTION:A] Short base text about kidneys (expanded slightly)' },
      { content: '[SECTION:B] Filtering blood and producing urine with more clarity' },
    ];

    const result = applyEnrichmentGuardrails(original as any, enriched as any, /*cap*/ 0.50, /*similarity*/ 0.5);
    expect(result.metrics.reverted).toBe(false);
    expect(result.enriched).toBe(enriched);
  });
});


