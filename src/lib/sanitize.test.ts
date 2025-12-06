import { sanitizeText, sanitizeFields } from './sanitize';

describe('sanitize', () => {
  it('removes angle brackets and control chars', () => {
    const s = sanitizeText('hi<bad>\u0001world');
    expect(s).toBe('hibadworld');
  });

  it('enforces max length', () => {
    const s = sanitizeText('x'.repeat(10), 3);
    expect(s).toBe('xxx');
  });

  it('sanitizes object fields', () => {
    const obj = { a: 'ok', b: 'x<y>', c: 1 } as any;
    const r = sanitizeFields(obj, ['a', 'b']);
    expect(r.a).toBe('ok');
    expect(r.b).toBe('xy');
    expect(r.c).toBe(1);
  });
});


