/**
 * Validation Rules & Zod Schemas
 * 
 * Provides validation schemas for LearnPlay Platform entities.
 * Based on system-manifest.json data model.
 */

import { z } from 'zod';

// =====================================================
// LEARNER PROFILE
// =====================================================

export const learnerProfileSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  avatar_url: z.string().url().optional().or(z.literal("")),
  grade_level: z.string().optional(),
  weekly_goal_minutes: z.number().min(1).max(600, "Goal must be 1-600 minutes"),
  current_assignment_id: z.string().uuid().optional().nullable(),
  goal_status: z.enum(["on_track", "behind", "ahead", "not_set"]).optional(),
  insights_snapshot: z.record(z.unknown()).optional(),
});

export type LearnerProfileInput = z.infer<typeof learnerProfileSchema>;

// =====================================================
// ASSIGNMENT
// =====================================================

export const assignmentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  status: z.enum(["draft", "scheduled", "in_progress", "graded", "archived"]).default("draft"),
  subject: z.string().min(1, "Subject is required"),
  due_date: z.string().datetime().optional().nullable().refine(
    (val) => !val || new Date(val) >= new Date(new Date().setHours(0, 0, 0, 0)),
    "Due date must be today or in the future"
  ),
  adaptive_cluster_id: z.string().optional().nullable(),
  ai_variant_id: z.string().optional().nullable(),
  learner_id: z.string().uuid(),
  teacher_id: z.string().uuid().optional().nullable(),
  rubric: z.record(z.unknown()).optional().nullable(),
  attachments: z.array(z.record(z.unknown())).optional().nullable(),
});

export type AssignmentInput = z.infer<typeof assignmentSchema>;

// =====================================================
// COURSE BLUEPRINT
// =====================================================

export const courseBlueprintSchema = z.object({
  title: z.string().min(1, "Course title is required"),
  subject: z.string().min(1, "Subject is required"),
  difficulty: z.enum(["elementary", "middle", "high", "college"]).default("middle"),
  catalog_path: z.string().optional().nullable(),
  multimedia_manifest: z.record(z.unknown()).optional().nullable(),
  guard_status: z.enum(["pending", "passed", "failed"]).default("pending"),
  published: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

export type CourseBlueprintInput = z.infer<typeof courseBlueprintSchema>;

// =====================================================
// MESSAGE THREAD
// =====================================================

export const messageThreadSchema = z.object({
  title: z.string().min(1, "Thread title is required"),
  participant_ids: z.array(z.string().uuid()).min(1, "At least one participant required"),
  last_message: z.string().optional().nullable(),
  unread_counts: z.record(z.number()).optional().nullable(),
  pinned: z.boolean().default(false),
});

export type MessageThreadInput = z.infer<typeof messageThreadSchema>;

// =====================================================
// JOB TICKET
// =====================================================

export const jobTicketSchema = z.object({
  job_type: z.string().min(1, "Job type is required"),
  status: z.enum(["queued", "running", "completed", "failed"]).default("queued"),
  payload: z.record(z.unknown()).optional().nullable(),
  result: z.record(z.unknown()).optional().nullable(),
  target_id: z.string().uuid().optional().nullable(),
});

export type JobTicketInput = z.infer<typeof jobTicketSchema>;

// =====================================================
// SESSION EVENT (Child Entity)
// =====================================================

export const sessionEventSchema = z.object({
  assignment_id: z.string().uuid(),
  question_ref: z.string().min(1),
  outcome: z.enum(["correct", "incorrect", "skipped", "hint"]),
  duration_seconds: z.number().min(0),
  transcript: z.string().optional().nullable(),
  confidence_score: z.number().min(0).max(1).optional().nullable(),
});

export type SessionEventInput = z.infer<typeof sessionEventSchema>;

// =====================================================
// GOAL UPDATE (Child Entity)
// =====================================================

export const goalUpdateSchema = z.object({
  learner_id: z.string().uuid(),
  week_of: z.string().datetime(),
  target_minutes: z.number().min(1).max(600),
  note: z.string().optional().nullable(),
});

export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;

// =====================================================
// VALIDATION HELPERS
// =====================================================

/**
 * Format Zod validation errors for display
 */
export function formatValidationError(error: z.ZodError): string {
  return (error.errors ?? []).map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
}

/**
 * Safe parse with formatted error
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: formatValidationError(result.error) };
}
