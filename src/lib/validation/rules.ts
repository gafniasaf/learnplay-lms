/**
 * Validation Rules
 * 
 * AUTO-GENERATED from PLAN.md Section F.5
 * Edit the plan, not this file.
 */

import { z } from 'zod';


/**
 * LearnerProfile Validation
 */
export const learnerprofileValidationRules = {
  full_name: {
    rule: 'min 1 char',
    message: '"Name is required"',
  },
  weekly_goal_minutes: {
    rule: '1-600',
    message: '"Goal must be 1-600 minutes"',
  },
};

// TODO: Convert rules to Zod schema
// export const learnerprofileSchema = z.object({ ... });


/**
 * Assignment Validation
 */
export const assignmentValidationRules = {
  title: {
    rule: 'min 1 char',
    message: '"Title is required"',
  },
  due_date: {
    rule: '>= today (if set)',
    message: '"Due date must be in the future"',
  },
};

// TODO: Convert rules to Zod schema
// export const assignmentSchema = z.object({ ... });


/**
 * CourseBlueprint Validation
 */
export const courseblueprintValidationRules = {
  title: {
    rule: 'min 1 char',
    message: '"Course title is required"',
  },
  subject: {
    rule: 'min 1 char',
    message: '"Subject is required"',
  },
};

// TODO: Convert rules to Zod schema
// export const courseblueprintSchema = z.object({ ... });

