import { aggregateStudentGoalProgress } from '@/lib/student/goalsMappers';
import type { StudentGoalsResponse } from '@/lib/api/studentGoals';

describe('aggregateStudentGoalProgress', () => {
  it('summarises active goal minutes and completed counts', () => {
    const response: StudentGoalsResponse = {
      goals: [
        {
          id: 'goal-1',
          studentId: 'student-1',
          title: 'Read 30 minutes',
          targetMinutes: 120,
          progressMinutes: 90,
          dueAt: '2025-11-05T00:00:00.000Z',
          status: 'on_track',
          teacherNote: null,
          createdAt: '2025-10-31T12:00:00.000Z',
          updatedAt: '2025-10-31T12:00:00.000Z',
        },
        {
          id: 'goal-2',
          studentId: 'student-1',
          title: 'Complete 5 practice sets',
          targetMinutes: 60,
          progressMinutes: 60,
          dueAt: '2025-11-03T00:00:00.000Z',
          status: 'completed',
          teacherNote: null,
          createdAt: '2025-10-30T12:00:00.000Z',
          updatedAt: '2025-10-30T12:00:00.000Z',
        },
      ],
      summary: {
        total: 2,
        onTrack: 1,
        behind: 0,
        completed: 1,
      },
    };

    const result = aggregateStudentGoalProgress(response);

    expect(result).toEqual({
      goalMinutes: 120,
      actualMinutes: 90,
      goalItems: 2,
      actualItems: 1,
    });
  });

  it('returns null when the API has no goals', () => {
    const response: StudentGoalsResponse = {
      goals: [],
      summary: {
        total: 0,
        onTrack: 0,
        behind: 0,
        completed: 0,
      },
    };

    expect(aggregateStudentGoalProgress(response)).toBeNull();
  });
});
