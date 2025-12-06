/**
 * Validation Rules Tests
 */

import {
  learnerprofileValidationRules,
  assignmentValidationRules,
  courseblueprintValidationRules,
} from '@/lib/validation/rules';

describe('learnerprofileValidationRules', () => {
  it('has full_name validation rule', () => {
    expect(learnerprofileValidationRules.full_name).toBeDefined();
    expect(learnerprofileValidationRules.full_name.rule).toBe('min 1 char');
    expect(learnerprofileValidationRules.full_name.message).toContain('Name is required');
  });

  it('has weekly_goal_minutes validation rule', () => {
    expect(learnerprofileValidationRules.weekly_goal_minutes).toBeDefined();
    expect(learnerprofileValidationRules.weekly_goal_minutes.rule).toBe('1-600');
    expect(learnerprofileValidationRules.weekly_goal_minutes.message).toContain('1-600');
  });
});

describe('assignmentValidationRules', () => {
  it('has title validation rule', () => {
    expect(assignmentValidationRules.title).toBeDefined();
    expect(assignmentValidationRules.title.rule).toBe('min 1 char');
    expect(assignmentValidationRules.title.message).toContain('Title is required');
  });

  it('has due_date validation rule', () => {
    expect(assignmentValidationRules.due_date).toBeDefined();
    expect(assignmentValidationRules.due_date.rule).toContain('today');
    expect(assignmentValidationRules.due_date.message).toContain('future');
  });
});

describe('courseblueprintValidationRules', () => {
  it('has title validation rule', () => {
    expect(courseblueprintValidationRules.title).toBeDefined();
    expect(courseblueprintValidationRules.title.rule).toBe('min 1 char');
    expect(courseblueprintValidationRules.title.message).toContain('Course title');
  });

  it('has subject validation rule', () => {
    expect(courseblueprintValidationRules.subject).toBeDefined();
    expect(courseblueprintValidationRules.subject.rule).toBe('min 1 char');
    expect(courseblueprintValidationRules.subject.message).toContain('Subject');
  });
});

describe('validation rule structure', () => {
  it('all rules have required properties', () => {
    const allRules = [
      ...Object.values(learnerprofileValidationRules),
      ...Object.values(assignmentValidationRules),
      ...Object.values(courseblueprintValidationRules),
    ];

    allRules.forEach(rule => {
      expect(rule).toHaveProperty('rule');
      expect(rule).toHaveProperty('message');
      expect(typeof rule.rule).toBe('string');
      expect(typeof rule.message).toBe('string');
    });
  });
});


