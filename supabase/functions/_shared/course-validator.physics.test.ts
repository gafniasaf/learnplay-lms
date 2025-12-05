import { validateCourse } from './course-validator.ts';
import type { FilledCourse } from './filler.ts';

jest.mock('./physics-heuristics.ts', () => {
  class PhysicsValidationError extends Error {}
  return {
    PhysicsValidationError,
    validatePhysicsConsistency: jest.fn((course: any) => {
      if (course.__physics === 'throw-generic') {
        throw new Error('generic');
      }
      if (course.__physics === 'throw-domain') {
        throw new PhysicsValidationError('inconsistent');
      }
      return true;
    }),
  };
});

describe('course-validator: physics errors', () => {
  function baseCourse(): FilledCourse {
    return {
      id: 'c',
      title: 't',
      description: 'd',
      subject: 's',
      gradeBand: 'g',
      contentVersion: 'v',
      groups: [{ id: 0, name: 'G' }],
      levels: [{ id: 1, title: 'L1', start: 0, end: 0 }],
      studyTexts: [{ id: 's1', title: 'S', order: 1, content: '[SECTION:X] ok' }],
      items: [{
        id: 0, text: 'Q [blank]', groupId: 0, clusterId: 'k', variant: '1', mode: 'numeric', answer: 1
      }],
    } as any;
  }

  it('adds physics_inconsistent when domain error thrown', () => {
    const course = baseCourse() as any;
    course.__physics = 'throw-domain';
    const result = validateCourse(course);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'physics_inconsistent')).toBe(true);
  });

  it('adds physics_validation_error when generic error thrown', () => {
    const course = baseCourse() as any;
    course.__physics = 'throw-generic';
    const result = validateCourse(course);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'physics_validation_error')).toBe(true);
  });
});


