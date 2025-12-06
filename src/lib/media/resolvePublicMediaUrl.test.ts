import { resolvePublicMediaUrl, appendVersion } from './resolvePublicMediaUrl';

describe('resolvePublicMediaUrl', () => {
  test('returns absolute http url with version appended', () => {
    const out = resolvePublicMediaUrl('https://cdn.example.com/a.png', '123');
    expect(out).toMatch(/^https:\/\/cdn\.example\.com\/a\.png(\?|&)v=123/);
  });

  test('returns data url unchanged except version', () => {
    const data = 'data:image/png;base64,AAA=';
    const out = resolvePublicMediaUrl(data, 'v1');
    expect(out).toContain('data:image/png;base64,AAA=');
    expect(out).toContain('v=v1');
  });

  test('resolves courses/ path via supabase public url and appends version', () => {
    const out = resolvePublicMediaUrl('courses/user1/img.png', 'etag');
    expect(out).toMatch(/^https:\/\/example\.com\/user1\/img\.png(\?|&)v=etag/);
  });
});

describe('appendVersion', () => {
  test('appends as query param when no query', () => {
    expect(appendVersion('https://x/y.png', 'a')).toBe('https://x/y.png?v=a');
  });
  test('appends using & when query exists', () => {
    expect(appendVersion('https://x/y.png?q=1', 'a')).toBe('https://x/y.png?q=1&v=a');
  });
});
