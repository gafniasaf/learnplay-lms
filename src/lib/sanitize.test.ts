import { sanitizeText, sanitizeFields } from './sanitize';

describe('sanitizeText', () => {
  it('removes angle brackets and control chars', () => {
    const s = sanitizeText('hi<bad>\u0001world');
    expect(s).toBe('hibadworld');
  });

  it('enforces max length', () => {
    const s = sanitizeText('x'.repeat(10), 3);
    expect(s).toBe('xxx');
  });

  it('handles empty string', () => {
    expect(sanitizeText('')).toBe('');
  });

  it('handles null and undefined', () => {
    expect(sanitizeText(null as any)).toBe('');
    expect(sanitizeText(undefined as any)).toBe('');
  });

  it('handles non-string inputs', () => {
    expect(sanitizeText(123 as any)).toBe('');
    expect(sanitizeText({} as any)).toBe('');
    expect(sanitizeText([] as any)).toBe('');
  });

  it('removes all control characters', () => {
    const controlChars = '\u0000\u0001\u0002\u0003\u001F\u007F';
    expect(sanitizeText(`text${controlChars}more`)).toBe('textmore');
  });

  it('removes angle brackets', () => {
    expect(sanitizeText('text<script>alert("xss")</script>more')).toBe('textscriptalert("xss")/scriptmore');
    expect(sanitizeText('text<img src="x">more')).toBe('textimg src="x"more');
  });

  it('handles very long strings', () => {
    const long = 'x'.repeat(10000);
    const result = sanitizeText(long, 2000);
    expect(result.length).toBe(2000);
  });

  it('uses default max length of 2000', () => {
    const long = 'x'.repeat(3000);
    const result = sanitizeText(long);
    expect(result.length).toBe(2000);
  });

  it('preserves valid characters', () => {
    const valid = 'Hello World 123 !@#$%^&*()_+-=[]{}|;:,./?';
    expect(sanitizeText(valid)).toBe(valid);
  });

  it('handles Unicode characters', () => {
    const unicode = 'Hello 世界 🌍';
    expect(sanitizeText(unicode)).toBe(unicode);
  });
});

describe('sanitizeFields', () => {
  it('sanitizes object fields', () => {
    const obj = { a: 'ok', b: 'x<y>', c: 1 } as any;
    const r = sanitizeFields(obj, ['a', 'b']);
    expect(r.a).toBe('ok');
    expect(r.b).toBe('xy');
    expect(r.c).toBe(1);
  });

  it('only sanitizes specified fields', () => {
    const obj = { a: 'x<y>', b: 'x<y>', c: 'x<y>' } as any;
    const r = sanitizeFields(obj, ['a']);
    expect(r.a).toBe('xy');
    expect(r.b).toBe('x<y>'); // Not sanitized
    expect(r.c).toBe('x<y>'); // Not sanitized
  });

  it('handles non-string fields gracefully', () => {
    const obj = { a: 'x<y>', b: 123, c: null, d: undefined } as any;
    const r = sanitizeFields(obj, ['a', 'b', 'c', 'd']);
    expect(r.a).toBe('xy');
    expect(r.b).toBe(123); // Not changed
    expect(r.c).toBe(null); // Not changed
    expect(r.d).toBe(undefined); // Not changed
  });

  it('returns new object without mutating original', () => {
    const obj = { a: 'x<y>', b: 'ok' } as any;
    const r = sanitizeFields(obj, ['a']);
    expect(obj.a).toBe('x<y>'); // Original unchanged
    expect(r.a).toBe('xy'); // New object sanitized
    expect(r).not.toBe(obj); // Different object
  });

  it('handles empty fields array', () => {
    const obj = { a: 'x<y>', b: 'x<y>' } as any;
    const r = sanitizeFields(obj, []);
    expect(r.a).toBe('x<y>'); // Not sanitized
    expect(r.b).toBe('x<y>'); // Not sanitized
  });

  it('respects max length parameter', () => {
    const obj = { a: 'x'.repeat(100) } as any;
    const r = sanitizeFields(obj, ['a'], 10);
    expect(r.a.length).toBe(10);
  });
});


