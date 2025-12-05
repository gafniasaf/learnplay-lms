/**
 * Contracts Schema Tests
 * Tests for all Zod schemas in contracts.ts
 */

import {
  LearnerProfileSchema,
  AssignmentSchema,
  CourseBlueprintSchema,
  MessageThreadSchema,
  JobTicketSchema,
  SessionEventSchema,
  GoalUpdateSchema,
  JobPayloadSchema,
  JOB_MODES,
  ENTITY_FIELDS,
} from '@/lib/contracts';

describe('LearnerProfileSchema', () => {
  const validProfile = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
  };

  it('accepts valid learner profile with required fields', () => {
    const result = LearnerProfileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it('accepts profile with all optional fields', () => {
    const fullProfile = {
      ...validProfile,
      full_name: 'John Doe',
      avatar_url: 'https://example.com/avatar.jpg',
      grade_level: '5th',
      weekly_goal_minutes: 60,
      current_assignment_id: '123e4567-e89b-12d3-a456-426614174002',
      goal_status: 'on_track',
      insights_snapshot: { accuracy: 85 },
    };
    const result = LearnerProfileSchema.safeParse(fullProfile);
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for id', () => {
    const invalid = { ...validProfile, id: 'not-a-uuid' };
    const result = LearnerProfileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing organization_id', () => {
    const { organization_id, ...invalid } = validProfile;
    const result = LearnerProfileSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('sets default version and format', () => {
    const result = LearnerProfileSchema.parse(validProfile);
    expect(result.version).toBe(1);
    expect(result.format).toBe('v1');
  });
});

describe('AssignmentSchema', () => {
  const validAssignment = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    status: 'draft' as const,
  };

  it('accepts valid assignment with required fields', () => {
    const result = AssignmentSchema.safeParse(validAssignment);
    expect(result.success).toBe(true);
  });

  it('accepts all valid status values', () => {
    const statuses = ['draft', 'scheduled', 'in_progress', 'graded', 'archived'];
    statuses.forEach(status => {
      const result = AssignmentSchema.safeParse({ ...validAssignment, status });
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid status', () => {
    const invalid = { ...validAssignment, status: 'invalid' };
    const result = AssignmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts assignment with all optional fields', () => {
    const fullAssignment = {
      ...validAssignment,
      title: 'Math Practice',
      subject: 'Mathematics',
      due_date: '2025-12-31T00:00:00Z',
      adaptive_cluster_id: 'cluster-1',
      ai_variant_id: 'variant-1',
      learner_id: '123e4567-e89b-12d3-a456-426614174002',
      teacher_id: '123e4567-e89b-12d3-a456-426614174003',
      rubric: { criteria: [] },
      attachments: [],
    };
    const result = AssignmentSchema.safeParse(fullAssignment);
    expect(result.success).toBe(true);
  });
});

describe('CourseBlueprintSchema', () => {
  const validBlueprint = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    difficulty: 'middle' as const,
    guard_status: 'pending' as const,
  };

  it('accepts valid course blueprint', () => {
    const result = CourseBlueprintSchema.safeParse(validBlueprint);
    expect(result.success).toBe(true);
  });

  it('accepts all valid difficulty levels', () => {
    const levels = ['elementary', 'middle', 'high', 'college'];
    levels.forEach(difficulty => {
      const result = CourseBlueprintSchema.safeParse({ ...validBlueprint, difficulty });
      expect(result.success).toBe(true);
    });
  });

  it('accepts all valid guard_status values', () => {
    const statuses = ['pending', 'passed', 'failed'];
    statuses.forEach(guard_status => {
      const result = CourseBlueprintSchema.safeParse({ ...validBlueprint, guard_status });
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid difficulty', () => {
    const invalid = { ...validBlueprint, difficulty: 'expert' };
    const result = CourseBlueprintSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('MessageThreadSchema', () => {
  const validThread = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
  };

  it('accepts valid message thread', () => {
    const result = MessageThreadSchema.safeParse(validThread);
    expect(result.success).toBe(true);
  });

  it('accepts thread with all fields', () => {
    const fullThread = {
      ...validThread,
      title: 'Math Help',
      participant_ids: ['user-1', 'user-2'],
      last_message: 'Thanks!',
      unread_counts: { 'user-1': 2 },
      pinned: true,
    };
    const result = MessageThreadSchema.safeParse(fullThread);
    expect(result.success).toBe(true);
  });
});

describe('JobTicketSchema', () => {
  const validJob = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    status: 'queued' as const,
  };

  it('accepts valid job ticket', () => {
    const result = JobTicketSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it('accepts all valid status values', () => {
    const statuses = ['queued', 'running', 'completed', 'failed'];
    statuses.forEach(status => {
      const result = JobTicketSchema.safeParse({ ...validJob, status });
      expect(result.success).toBe(true);
    });
  });

  it('accepts job with payload and result', () => {
    const fullJob = {
      ...validJob,
      job_type: 'draft_assignment_plan',
      payload: { title: 'Math' },
      result: { summary: 'Done' },
      target_id: '123e4567-e89b-12d3-a456-426614174002',
    };
    const result = JobTicketSchema.safeParse(fullJob);
    expect(result.success).toBe(true);
  });
});

describe('SessionEventSchema', () => {
  const validEvent = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
    outcome: 'correct' as const,
  };

  it('accepts valid session event', () => {
    const result = SessionEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('accepts all valid outcome values', () => {
    const outcomes = ['correct', 'incorrect', 'skipped', 'hint'];
    outcomes.forEach(outcome => {
      const result = SessionEventSchema.safeParse({ ...validEvent, outcome });
      expect(result.success).toBe(true);
    });
  });

  it('accepts event with all optional fields', () => {
    const fullEvent = {
      ...validEvent,
      assignment_id: '123e4567-e89b-12d3-a456-426614174002',
      question_ref: 'q-1',
      duration_seconds: 15,
      transcript: 'Answer was A',
      confidence_score: 0.95,
    };
    const result = SessionEventSchema.safeParse(fullEvent);
    expect(result.success).toBe(true);
  });
});

describe('GoalUpdateSchema', () => {
  const validGoal = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organization_id: '123e4567-e89b-12d3-a456-426614174001',
  };

  it('accepts valid goal update', () => {
    const result = GoalUpdateSchema.safeParse(validGoal);
    expect(result.success).toBe(true);
  });

  it('accepts goal with all fields', () => {
    const fullGoal = {
      ...validGoal,
      learner_id: '123e4567-e89b-12d3-a456-426614174002',
      week_of: '2025-01-06T00:00:00Z',
      target_minutes: 120,
      note: 'Increased goal for test prep',
    };
    const result = GoalUpdateSchema.safeParse(fullGoal);
    expect(result.success).toBe(true);
  });
});

describe('JobPayloadSchema', () => {
  it('accepts draft_assignment_plan job', () => {
    const payload = {
      jobType: 'draft_assignment_plan' as const,
      payload: { title: 'Math Practice' },
    };
    const result = JobPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts ai_course_generate job', () => {
    const payload = {
      jobType: 'ai_course_generate' as const,
      payload: { subject: 'Science' },
    };
    const result = JobPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts guard_course job', () => {
    const payload = {
      jobType: 'guard_course' as const,
      payload: {},
    };
    const result = JobPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts compile_mockups job', () => {
    const payload = {
      jobType: 'compile_mockups' as const,
    };
    const result = JobPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts plan_matrix_run job', () => {
    const payload = {
      jobType: 'plan_matrix_run' as const,
    };
    const result = JobPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects unknown job type', () => {
    const payload = {
      jobType: 'unknown_job',
    };
    const result = JobPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('JOB_MODES', () => {
  it('has correct execution modes for all jobs', () => {
    expect(JOB_MODES.draft_assignment_plan).toBe('synchronous');
    expect(JOB_MODES.ai_course_generate).toBe('async');
    expect(JOB_MODES.guard_course).toBe('synchronous');
    expect(JOB_MODES.compile_mockups).toBe('async');
    expect(JOB_MODES.plan_matrix_run).toBe('async');
  });
});

describe('ENTITY_FIELDS', () => {
  it('has field definitions for all entities', () => {
    expect(ENTITY_FIELDS.LearnerProfile).toBeDefined();
    expect(ENTITY_FIELDS.Assignment).toBeDefined();
    expect(ENTITY_FIELDS.CourseBlueprint).toBeDefined();
    expect(ENTITY_FIELDS.MessageThread).toBeDefined();
    expect(ENTITY_FIELDS.JobTicket).toBeDefined();
    expect(ENTITY_FIELDS.SessionEvent).toBeDefined();
    expect(ENTITY_FIELDS.GoalUpdate).toBeDefined();
  });

  it('LearnerProfile has expected fields', () => {
    const fields = ENTITY_FIELDS.LearnerProfile.map(f => f.key);
    expect(fields).toContain('full_name');
    expect(fields).toContain('weekly_goal_minutes');
    expect(fields).toContain('grade_level');
  });

  it('Assignment has expected fields', () => {
    const fields = ENTITY_FIELDS.Assignment.map(f => f.key);
    expect(fields).toContain('title');
    expect(fields).toContain('status');
    expect(fields).toContain('subject');
    expect(fields).toContain('due_date');
  });
});

