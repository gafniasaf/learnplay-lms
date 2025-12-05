// @ts-ignore Deno remote import is valid at runtime
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { validateContentByFormat } from "./format-registry.ts";

export const EnvelopeSchema = z.object({
  id: z.string().min(1),
  format: z.string().min(1),
  version: z.union([z.number(), z.string()]).optional(),
  content: z.record(z.any()),
});

export const ItemRefSchema = z.object({
  type: z.enum(["study_text", "item_stimulus", "item_option"]),
  courseId: z.string().min(1).optional(),
  itemId: z.number().int().nonnegative().optional(),
  optionIndex: z.number().int().nonnegative().optional(),
  sectionId: z.union([z.string(), z.number()]).optional(),
}).superRefine((val, ctx) => {
  if (val.type !== "study_text" && (val.itemId === undefined || val.itemId === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "itemId is required for non-study_text refs" });
  }
  if (val.type === "item_option" && (val.optionIndex === undefined || val.optionIndex === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "optionIndex is required for item_option refs" });
  }
});

export const AttachmentSchema = z.object({
  imageUrl: z.string().min(1).or(z.string().url()),
  purpose: z.string().min(1),
  alt: z.string().optional(),
  targetRef: ItemRefSchema,
});

export const AttachmentsSchema = z.array(AttachmentSchema);

export type Envelope = z.infer<typeof EnvelopeSchema>;
export type ItemRef = z.infer<typeof ItemRefSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;

// Generic helpers
export const idNum = z.number().int().nonnegative();
export const idStr = z.string().min(1).max(64).regex(/^[a-z0-9\-]+$/i);
export const uuid = z.string().uuid();
export const isoDate = z.string().datetime({ offset: true });

// Sanitizer
export function sanitizeText(input: unknown, max = 2000): string {
  let s = (typeof input === "string" ? input : "").slice(0, max);
  // strip control chars and angle brackets
  s = s.replace(/[<>\u0000-\u001F\u007F]/g, "");
  return s;
}

// Game schemas
export const StartRoundSchema = z.object({
  courseId: idStr,
  level: z.number().int().nonnegative().optional(),
  contentVersion: z.string().min(1).max(64).optional(),
  assignmentId: z.string().uuid().optional(),
});

// Relaxed schema supporting both options and numeric modes
export const LogAttemptSchema = z.object({
  roundId: uuid,
  itemId: idNum.optional(),
  itemKey: z.string().min(1).max(64),
  selectedIndex: z.number().int().min(0).max(10).optional(),
  answerValue: z.number().optional(),
  isCorrect: z.boolean().optional(),
  action: z.enum(["correct", "wrong"]).optional(),
  latencyMs: z.number().int().min(0).max(120000),
  finalize: z.boolean().optional().default(false),
  endRound: z.object({
    baseScore: z.number().int().min(0),
    mistakes: z.number().int().min(0),
    elapsedSeconds: z.number().int().min(0),
    distinctItems: z.number().int().min(0),
  }).optional(),
})
  .refine(
    (data) => data.selectedIndex !== undefined || data.answerValue !== undefined,
    { message: "Either selectedIndex or answerValue must be provided", path: ["selectedIndex"] }
  )
  .refine(
    (data) => typeof data.isCorrect === "boolean" || typeof data.action === "string",
    { message: "Provide either isCorrect or action" }
  );

export const EndRoundSchema = z.object({
  roundId: uuid,
});

// Assignment schemas
export const CreateAssignmentSchema = z.object({
  title: z.string().min(1).max(200),
  courseId: idStr,
  orgId: uuid,
  dueAt: isoDate.optional(),
  assignees: z.array(z.object({
    type: z.enum(["student", "class"]),
    id: uuid,
  })).min(1),
});

export const ListAssignmentsSchema = z.object({
  orgId: uuid.optional(),
  studentId: uuid.optional(),
});

// Helper to count placeholders (_ or [blank])
function countPlaceholders(text: string): number {
  const underscoreCount = (text.match(/_/g) || []).length;
  const blankCount = (text.match(/\[blank\]/g) || []).length;
  return underscoreCount + blankCount;
}

// Course authoring (Course v2 with numeric mode support)
const Group = z.object({ 
  id: idNum, 
  name: z.string().min(1).max(120),
  color: z.string().optional()
});

const Level = z.object({
  id: idNum, 
  title: z.string().min(1).max(120),
  start: idNum, 
  end: idNum,
  description: z.string().optional(),
  minScore: z.number().optional()
}).refine(
  (level) => level.end >= level.start,
  { message: "Level end must be >= start", path: ["end"] }
);

const StudyText = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  order: idNum,
  learningObjectives: z.array(z.string()).optional(),
  metadata: z.object({
    difficulty: z.string().optional(),
    estimatedReadingTime: z.number().optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
});

const Item = z.object({
  id: idNum,
  text: z.string().min(1).max(400),
  groupId: idNum,
  clusterId: z.string().min(1).max(64),
  variant: z.enum(["1","2","3"]),
  mode: z.enum(["options", "numeric"]),
  options: z.array(z.string().min(1).max(40)).optional(),
  correctIndex: z.number().int().nonnegative().optional(),
  answer: z.number().optional(),
  hint: z.string().max(200).optional(),
  explain: z.string().max(200).optional(),
  wrongExplanations: z.array(z.string()).optional(),
  relatedStudyTextIds: z.array(z.string()).optional(),
  learningObjectiveId: z.string().optional(),
})
  .refine(
    (item) => countPlaceholders(item.text) === 1,
    { message: "Item text must contain exactly 1 placeholder (_ or [blank])", path: ["text"] }
  )
  .refine(
    (item) => {
      if (item.mode === "options") {
        // Options mode: must have options array (3-4 items) and valid correctIndex
        if (!item.options || item.options.length < 3 || item.options.length > 4) {
          return false;
        }
        if (item.correctIndex === undefined || item.correctIndex < 0 || item.correctIndex >= item.options.length) {
          return false;
        }
        return true;
      }
      if (item.mode === "numeric") {
        // Numeric mode: must have answer, no options
        if (item.options !== undefined) {
          return false;
        }
        if (item.answer === undefined) {
          return false;
        }
        return true;
      }
      return false;
    },
    {
      message: "options-mode requires options (3-4 items) and correctIndex; numeric-mode requires answer and no options",
      path: ["mode"],
    }
  );

export const CourseSchema = z.object({
  id: idStr, 
  title: z.string().min(1).max(120), 
  subject: z.string().min(1).max(120).optional(),
  locale: z.string().optional(),
  contentVersion: z.string(),
  gradeBand: z.string().optional(),
  description: z.string().max(500).optional(),
  duration: z.string().optional(),
  difficulty: z.string().optional(),
  studyTexts: z.array(StudyText).optional(),
  groups: z.array(Group).min(1),
  levels: z.array(Level).min(1),
  items: z.array(Item).min(1)
});

// Dashboard schema
export const GetDashboardSchema = z.object({
  role: z.enum(["student", "teacher", "parent", "school", "admin"]).optional(),
});

// Class schemas
export const ListClassesSchema = z.object({
  orgId: uuid.optional(),
});

export const GetClassProgressSchema = z.object({
  classId: uuid,
  courseId: idStr.optional(),
});

// Helper function for validation errors
export function formatValidationError(error: z.ZodError): string {
  return error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(", ");
}

// Validate course invariants after merges/patches (deterministic merge guard)
export function validateCourseIntegrity(course: unknown): { ok: true } | { ok: false; error: string } {
  const parsed = CourseSchema.safeParse(course);
  if (!parsed.success) {
    return { ok: false, error: formatValidationError(parsed.error) };
  }
  return { ok: true };
}

// Optional format-aware content validation (Envelope-level)
export function validateEnvelopeContent(envelope: unknown): { ok: true } | { ok: false; error: string } {
  const envParsed = EnvelopeSchema.safeParse(envelope);
  if (!envParsed.success) {
    return { ok: false, error: formatValidationError(envParsed.error) };
  }
  const env = envParsed.data;
  const fmt = String(env.format || '').trim();
  const res = validateContentByFormat(fmt, env.content);
  if (!res.ok) {
    return { ok: false, error: res.issues.join("; ") };
  }
  return { ok: true };
}
