/**
 * Utility Functions Tests
 */

import { cn } from '@/lib/utils';

describe('cn (className merge utility)', () => {
  it('merges single class', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges multiple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles undefined values', () => {
    expect(cn('foo', undefined, 'bar')).toBe('foo bar');
  });

  it('handles null values', () => {
    expect(cn('foo', null, 'bar')).toBe('foo bar');
  });

  it('handles false values', () => {
    expect(cn('foo', false, 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });

  it('merges tailwind classes intelligently', () => {
    // tailwind-merge should keep only the last conflicting class
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles object syntax', () => {
    expect(cn({ foo: true, bar: false })).toBe('foo');
  });

  it('handles array syntax', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles complex combinations', () => {
    const result = cn(
      'base-class',
      ['array-class'],
      { 'object-true': true, 'object-false': false },
      undefined,
      'final-class'
    );
    expect(result).toContain('base-class');
    expect(result).toContain('array-class');
    expect(result).toContain('object-true');
    expect(result).not.toContain('object-false');
    expect(result).toContain('final-class');
  });

  it('returns empty string for no valid inputs', () => {
    expect(cn(undefined, null, false)).toBe('');
  });
});



