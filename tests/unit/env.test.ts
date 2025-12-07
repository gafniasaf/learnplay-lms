/**
 * Environment Configuration Tests
 * 
 * Note: These tests verify the structure and basic behavior of env functions.
 * Full integration testing requires browser environment.
 */

import {
  getApiMode,
  forceSameOriginPreview,
  getEmbedAllowedOrigins,
} from '@/lib/env';

describe('getApiMode', () => {
  it('returns either "live" or "mock"', () => {
    const mode = getApiMode();
    expect(['live', 'mock']).toContain(mode);
  });
});

describe('forceSameOriginPreview', () => {
  it('returns a boolean', () => {
    const result = forceSameOriginPreview();
    expect(typeof result).toBe('boolean');
  });
});

describe('getEmbedAllowedOrigins', () => {
  it('returns an array', () => {
    const origins = getEmbedAllowedOrigins();
    expect(Array.isArray(origins)).toBe(true);
  });

  it('returns array of strings', () => {
    const origins = getEmbedAllowedOrigins();
    origins.forEach(origin => {
      expect(typeof origin).toBe('string');
    });
  });
});

