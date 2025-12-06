import { z } from "zod";

/**
 * Count placeholders in text (_ or [blank])
 */
function countPlaceholders(text: string): number {
  const underscoreCount = (text.match(/_/g) || []).length;
  const blankCount = (text.match(/\[blank\]/g) || []).length;
  return underscoreCount + blankCount;
}

/**
 * Course v2 Schema - Strict validation for all courses
 */

export const CourseGroupSchemaV2 = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  color: z.string().optional(),
});

export const CourseLevelSchemaV2 = z.object({
  id: z.number().int().nonnegative(),
  title: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  description: z.string().optional(),
  minScore: z.number().optional(),
}).refine(
  (level) => level.end >= level.start,
  { message: "Level end must be >= start", path: ["end"] }
);

export const CourseItemSchemaV2 = z.object({
  id: z.number().int().nonnegative(),
  text: z.string().min(1),
  groupId: z.number().int().nonnegative(),
  clusterId: z.string().min(1),
  variant: z.enum(["1", "2", "3"]),
  mode: z.enum(["options", "numeric"]),
  options: z.array(z.string()).optional(),
  correctIndex: z.number().int().nonnegative().optional(),
  answer: z.number().optional(),
  hint: z.string().optional(),
  explain: z.string().optional(),
  wrongExplanations: z.array(z.string()).optional(),
  stimulus: z.union([
    z.object({
      type: z.literal('image'),
      url: z.string().url(),
      alt: z.string().optional(),
      placement: z.enum(['block', 'inline']).optional(),
    }),
    z.object({
      type: z.literal('audio'),
      url: z.string().url(),
      transcriptUrl: z.string().url().optional(),
      placement: z.enum(['block', 'inline']).optional(),
    }),
    z.object({
      type: z.literal('video'),
      url: z.string().url(),
      captionsUrl: z.string().url().optional(),
      placement: z.enum(['block', 'inline']).optional(),
    }),
  ]).optional(),
  optionMedia: z.array(
    z.union([
      z.object({
        type: z.literal('image'),
        url: z.string().url(),
        alt: z.string().optional(),
      }),
      z.object({
        type: z.literal('audio'),
        url: z.string().url(),
        transcriptUrl: z.string().url().optional(),
      }),
      z.object({
        type: z.literal('video'),
        url: z.string().url(),
        captionsUrl: z.string().url().optional(),
      }),
      z.null(),
    ])
  ).optional(),
})
  .refine(
    (item) => {
      const placeholderCount = countPlaceholders(item.text);
      return placeholderCount === 1;
    },
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

export const CourseSchemaV2 = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subject: z.string().optional(),
  locale: z.string().optional(),
  contentVersion: z.string().optional(),
  description: z.string().optional(),
  groups: z.array(CourseGroupSchemaV2).min(1),
  levels: z.array(CourseLevelSchemaV2).min(1),
  items: z.array(CourseItemSchemaV2).min(1),
});

// Export TypeScript types
export type CourseV2 = z.infer<typeof CourseSchemaV2>;
export type CourseGroupV2 = z.infer<typeof CourseGroupSchemaV2>;
export type CourseLevelV2 = z.infer<typeof CourseLevelSchemaV2>;
export type CourseItemV2 = z.infer<typeof CourseItemSchemaV2>;
