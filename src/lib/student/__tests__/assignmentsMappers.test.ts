import { mapStudentAssignment } from '@/lib/student/assignmentsMappers';
import type { Assignment } from '@/lib/api/assignments';

describe('mapStudentAssignment', () => {
  it('maps Supabase assignment records to UI shape', () => {
    const record: Assignment = {
      id: 'assign-1',
      course_id: 'algebra-101',
      title: 'Algebra Practice',
      due_at: '2025-11-05T00:00:00.000Z',
      created_at: '2025-10-31T12:00:00.000Z',
    };

    expect(mapStudentAssignment(record)).toEqual({
      id: 'assign-1',
      title: 'Algebra Practice',
      courseId: 'algebra-101',
      dueAt: '2025-11-05T00:00:00.000Z',
    });
  });

  it('falls back when optional fields are missing', () => {
    const record: Assignment = {
      id: 'assign-2',
      course_id: 'literature-201',
      title: '',
      due_at: null,
      created_at: '2025-10-31T12:00:00.000Z',
    };

    expect(mapStudentAssignment(record)).toEqual({
      id: 'assign-2',
      title: 'Assignment',
      courseId: 'literature-201',
      dueAt: null,
    });
  });
});
