import { cn } from './utils';

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    const shouldHide = false;
    expect(cn('p-2', 'p-4', shouldHide && 'hidden', undefined, 'text-sm')).toBe('p-4 text-sm');
  });
});


