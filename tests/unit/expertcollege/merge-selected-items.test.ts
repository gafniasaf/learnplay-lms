import { describe, expect, it } from '@jest/globals';
import { mergeExpertcollegeGeneratedExercises } from '@/pages/admin/expertcollege/mergeExpertcollegeGeneratedExercises';

describe('Expertcollege merge selected items', () => {
  it('appends items, creates group if missing, and assigns new ids', () => {
    const target = {
      id: 'c1',
      groups: [{ id: 1, name: 'Group 1' }],
      items: [{ id: 10, groupId: 1, text: 'Q', options: ['a', 'b', 'c'], correctIndex: 0, explain: '', clusterId: 'c', variant: 'a' }],
    };

    const selected = [
      {
        relatedStudyTextId: 'st-1',
        item: { id: 1, groupId: 999, text: 'New', options: ['x', 'y', 'z'], correctIndex: 1, explain: 'e', clusterId: 'k', variant: 'v' },
      },
      {
        relatedStudyTextId: 'st-2',
        item: { id: 2, groupId: 999, text: 'New2', options: ['x', 'y', 'z'], correctIndex: 2, explain: 'e', clusterId: 'k', variant: 'v' },
      },
    ];

    const { nextGroups, nextItems } = mergeExpertcollegeGeneratedExercises({ targetCourse: target, selected });
    expect(nextGroups.some((g) => g.name === 'Expertcollege Generated')).toBe(true);

    expect(nextItems).toHaveLength(3);
    expect(nextItems[1].id).toBe(11);
    expect(nextItems[2].id).toBe(12);
    expect(nextItems[1].groupId).toBe(nextGroups.find((g) => g.name === 'Expertcollege Generated')!.id);
    expect(nextItems[1].relatedStudyTextIds).toEqual(['st-1']);
    expect(nextItems[2].relatedStudyTextIds).toEqual(['st-2']);
  });

  it('reuses existing Expertcollege Generated group when present', () => {
    const target = {
      id: 'c1',
      groups: [{ id: 1, name: 'Group 1' }, { id: 99, name: 'Expertcollege Generated' }],
      items: [{ id: 1, groupId: 1, text: 'Q', options: ['a', 'b', 'c'], correctIndex: 0, explain: '', clusterId: 'c', variant: 'a' }],
    };
    const selected = [{ relatedStudyTextId: 'st-1', item: { id: 5, groupId: 1, text: 'N', options: ['x', 'y', 'z'], correctIndex: 0, explain: '', clusterId: 'c', variant: 'b' } }];
    const { nextGroups, nextItems } = mergeExpertcollegeGeneratedExercises({ targetCourse: target, selected });
    expect(nextGroups.filter((g) => g.name === 'Expertcollege Generated')).toHaveLength(1);
    expect(nextItems[1].groupId).toBe(99);
  });
});


