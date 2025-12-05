/**
 * Game Logic Tests
 * 
 * Tests for the pure game logic functions.
 */

import { describe, it, expect } from 'vitest';
import { nextVariant, resolveOnWrong } from './gameLogic';
import type { Course, CourseItem } from '@/lib/types/course';

describe('nextVariant', () => {
  it('should rotate 1 -> 2', () => {
    expect(nextVariant('1')).toBe('2');
  });

  it('should rotate 2 -> 3', () => {
    expect(nextVariant('2')).toBe('3');
  });

  it('should rotate 3 -> 1', () => {
    expect(nextVariant('3')).toBe('1');
  });
});

describe('resolveOnWrong', () => {
  const baseItem: CourseItem = {
    id: 1,
    groupId: 1,
    text: 'Question text _',
    explain: 'Explanation',
    clusterId: 'cluster-1',
    variant: '1',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
  };

  const variant2Item: CourseItem = {
    ...baseItem,
    id: 2,
    variant: '2',
  };

  const variant3Item: CourseItem = {
    ...baseItem,
    id: 3,
    variant: '3',
  };

  const mockCatalog: Course = {
    id: 'test-course',
    title: 'Test Course',
    levels: [{ id: 1, title: 'Level 1', start: 1, end: 3 }],
    groups: [{ id: 1, name: 'Group 1' }],
    items: [baseItem, variant2Item, variant3Item],
  };

  it('should return next variant when cluster has variants', () => {
    const pool = [baseItem];
    const variantMap = new Map<string, number>();

    const result = resolveOnWrong(baseItem, pool, mockCatalog, variantMap);

    expect(result.itemToEnqueue.variant).toBe('2');
    expect(result.nextVariantNum).toBe(2);
  });

  it('should rotate through variants: 1 -> 2 -> 3 -> 1', () => {
    const pool = [baseItem];
    const variantMap = new Map<string, number>();
    variantMap.set('cluster-1', 2); // Last used was variant 2

    const result = resolveOnWrong(baseItem, pool, mockCatalog, variantMap);

    expect(result.itemToEnqueue.variant).toBe('3');
    expect(result.nextVariantNum).toBe(3);
  });

  it('should wrap from 3 back to 1', () => {
    const pool = [variant3Item];
    const variantMap = new Map<string, number>();
    variantMap.set('cluster-1', 3); // Last used was variant 3

    const result = resolveOnWrong(variant3Item, pool, mockCatalog, variantMap);

    expect(result.itemToEnqueue.variant).toBe('1');
    expect(result.nextVariantNum).toBe(1);
  });

  it('should return current item if no cluster', () => {
    const noClusterItem: CourseItem = {
      ...baseItem,
      clusterId: '',
      variant: '',
    };
    const pool = [noClusterItem];
    const variantMap = new Map<string, number>();

    const result = resolveOnWrong(noClusterItem, pool, mockCatalog, variantMap);

    expect(result.itemToEnqueue).toBe(noClusterItem);
    expect(result.nextVariantNum).toBeUndefined();
  });

  it('should return current item if next variant not found', () => {
    const isolatedItem: CourseItem = {
      ...baseItem,
      clusterId: 'isolated-cluster',
    };
    const catalogWithIsolated: Course = {
      ...mockCatalog,
      items: [isolatedItem], // Only one item in cluster
    };
    const pool = [isolatedItem];
    const variantMap = new Map<string, number>();

    const result = resolveOnWrong(isolatedItem, pool, catalogWithIsolated, variantMap);

    expect(result.itemToEnqueue).toBe(isolatedItem);
    expect(result.nextVariantNum).toBeUndefined();
  });
});



