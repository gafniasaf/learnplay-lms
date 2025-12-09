/**
 * Utils CN Function Tests
 * Tests for the cn() class name utility function
 */

import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    const conditionFalse = false;
    const conditionTrue = true;
    expect(cn('foo', conditionFalse && 'bar', 'baz')).toBe('foo baz');
    expect(cn('foo', conditionTrue && 'bar', 'baz')).toBe('foo bar baz');
  });

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, 'bar', null, 'baz')).toBe('foo bar baz');
  });

  it('merges Tailwind classes correctly', () => {
    // twMerge should deduplicate conflicting Tailwind classes
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('handles objects', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles mixed inputs', () => {
    expect(cn('foo', ['bar', 'baz'], { qux: true, quux: false })).toBe('foo bar baz qux');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
    expect(cn(null, undefined, false)).toBe('');
  });

  it('preserves non-conflicting classes', () => {
    expect(cn('text-red-500', 'font-bold', 'text-lg')).toBe('text-red-500 font-bold text-lg');
  });
});

