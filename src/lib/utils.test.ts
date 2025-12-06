import { cn } from './utils';

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('p-2', 'p-4', false && 'hidden', undefined, 'text-sm')).toBe('p-4 text-sm');
  });
});


