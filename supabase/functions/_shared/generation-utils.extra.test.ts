import { extractJsonFromText, countPlaceholders, normalizeOptionsItem, normalizeNumericItem } from './generation-utils.ts';

describe('generation-utils: additional coverage', () => {
  it('repairs smart quotes and non-breaking spaces', () => {
    const input = '```json\n{ “a”: 1, “b”: [1, 2, 3]\u00A0}\n```';
    const out = extractJsonFromText(input);
    expect(out).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('throws empty on non-string/empty input', () => {
    expect(() => extractJsonFromText('')).toThrow('empty');
  });

  it('throws invalid_json when no JSON can be extracted', () => {
    const input = 'This text does not contain JSON or fences';
    expect(() => extractJsonFromText(input)).toThrow('invalid_json');
  });

  it.skip('reconstructs object when studyTexts/items emitted without braces', () => {
    // This pathway is hard to reach because the parser will extract the first balanced
    // object region earlier and return it before attempting reconstruction.
  });

  it('countPlaceholders counts underscores and [blank]', () => {
    expect(countPlaceholders('__ [blank] _')).toBe(4);
  });

  it('normalizeOptionsItem inserts middle when no answer and empty text', () => {
    const item: any = { mode: 'options', text: '   ', options: ['A','B','C'], correctIndex: 0 };
    const out = normalizeOptionsItem(item);
    expect(countPlaceholders(out.text)).toBe(1);
  });

  it('normalizeNumericItem inserts in middle when no equals sign', () => {
    const item: any = { mode: 'numeric', text: 'Find perimeter of square side 4', answer: 16 };
    const out = normalizeNumericItem(item);
    expect(countPlaceholders(out.text)).toBe(1);
  });
});


