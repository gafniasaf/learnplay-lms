/**
 * Validation Schema Tests
 * 
 * Tests for Zod validation schemas defined in src/lib/validation/rules.ts
 */

import {
  learnerProfileSchema,
  assignmentSchema,
  courseBlueprintSchema,
  messageThreadSchema,
  jobTicketSchema,
  sessionEventSchema,
  goalUpdateSchema,
  validateInput,
  formatValidationError,
} from '@/lib/validation/rules';

describe('learnerProfileSchema', () => {
  it('validates valid learner profile', () => {
    const valid = {
      full_name: 'Alice Student',
      weekly_goal_minutes: 120,
    };
    const result = learnerProfileSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty full_name', () => {
    const invalid = {
      full_name: '',
      weekly_goal_minutes: 120,
    };
    const result = learnerProfileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('required');
    }
  });

  it('rejects weekly_goal_minutes outside range', () => {
    const tooLow = { full_name: 'Test', weekly_goal_minutes: 0 };
    const tooHigh = { full_name: 'Test', weekly_goal_minutes: 700 };
    
    expect(learnerProfileSchema.safeParse(tooLow).success).toBe(false);
    expect(learnerProfileSchema.safeParse(tooHigh).success).toBe(false);
  });

  it('allows optional fields', () => {
    const minimal = {
      full_name: 'Test',
      weekly_goal_minutes: 60,
    };
    const result = learnerProfileSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

describe('assignmentSchema', () => {
  it('validates valid assignment', () => {
    const valid = {
      title: 'Math Homework',
      subject: 'Mathematics',
      learner_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    const result = assignmentSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const invalid = {
      title: '',
      subject: 'Math',
      learner_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    const result = assignmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requires learner_id as UUID', () => {
    const invalid = {
      title: 'Test',
      subject: 'Math',
      learner_id: 'not-a-uuid',
    };
    const result = assignmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('has default status of draft', () => {
    const minimal = {
      title: 'Test',
      subject: 'Math',
      learner_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    const result = assignmentSchema.parse(minimal);
    expect(result.status).toBe('draft');
  });
});

describe('courseBlueprintSchema', () => {
  it('validates valid course blueprint', () => {
    const valid = {
      title: 'Introduction to Physics',
      subject: 'Science',
    };
    const result = courseBlueprintSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const invalid = { title: '', subject: 'Science' };
    const result = courseBlueprintSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects empty subject', () => {
    const invalid = { title: 'Test', subject: '' };
    const result = courseBlueprintSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates difficulty enum', () => {
    const valid = { title: 'Test', subject: 'Math', difficulty: 'high' };
    const invalid = { title: 'Test', subject: 'Math', difficulty: 'expert' }; // Not in enum
    
    expect(courseBlueprintSchema.safeParse(valid).success).toBe(true);
    expect(courseBlueprintSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('messageThreadSchema', () => {
  it('validates valid thread', () => {
    const valid = {
      title: 'Homework Help',
      participant_ids: ['550e8400-e29b-41d4-a716-446655440000'],
    };
    const result = messageThreadSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('requires at least one participant', () => {
    const invalid = {
      title: 'Empty Thread',
      participant_ids: [],
    };
    const result = messageThreadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('jobTicketSchema', () => {
  it('validates valid job ticket', () => {
    const valid = {
      job_type: 'ai_course_generate',
    };
    const result = jobTicketSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('has default status of queued', () => {
    const minimal = { job_type: 'test' };
    const result = jobTicketSchema.parse(minimal);
    expect(result.status).toBe('queued');
  });
});

describe('sessionEventSchema', () => {
  it('validates valid session event', () => {
    const valid = {
      assignment_id: '550e8400-e29b-41d4-a716-446655440000',
      question_ref: 'q1',
      outcome: 'correct',
      duration_seconds: 30,
    };
    const result = sessionEventSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('validates outcome enum', () => {
    const validOutcomes = ['correct', 'incorrect', 'skipped', 'hint'];
    validOutcomes.forEach(outcome => {
      const event = {
        assignment_id: '550e8400-e29b-41d4-a716-446655440000',
        question_ref: 'q1',
        outcome,
        duration_seconds: 10,
      };
      expect(sessionEventSchema.safeParse(event).success).toBe(true);
    });
  });
});

describe('goalUpdateSchema', () => {
  it('validates valid goal update', () => {
    const valid = {
      learner_id: '550e8400-e29b-41d4-a716-446655440000',
      week_of: '2025-01-06T00:00:00.000Z',
      target_minutes: 120,
    };
    const result = goalUpdateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects target_minutes outside range', () => {
    const tooLow = {
      learner_id: '550e8400-e29b-41d4-a716-446655440000',
      week_of: '2025-01-06T00:00:00.000Z',
      target_minutes: 0,
    };
    expect(goalUpdateSchema.safeParse(tooLow).success).toBe(false);
  });
});

describe('validateInput helper', () => {
  it('returns success for valid data', () => {
    const result = validateInput(learnerProfileSchema, {
      full_name: 'Test User',
      weekly_goal_minutes: 60,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.full_name).toBe('Test User');
    }
  });

  it('returns formatted error for invalid data', () => {
    const result = validateInput(learnerProfileSchema, {
      full_name: '',
      weekly_goal_minutes: 60,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('full_name');
    }
  });
});

describe('formatValidationError', () => {
  it('formats Zod errors correctly', () => {
    const result = learnerProfileSchema.safeParse({ full_name: '', weekly_goal_minutes: 0 });
    if (!result.success) {
      const formatted = formatValidationError(result.error);
      expect(formatted).toContain('full_name');
    }
  });
});
