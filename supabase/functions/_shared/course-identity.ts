export class CourseIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseIdentityError';
  }
}

export interface CourseLike {
  id?: string;
  [key: string]: unknown;
}

export function enforceCourseId<T extends CourseLike>(course: T, expectedId: string): T {
  if (!expectedId) {
    throw new CourseIdentityError('Expected course id must be provided');
  }

  if (!course || typeof course !== 'object') {
    throw new CourseIdentityError('Course payload must be an object');
  }

  const currentId = course.id;

  if (currentId === undefined || currentId === null || currentId === '') {
    course.id = expectedId;
    return course;
  }

  if (currentId !== expectedId) {
    throw new CourseIdentityError(`Course id mismatch: expected ${expectedId} but received ${currentId}`);
  }

  return course;
}

