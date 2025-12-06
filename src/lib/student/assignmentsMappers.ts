import type { Assignment } from '@/lib/api/assignments';

export interface StudentAssignmentDisplay {
  id: string;
  title: string;
  courseId: string;
  dueAt: string | null;
}

const normalizeTitle = (title?: string | null) => {
  if (typeof title === 'string' && title.trim().length > 0) {
    return title.trim();
  }
  return 'Assignment';
};

const normalizeCourseId = (courseId?: string | null) => {
  if (typeof courseId === 'string' && courseId.trim().length > 0) {
    return courseId.trim();
  }
  return 'course';
};

export function mapStudentAssignment(assignment: Assignment): StudentAssignmentDisplay {
  return {
    id: assignment.id,
    title: normalizeTitle(assignment.title),
    courseId: normalizeCourseId(assignment.course_id as string | undefined),
    dueAt: assignment.due_at ?? null,
  };
}

