/**
 * Unit tests for shared generation utilities
 */

import { extractJsonFromText, normalizeOptionsItem, normalizeNumericItem, countPlaceholders } from './generation-utils.ts';

describe('generation-utils: extractJsonFromText', () => {
  it('parses fenced ```json blocks', () => {
    const input = 'some text```json\n{"a":1,"b":[2,3]}\n```more';
    const out = extractJsonFromText(input);
    expect(out).toEqual({ a: 1, b: [2, 3] });
  });

  it('repairs trailing commas and comments', () => {
    const input = `{
      // comment
      "a": 1,
      "b": [1,2,3,],
    }`;
    const out = extractJsonFromText(input);
    expect(out).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('extracts balanced object region', () => {
    const input = 'START {"x": {"y": [1,2,3]}} TRAIL';
    const out = extractJsonFromText(input);
    expect(out).toEqual({ x: { y: [1, 2, 3] } });
  });

  it('extracts balanced region when array contains object (prefers first object)', () => {
    const input = 'noise [1, {"a":2}, 3] end';
    const out = extractJsonFromText(input);
    // Implementation extracts first balanced object region inside
    expect(out).toEqual({ a: 2 });
  });

  it('supports <json> tags', () => {
    const input = '<json>{"ok":true}</json>';
    expect(extractJsonFromText(input)).toEqual({ ok: true });
  });
});

describe('generation-utils: normalizeOptionsItem', () => {
  it('converts underscores to [blank] and collapses multiples', () => {
    const item: any = { mode: 'options', text: 'Pick __ the _ answer', options: ['A','B','C'], correctIndex: 0 };
    const out = normalizeOptionsItem(item);
    expect(countPlaceholders(out.text)).toBe(1);
    expect(out.text).toContain('[blank]');
  });

  it('inserts [blank] before correct answer if present', () => {
    const item: any = { mode: 'options', text: 'The answer is A', options: ['A','B','C'], correctIndex: 0 };
    const out = normalizeOptionsItem(item);
    expect(out.text).toContain('[blank]');
  });
});

describe('generation-utils: normalizeNumericItem', () => {
  it('removes options/correctIndex and enforces single [blank]', () => {
    const item: any = { mode: 'numeric', text: '12 + 3 = __', options: ['15'], correctIndex: 0 };
    const out = normalizeNumericItem(item);
    expect(out.options).toBeUndefined();
    expect(out.correctIndex).toBeUndefined();
    expect(countPlaceholders(out.text)).toBe(1);
  });

  it('inserts [blank] around equals sign if missing', () => {
    const item: any = { mode: 'numeric', text: '5 × 3 =', answer: 15 };
    const out = normalizeNumericItem(item);
    expect(out.text).toMatch(/= \[blank\]$/);
  });
});
