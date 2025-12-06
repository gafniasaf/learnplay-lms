/**
 * Tests for variant resolution utility
 */

import { resolveVariant, resolveItemContent } from './variantResolution';

describe('resolveVariant', () => {
  const variants = {
    beginner: 'What pumps blood?',
    intermediate: 'What is the primary function of the heart?',
    advanced: 'Describe the cardiac cycle.',
    expert: 'Explain the electrical conduction system of the myocardium.',
  };

  test('resolves to user-selected level if available', () => {
    const result = resolveVariant(variants, 'advanced', 'intermediate');
    expect(result).toBe('Describe the cardiac cycle.');
  });

  test('falls back to default level if user level missing', () => {
    const result = resolveVariant(variants, 'professional' as any, 'intermediate');
    expect(result).toBe('What is the primary function of the heart?');
  });

  test('returns first available variant if both user and default missing', () => {
    const result = resolveVariant(variants, 'professional' as any, 'doctorate' as any);
    expect(result).toBe('What pumps blood?'); // First in object
  });

  test('handles undefined variants gracefully', () => {
    const result = resolveVariant(undefined, 'beginner', 'intermediate');
    expect(result).toBeUndefined();
  });

  test('handles empty variants object', () => {
    const result = resolveVariant({}, 'beginner', 'intermediate');
    expect(result).toBeUndefined();
  });

  test('prioritizes user level over default', () => {
    const result = resolveVariant(variants, 'beginner', 'expert');
    expect(result).toBe('What pumps blood?'); // User level wins
  });
});

describe('resolveItemContent', () => {
  const item = {
    id: 1,
    groupId: 0,
    mode: 'options' as const,
    stem: {
      variants: {
        beginner: 'Simple question?',
        advanced: 'Complex question?',
      },
    },
    options: [
      {
        id: 'a',
        variants: {
          beginner: 'Simple A',
          advanced: 'Complex A',
        },
      },
      {
        id: 'b',
        variants: {
          beginner: 'Simple B',
          advanced: 'Complex B',
        },
      },
    ],
    explanation: {
      variants: {
        beginner: '<p>Simple explanation</p>',
        advanced: '<p>Detailed explanation</p>',
      },
    },
    correctIndex: 0,
  };

  test('resolves all item fields to selected level', () => {
    const resolved = resolveItemContent(item, 'advanced', 'beginner');

    expect(resolved.stem).toBe('Complex question?');
    expect(resolved.options).toEqual([
      { id: 'a', text: 'Complex A' },
      { id: 'b', text: 'Complex B' },
    ]);
    expect(resolved.explanation).toBe('<p>Detailed explanation</p>');
  });

  test('falls back to default level', () => {
    const resolved = resolveItemContent(item, 'expert', 'beginner');

    expect(resolved.stem).toBe('Simple question?');
    expect(resolved.options).toEqual([
      { id: 'a', text: 'Simple A' },
      { id: 'b', text: 'Simple B' },
    ]);
    expect(resolved.explanation).toBe('<p>Simple explanation</p>');
  });

  test('handles legacy format (no variants)', () => {
    const legacyItem = {
      id: 1,
      groupId: 0,
      mode: 'options' as const,
      text: 'Legacy question',
      options: ['Option A', 'Option B'],
      explain: 'Legacy explanation',
      correctIndex: 0,
    };

    const resolved = resolveItemContent(legacyItem as any, 'advanced', 'beginner');

    expect(resolved.stem).toBe('Legacy question');
    expect(resolved.options).toEqual([
      { id: '0', text: 'Option A' },
      { id: '1', text: 'Option B' },
    ]);
    expect(resolved.explanation).toBe('Legacy explanation');
  });

  test('handles numeric mode', () => {
    const numericItem = {
      id: 2,
      groupId: 0,
      mode: 'numeric' as const,
      stem: {
        variants: {
          beginner: 'What is 2+2?',
          advanced: 'Calculate the sum of 2 and 2.',
        },
      },
      answer: 4,
    };

    const resolved = resolveItemContent(numericItem as any, 'advanced', 'beginner');

    expect(resolved.stem).toBe('Calculate the sum of 2 and 2.');
    expect(resolved.answer).toBe(4);
  });

  test('handles missing explanation', () => {
    const itemWithoutExplanation = {
      ...item,
      explanation: undefined,
    };

    const resolved = resolveItemContent(itemWithoutExplanation as any, 'advanced', 'beginner');

    expect(resolved.stem).toBe('Complex question?');
    expect(resolved.explanation).toBeUndefined();
  });

  test('handles mixed variant/legacy options', () => {
    const mixedItem = {
      id: 1,
      groupId: 0,
      mode: 'options' as const,
      stem: {
        variants: {
          beginner: 'Question?',
        },
      },
      options: ['Plain A', 'Plain B'], // Legacy array format
      correctIndex: 0,
    };

    const resolved = resolveItemContent(mixedItem as any, 'beginner', 'beginner');

    expect(resolved.stem).toBe('Question?');
    expect(resolved.options).toEqual([
      { id: '0', text: 'Plain A' },
      { id: '1', text: 'Plain B' },
    ]);
  });
});

