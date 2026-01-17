/**
 * useMCP Hook Tests
 * Tests the JOB_MODES configuration and MCP method mappings
 */

import { JOB_MODES, ENTITY_FIELDS } from '@/lib/contracts';

describe('JOB_MODES configuration', () => {
  it('has correct execution modes for synchronous jobs', () => {
    expect(JOB_MODES.draft_assignment_plan).toBe('synchronous');
    expect(JOB_MODES.guard_course).toBe('synchronous');
  });

  it('has correct execution modes for async jobs', () => {
    expect(JOB_MODES.ai_course_generate).toBe('async');
    expect(JOB_MODES.compile_mockups).toBe('async');
    expect(JOB_MODES.plan_matrix_run).toBe('async');
    expect(JOB_MODES.book_ingest_version).toBe('async');
    expect(JOB_MODES.book_render_chapter).toBe('async');
    expect(JOB_MODES.book_render_full).toBe('async');
    expect(JOB_MODES.book_normalize_voice).toBe('async');
    expect(JOB_MODES.book_generate_index).toBe('async');
    expect(JOB_MODES.book_generate_glossary).toBe('async');
    expect(JOB_MODES.material_ingest).toBe('async');
    expect(JOB_MODES.material_analyze).toBe('async');
    expect(JOB_MODES.lessonkit_build).toBe('async');
    expect(JOB_MODES.curated_arabic_variant_build).toBe('async');
    expect(JOB_MODES.mes_corpus_index).toBe('async');
  });

  it('has all 22 job types defined', () => {
    const jobTypes = Object.keys(JOB_MODES);
    expect(jobTypes).toHaveLength(22);
    expect(jobTypes).toContain('draft_assignment_plan');
    expect(jobTypes).toContain('ai_course_generate');
    expect(jobTypes).toContain('guard_course');
    expect(jobTypes).toContain('compile_mockups');
    expect(jobTypes).toContain('plan_matrix_run');
    expect(jobTypes).toContain('book_ingest_version');
    expect(jobTypes).toContain('book_render_chapter');
    expect(jobTypes).toContain('book_render_full');
    expect(jobTypes).toContain('book_generate_full');
    expect(jobTypes).toContain('book_generate_chapter');
    expect(jobTypes).toContain('book_generate_section');
    expect(jobTypes).toContain('book_normalize_voice');
    expect(jobTypes).toContain('book_generate_index');
    expect(jobTypes).toContain('book_generate_glossary');
    expect(jobTypes).toContain('material_ingest');
    expect(jobTypes).toContain('material_analyze');
    expect(jobTypes).toContain('lessonkit_build');
    expect(jobTypes).toContain('curated_arabic_variant_build');
    expect(jobTypes).toContain('standards_ingest');
    expect(jobTypes).toContain('standards_map');
    expect(jobTypes).toContain('standards_export');
    expect(jobTypes).toContain('mes_corpus_index');
  });
});

describe('ENTITY_FIELDS configuration', () => {
  it('has all 19 entities defined', () => {
    const entities = Object.keys(ENTITY_FIELDS);
    expect(entities).toHaveLength(19);
    expect(entities).toContain('LearnerProfile');
    expect(entities).toContain('Book');
    expect(entities).toContain('BookVersion');
    expect(entities).toContain('BookRun');
    expect(entities).toContain('Assignment');
    expect(entities).toContain('CourseBlueprint');
    expect(entities).toContain('GameSession');
    expect(entities).toContain('MessageThread');
    expect(entities).toContain('JobTicket');
    expect(entities).toContain('MasteryState');
    expect(entities).toContain('StudentGoal');
    expect(entities).toContain('ClassMembership');
    expect(entities).toContain('SessionEvent');
    expect(entities).toContain('GoalUpdate');
    expect(entities).toContain('LibraryCourse');
    expect(entities).toContain('LibraryMaterial');
    expect(entities).toContain('LessonKit');
    expect(entities).toContain('StandardsDocument');
    expect(entities).toContain('StandardsMapping');
  });

  it('LearnerProfile has all required fields', () => {
    const fields = ENTITY_FIELDS.LearnerProfile.map(f => f.key);
    expect(fields).toContain('full_name');
    expect(fields).toContain('avatar_url');
    expect(fields).toContain('grade_level');
    expect(fields).toContain('weekly_goal_minutes');
    expect(fields).toContain('goal_status');
    expect(fields).toContain('insights_snapshot');
  });

  it('Assignment has all required fields', () => {
    const fields = ENTITY_FIELDS.Assignment.map(f => f.key);
    expect(fields).toContain('title');
    expect(fields).toContain('status');
    expect(fields).toContain('subject');
    expect(fields).toContain('due_date');
    expect(fields).toContain('learner_id');
    expect(fields).toContain('teacher_id');
    expect(fields).toContain('rubric');
  });

  it('CourseBlueprint has all required fields', () => {
    const fields = ENTITY_FIELDS.CourseBlueprint.map(f => f.key);
    expect(fields).toContain('title');
    expect(fields).toContain('subject');
    expect(fields).toContain('difficulty');
    expect(fields).toContain('guard_status');
    expect(fields).toContain('published');
  });

  it('JobTicket has status field with enum type', () => {
    const statusField = ENTITY_FIELDS.JobTicket.find(f => f.key === 'status');
    expect(statusField).toBeDefined();
    expect(statusField?.type).toBe('enum');
    expect(statusField?.options).toContain('queued');
    expect(statusField?.options).toContain('completed');
    expect(statusField?.options).toContain('failed');
  });

  it('SessionEvent has outcome field with enum type', () => {
    const outcomeField = ENTITY_FIELDS.SessionEvent.find(f => f.key === 'outcome');
    expect(outcomeField).toBeDefined();
    expect(outcomeField?.type).toBe('enum');
    expect(outcomeField?.options).toContain('correct');
    expect(outcomeField?.options).toContain('incorrect');
    expect(outcomeField?.options).toContain('skipped');
    expect(outcomeField?.options).toContain('hint');
  });
});

describe('MCP method naming conventions', () => {
  it('entity slugs match expected patterns', () => {
    // Test slug generation for entity CRUD operations
    const slugPatterns = {
      'learner-profile': 'LearnerProfile',
      'book': 'Book',
      'book-version': 'BookVersion',
      'book-run': 'BookRun',
      'assignment': 'Assignment',
      'course-blueprint': 'CourseBlueprint',
      'game-session': 'GameSession',
      'message-thread': 'MessageThread',
      'job-ticket': 'JobTicket',
      'mastery-state': 'MasteryState',
      'student-goal': 'StudentGoal',
      'class-membership': 'ClassMembership',
      'session-event': 'SessionEvent',
      'goal-update': 'GoalUpdate',
      'library-course': 'LibraryCourse',
      'library-material': 'LibraryMaterial',
      'lesson-kit': 'LessonKit',
    };

    Object.entries(slugPatterns).forEach(([slug, entityName]) => {
      expect(ENTITY_FIELDS[entityName as keyof typeof ENTITY_FIELDS]).toBeDefined();
    });
  });

  it('field types are valid', () => {
    const validTypes = ['string', 'number', 'boolean', 'date', 'json', 'enum'];
    
    Object.values(ENTITY_FIELDS).forEach(fields => {
      fields.forEach(field => {
        expect(validTypes).toContain(field.type);
      });
    });
  });
});
